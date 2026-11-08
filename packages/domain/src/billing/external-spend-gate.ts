import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@sammlerraum/db/search-sql";
import type { MembershipDatabase } from "../collaboration/transfer-transaction";

/** Conservative admission, not an invoice estimate. Reservations are never refunded on
 * timeout, erasure or restart: an uncertain HTTP call may already have been charged.
 * Only opaque hashes and aggregate costs are retained, independently of user records.
 */
export function createExternalSpendGate(
  database: MembershipDatabase,
  input: {
    providerId: string;
    monthlyLimitCents: number;
    fixedMonthlyCostCents: number;
    callReservationCents: number;
  },
) {
  const config = z
    .strictObject({
      providerId: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/u),
      monthlyLimitCents: z.number().int().min(1).max(2500),
      fixedMonthlyCostCents: z.number().int().min(0).max(2500),
      callReservationCents: z.number().int().min(1).max(2500),
    })
    .parse(input);
  return {
    async reserve(callId: string): Promise<boolean> {
      const key = createHash("sha256").update(z.uuid().parse(callId)).digest("hex");
      return database.$transaction(
        async (tx) => {
          const [clock] = await tx.$queryRaw<{ month: string }[]>(Prisma.sql`
          SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-01') AS month,
          set_config('statement_timeout','2000ms',true),
          set_config('lock_timeout','1000ms',true),
          set_config('transaction_timeout','5000ms',true)`);
          if (!clock) throw Error("Spend fence unavailable");
          // One shared row serializes all providers. A restart cannot raise a ceiling
          // already used this month or forget fixed fees previously admitted.
          await tx.$queryRaw(Prisma.sql`
          INSERT INTO "ExternalSpendMonth"(month,"ceilingCents","fixedCostCents")
          VALUES (${clock.month}::date,${config.monthlyLimitCents},${config.fixedMonthlyCostCents})
          ON CONFLICT(month) DO UPDATE SET
          "ceilingCents"=LEAST("ExternalSpendMonth"."ceilingCents",EXCLUDED."ceilingCents"),
          "fixedCostCents"=GREATEST("ExternalSpendMonth"."fixedCostCents",EXCLUDED."fixedCostCents")`);
          const existing = await tx.$queryRaw<{ key: string }[]>(Prisma.sql`
          SELECT key FROM "ExternalSpendReservation" WHERE key=${key}`);
          if (existing.length) return false;
          const admitted = await tx.$queryRaw<{ month: Date }[]>(Prisma.sql`
          UPDATE "ExternalSpendMonth"
          SET "reservedCents"="reservedCents"+${config.callReservationCents}
          WHERE month=${clock.month}::date
          AND "fixedCostCents"+"reservedCents"+${config.callReservationCents} <= "ceilingCents"
          RETURNING month`);
          if (!admitted.length) return false;
          await tx.$queryRaw(Prisma.sql`
          INSERT INTO "ExternalSpendReservation"(key,month,"providerId","amountCents")
          VALUES (${key},${clock.month}::date,${config.providerId},${config.callReservationCents})`);
          return true;
        },
        { isolationLevel: "ReadCommitted", maxWait: 2000, timeout: 5000 },
      );
    },
  };
}
