import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@sammlerraum/db/search-sql";
import { BillingError } from "@sammlerraum/contracts/billing";
import { MembershipActorIdSchema, MembershipError } from "@sammlerraum/contracts/collaboration";
import type { BillingProvider, BillingCadence, BillingLocale } from "@sammlerraum/billing/types";
import {
  runTransferTransaction,
  type MembershipDatabase,
} from "../collaboration/transfer-transaction";
import type { BoundedSearchReadTransaction } from "../search/search-read";
const common = { requestKey: z.string().uuid(), locale: z.enum(["de", "en"]) };
const checkoutSchema = z.strictObject({ ...common, cadence: z.enum(["MONTHLY", "YEARLY"]) }),
  portalSchema = z.strictObject(common);
type Operation = {
  id: string;
  subjectId: string;
  provider: string;
  requestKey: string;
  requestDigest: string;
  purpose: "CHECKOUT" | "PORTAL";
  cadence: BillingCadence | null;
  locale: BillingLocale;
  status: "PENDING" | "READY";
  dispatchCount: number;
  providerSessionId: string | null;
  url: string | null;
  expiresAt: Date;
  createdAt: Date;
};
type Account = { providerCustomerId: string | null; customerRequestKey: string };
const fail = (code: BillingError["code"]): never => {
  throw new BillingError(code);
};
function receipt(op: Operation) {
  if (!op.url || !op.providerSessionId) return fail("BILLING_UNAVAILABLE");
  return {
    id: op.providerSessionId,
    url: op.url,
    cadence: op.cadence,
    expiresAt: op.expiresAt.toISOString(),
  };
}
/** Durable local reservations; provider calls run only after a transaction has fully closed. */
export function createBillingSessionService(
  database: MembershipDatabase,
  provider: BillingProvider,
) {
  if (!/^[a-z][a-z0-9_-]{0,31}$/u.test(provider.id)) return fail("BILLING_UNAVAILABLE");
  async function transaction<T>(work: (tx: BoundedSearchReadTransaction) => Promise<T>) {
    try {
      return await runTransferTransaction(database, work);
    } catch (e) {
      if (e instanceof BillingError) throw e;
      if (e instanceof MembershipError)
        throw new BillingError(
          e.code === "MEMBERSHIP_CONFLICT" ? "BILLING_CONFLICT" : "BILLING_UNAVAILABLE",
        );
      throw new BillingError("BILLING_UNAVAILABLE");
    }
  }
  async function own(tx: BoundedSearchReadTransaction, who: string) {
    const [user] = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM "user" WHERE id=${who} AND "emailVerified" FOR UPDATE`,
    );
    if (!user) return fail("BILLING_NOT_FOUND");
  }
  async function account(tx: BoundedSearchReadTransaction, who: string) {
    const [value] = await tx.$queryRaw<Account[]>(
      Prisma.sql`SELECT "providerCustomerId","customerRequestKey" FROM "BillingAccount" WHERE "subjectId"=${who} AND provider=${provider.id} FOR UPDATE`,
    );
    if (!value) return fail("BILLING_NOT_FOUND");
    return value;
  }
  async function execute(actor: { userId: string }, purpose: "CHECKOUT" | "PORTAL", raw: unknown) {
    const subject = MembershipActorIdSchema.safeParse(actor?.userId),
      data = (purpose === "CHECKOUT" ? checkoutSchema : portalSchema).safeParse(raw);
    if (!subject.success) return fail("BILLING_NOT_FOUND");
    if (!data.success) return fail("BILLING_INVALID_REQUEST");
    const who = subject.data,
      input = data.data,
      cadence = "cadence" in input ? (input.cadence as BillingCadence) : null;
    const digest = createHash("sha256")
      .update(JSON.stringify({ purpose, cadence, locale: input.locale }))
      .digest("hex");
    const reserved = await transaction(async (tx) => {
      await own(tx, who);
      const [prior] = await tx.$queryRaw<Operation[]>(
        Prisma.sql`SELECT * FROM "BillingOperation" WHERE "subjectId"=${who} AND "requestKey"=${input.requestKey}::uuid FOR UPDATE`,
      );
      if (prior && (prior.requestDigest !== digest || prior.provider !== provider.id))
        return fail("BILLING_CONFLICT");
      if (prior) {
        const [clock] = await tx.$queryRaw<{ valid: boolean }[]>(
          Prisma.sql`SELECT ${prior.expiresAt}::timestamp>clock_timestamp() AS valid`,
        );
        if (!clock?.valid) return fail("BILLING_CONFLICT");
        if (prior.status === "READY") return { op: prior, account: await account(tx, who) };
      }
      if (purpose === "PORTAL") {
        const a = await account(tx, who);
        if (!a.providerCustomerId) return fail("BILLING_NOT_FOUND");
      }
      if (purpose === "CHECKOUT" && !prior) {
        const [active] = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM "BillingSubscription" WHERE "subjectId"=${who} AND provider=${provider.id} AND status IN ('ACTIVE','TRIALING') AND "currentPeriodStart"<=clock_timestamp() AND "currentPeriodEnd">clock_timestamp() LIMIT 1`,
        );
        if (active) return fail("BILLING_CONFLICT");
        const [pending] = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM "BillingOperation" WHERE "subjectId"=${who} AND provider=${provider.id} AND purpose='CHECKOUT' AND "expiresAt">clock_timestamp() LIMIT 1`,
        );
        if (pending) return fail("BILLING_CONFLICT");
      }
      if (!prior) {
        const [count] = await tx.$queryRaw<{ n: number }[]>(
          Prisma.sql`SELECT count(*)::int AS n FROM (SELECT 1 FROM "BillingOperation" WHERE "subjectId"=${who} AND "createdAt">clock_timestamp()-interval '1 hour' LIMIT 10) q`,
        );
        if ((count?.n ?? 10) >= 10) return fail("BILLING_CONFLICT");
      }
      if (purpose === "CHECKOUT")
        await tx.$queryRaw(
          Prisma.sql`INSERT INTO "BillingAccount" ("subjectId",provider) VALUES (${who},${provider.id}) ON CONFLICT ("subjectId",provider) DO NOTHING`,
        );
      const a = await account(tx, who);
      let op = prior;
      if (!op) {
        const [created] = await tx.$queryRaw<Operation[]>(
          Prisma.sql`INSERT INTO "BillingOperation" (id,"subjectId",provider,"requestKey","requestDigest",purpose,cadence,locale,"createdAt","expiresAt") VALUES (${randomUUID()}::uuid,${who},${provider.id},${input.requestKey}::uuid,${digest},${purpose},${cadence},${input.locale},clock_timestamp(),date_trunc('second',clock_timestamp())+${purpose === "CHECKOUT" ? "1 hour" : "5 minutes"}::interval) RETURNING *`,
        );
        op = created;
      }
      if (!op || op.dispatchCount >= 5) return fail("BILLING_UNAVAILABLE");
      // A not-yet-created Stripe session cannot be started with <30 minutes remaining.
      if (purpose === "CHECKOUT") {
        const [fresh] = await tx.$queryRaw<{ valid: boolean }[]>(
          Prisma.sql`SELECT ${op.expiresAt}::timestamp>clock_timestamp()+interval '31 minutes' AS valid`,
        );
        if (!fresh?.valid) return fail("BILLING_CONFLICT");
      }
      await tx.$queryRaw(
        Prisma.sql`UPDATE "BillingOperation" SET "dispatchCount"="dispatchCount"+1 WHERE id=${op.id}::uuid`,
      );
      return { op, account: a };
    });
    if (reserved.op.status === "READY") return receipt(reserved.op);
    let customerId = reserved.account.providerCustomerId;
    try {
      if (!customerId) {
        const created = await provider.createCustomer({
          subjectId: who,
          requestKey: reserved.account.customerRequestKey,
        });
        if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,254}$/u.test(created))
          return fail("BILLING_UNAVAILABLE");
        customerId = await transaction(async (tx) => {
          await own(tx, who);
          const current = await account(tx, who);
          if (current.customerRequestKey !== reserved.account.customerRequestKey)
            return fail("BILLING_CONFLICT");
          if (current.providerCustomerId && current.providerCustomerId !== created)
            return fail("BILLING_CONFLICT");
          if (!current.providerCustomerId)
            await tx.$queryRaw(
              Prisma.sql`UPDATE "BillingAccount" SET "providerCustomerId"=${created} WHERE "subjectId"=${who} AND provider=${provider.id}`,
            );
          return created;
        });
      }
      await transaction(async (tx) => {
        await own(tx, who);
        if ((await account(tx, who)).providerCustomerId !== customerId)
          return fail("BILLING_CONFLICT");
      });
      const op = reserved.op,
        result =
          purpose === "CHECKOUT"
            ? await provider.createCheckout({
                subjectId: who,
                customerId,
                cadence: cadence!,
                locale: input.locale,
                requestKey: op.id,
                expiresAt: op.expiresAt,
              })
            : await provider.createPortalSession({
                customerId,
                locale: input.locale,
                requestKey: op.id,
              });
      if (
        purpose === "CHECKOUT" &&
        (!("expiresAt" in result) ||
          !(result.expiresAt instanceof Date) ||
          result.expiresAt.getTime() !== op.expiresAt.getTime())
      )
        return fail("BILLING_UNAVAILABLE");
      return await transaction(async (tx) => {
        await own(tx, who);
        if ((await account(tx, who)).providerCustomerId !== customerId)
          return fail("BILLING_CONFLICT");
        const [current] = await tx.$queryRaw<Operation[]>(
          Prisma.sql`SELECT * FROM "BillingOperation" WHERE id=${op.id}::uuid AND "subjectId"=${who} FOR UPDATE`,
        );
        if (!current) return fail("BILLING_NOT_FOUND");
        if (current.status === "READY") {
          if (current.providerSessionId !== result.id || current.url !== result.url)
            return fail("BILLING_CONFLICT");
          return receipt(current);
        }
        const [saved] = await tx.$queryRaw<Operation[]>(
          Prisma.sql`UPDATE "BillingOperation" SET status='READY',"providerSessionId"=${result.id},url=${result.url} WHERE id=${op.id}::uuid AND "expiresAt">clock_timestamp() RETURNING *`,
        );
        if (!saved) return fail("BILLING_CONFLICT");
        return receipt(saved);
      });
    } catch (e) {
      if (e instanceof BillingError) throw e;
      throw new BillingError("BILLING_UNAVAILABLE");
    }
  }
  return {
    checkout: (actor: { userId: string }, input: unknown) => execute(actor, "CHECKOUT", input),
    portal: (actor: { userId: string }, input: unknown) => execute(actor, "PORTAL", input),
  };
}
