import { lockBillingQuotaSubject } from "./admission";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@sammlerraum/db/search-sql";
import {
  BillingError,
  VerifiedBillingEventSchema,
  BillingSubscriptionSnapshotSchema as snapshot,
} from "@sammlerraum/contracts/billing";
import { MembershipError } from "@sammlerraum/contracts/collaboration";
import type { VerifiedBillingEvent, BillingSyncProvider } from "@sammlerraum/billing/types";
import {
  runTransferTransaction,
  type MembershipDatabase,
} from "../collaboration/transfer-transaction";
import type { BoundedSearchReadTransaction } from "../search/search-read";
type Receipt = {
  id: string;
  subjectId: string | null;
  eventId: string;
  digest: string;
  event: VerifiedBillingEvent;
  status: "PENDING" | "PROCESSING" | "APPLIED" | "IGNORED";
  attemptCount: number;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
};
type Account = { subjectId: string; providerCustomerId: string; syncToken: string | null };
const fail = (code: BillingError["code"]): never => {
  throw new BillingError(code);
};
/** Signed hints are durable; entitlement writes come only from fenced current provider reads. */
export function createBillingWebhookService(
  database: MembershipDatabase,
  config: { providerId: string; liveMode: boolean },
) {
  if (!/^[a-z][a-z0-9_-]{0,31}$/u.test(config.providerId)) return fail("BILLING_UNAVAILABLE");
  async function tx<T>(work: (t: BoundedSearchReadTransaction) => Promise<T>) {
    try {
      return await runTransferTransaction(database, work);
    } catch (e) {
      if (e instanceof BillingError) throw e;
      if (e instanceof MembershipError) throw new BillingError("BILLING_UNAVAILABLE");
      throw new BillingError("BILLING_UNAVAILABLE");
    }
  }
  async function lockAccount(t: BoundedSearchReadTransaction, customerId: string) {
    const [hint] = await t.$queryRaw<{ subjectId: string }[]>(
      Prisma.sql`SELECT "subjectId" FROM "BillingAccount" WHERE provider=${config.providerId} AND "providerCustomerId"=${customerId}`,
    );
    if (!hint) return null;
    const [user] = await t.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM "user" WHERE id=${hint.subjectId} FOR NO KEY UPDATE`,
    );
    if (!user) return null;
    const [account] = await t.$queryRaw<Account[]>(
      Prisma.sql`SELECT "subjectId","providerCustomerId","syncToken" FROM "BillingAccount" WHERE provider=${config.providerId} AND "providerCustomerId"=${customerId} AND "subjectId"=${hint.subjectId} FOR UPDATE`,
    );
    return account ?? null;
  }
  async function receiveEvent(input: VerifiedBillingEvent) {
    const parsed = VerifiedBillingEventSchema.safeParse(input);
    if (!parsed.success || parsed.data.liveMode !== config.liveMode)
      return fail("BILLING_INVALID_REQUEST");
    const event = parsed.data;
    return tx(async (t) => {
      const account = event.customerId ? await lockAccount(t, event.customerId) : null;
      await t.$queryRaw(
        Prisma.sql`INSERT INTO "BillingWebhookReceipt" (id,"subjectId",provider,"eventId",digest,event,"createdAt","nextAttemptAt") VALUES (${randomUUID()}::uuid,${account?.subjectId ?? null},${config.providerId},${event.eventId},${event.digest},${JSON.stringify(event)}::jsonb,clock_timestamp(),clock_timestamp()) ON CONFLICT(provider,"eventId") DO NOTHING`,
      );
      const [row] = await t.$queryRaw<Receipt[]>(
        Prisma.sql`SELECT * FROM "BillingWebhookReceipt" WHERE provider=${config.providerId} AND "eventId"=${event.eventId}`,
      );
      if (!row) return fail("BILLING_UNAVAILABLE");
      if (row.digest !== event.digest) return fail("BILLING_EVENT_CONFLICT");
      return {
        id: row.id,
        status: row.status === "APPLIED" || row.status === "IGNORED" ? row.status : "PENDING",
      };
    });
  }
  async function processReceipt(
    id: string,
    provider: BillingSyncProvider,
    options: { signal?: AbortSignal } = {},
  ) {
    if (!z.string().uuid().safeParse(id).success || provider.id !== config.providerId)
      return fail("BILLING_INVALID_REQUEST");
    const token = randomUUID();
    const receipt = await tx(async (t) => {
      const [row] = await t.$queryRaw<Receipt[]>(
        Prisma.sql`UPDATE "BillingWebhookReceipt" SET status='PROCESSING',"leaseToken"=${token}::uuid,"leaseExpiresAt"=clock_timestamp()+interval '90 seconds',"attemptCount"="attemptCount"+1 WHERE id=${id}::uuid AND provider=${config.providerId} AND ((status='PENDING' AND "nextAttemptAt"<=clock_timestamp()) OR (status='PROCESSING' AND "leaseExpiresAt"<=clock_timestamp())) RETURNING *`,
      );
      return row ?? null;
    });
    if (!receipt) return { status: "UNCHANGED" as const };
    const event = VerifiedBillingEventSchema.parse(receipt.event),
      controller = new AbortController(),
      deadline = setTimeout(() => controller.abort(), 60000);
    deadline.unref();
    const signal = options.signal
      ? AbortSignal.any([controller.signal, options.signal])
      : controller.signal;
    let account: Account | null = null,
      accountToken: string | null = null;
    async function finish(status: "APPLIED" | "IGNORED") {
      await tx(async (t) => {
        if (account) {
          const current = await lockAccount(t, account.providerCustomerId);
          if (!current || current.syncToken !== accountToken) return fail("BILLING_CONFLICT");
        }
        const [updated] = await t.$queryRaw<{ id: string }[]>(
          Prisma.sql`UPDATE "BillingWebhookReceipt" SET status=${status},"appliedAt"=clock_timestamp(),"leaseToken"=NULL,"leaseExpiresAt"=NULL,"lastErrorCode"=NULL WHERE id=${id}::uuid AND status='PROCESSING' AND "leaseToken"=${token}::uuid AND "leaseExpiresAt">clock_timestamp() RETURNING id`,
        );
        if (!updated) return fail("BILLING_CONFLICT");
        if (account)
          await t.$queryRaw(
            Prisma.sql`UPDATE "BillingAccount" SET "syncToken"=NULL,"syncExpiresAt"=NULL WHERE "subjectId"=${account.subjectId} AND provider=${config.providerId} AND "syncToken"=${accountToken}::uuid`,
          );
      });
      return { status };
    }
    try {
      signal.throwIfAborted();
      const customerId = event.customerId ?? (await provider.resolveCustomer(event, { signal }));
      signal.throwIfAborted();
      if (!customerId) return await finish("IGNORED");
      accountToken = randomUUID();
      const claim = await tx(async (t) => {
        const a = await lockAccount(t, customerId);
        if (!a) return null;
        const [held] = await t.$queryRaw<Account[]>(
          Prisma.sql`UPDATE "BillingAccount" SET "syncToken"=${accountToken}::uuid,"syncExpiresAt"=clock_timestamp()+interval '90 seconds' WHERE "subjectId"=${a.subjectId} AND provider=${config.providerId} AND ("syncToken" IS NULL OR "syncExpiresAt"<=clock_timestamp()) RETURNING "subjectId","providerCustomerId","syncToken"`,
        );
        if (!held) return fail("BILLING_CONFLICT");
        await t.$queryRaw(
          Prisma.sql`UPDATE "BillingWebhookReceipt" SET "subjectId"=${held.subjectId} WHERE id=${id}::uuid AND "leaseToken"=${token}::uuid`,
        );
        return held;
      });
      if (!claim) return await finish("IGNORED");
      account = claim;
      const raw = await provider.readEventState(event, customerId, { signal });
      signal.throwIfAborted();
      const parsed = z.array(snapshot).max(100).safeParse(raw);
      if (!parsed.success || parsed.data.some((s) => s.customerId !== customerId))
        return fail("BILLING_UNAVAILABLE");
      await tx(async (t) => {
        signal.throwIfAborted();
        const a = await lockAccount(t, customerId);
        if (!a || a.syncToken !== accountToken) return fail("BILLING_CONFLICT");
        await lockBillingQuotaSubject(t, a.subjectId);
        const [fresh] = await t.$queryRaw<{ valid: boolean }[]>(
          Prisma.sql`SELECT "syncExpiresAt">clock_timestamp() AS valid FROM "BillingAccount" WHERE "subjectId"=${a.subjectId} AND provider=${config.providerId}`,
        );
        if (!fresh?.valid) return fail("BILLING_CONFLICT");
        const [r] = await t.$queryRaw<Receipt[]>(
          Prisma.sql`SELECT * FROM "BillingWebhookReceipt" WHERE id=${id}::uuid AND status='PROCESSING' AND "leaseToken"=${token}::uuid AND "leaseExpiresAt">clock_timestamp() FOR UPDATE`,
        );
        if (!r) return fail("BILLING_CONFLICT");
        for (const state of parsed.data) {
          const [saved] = await t.$queryRaw<{ id: string }[]>(
            Prisma.sql`INSERT INTO "BillingSubscription" (id,"subjectId",provider,"providerSubscriptionId",status,"currentPeriodStart","currentPeriodEnd","cancelAtPeriodEnd","providerUpdatedAt","syncedAt","planEligible","riskReason","riskThrough") VALUES (${randomUUID()}::uuid,${a.subjectId},${config.providerId},${state.subscriptionId},${state.status}::"BillingSubscriptionStatus",${state.currentPeriodStart},${state.currentPeriodEnd},${state.cancelAtPeriodEnd},clock_timestamp(),clock_timestamp(),${state.planEligible},${state.risk?.reason ?? null},${state.risk?.through ?? null}) ON CONFLICT(provider,"providerSubscriptionId") DO UPDATE SET status=EXCLUDED.status,"currentPeriodStart"=EXCLUDED."currentPeriodStart","currentPeriodEnd"=EXCLUDED."currentPeriodEnd","cancelAtPeriodEnd"=EXCLUDED."cancelAtPeriodEnd","providerUpdatedAt"=GREATEST("BillingSubscription"."providerUpdatedAt",clock_timestamp()),"syncedAt"=clock_timestamp(),"planEligible"=EXCLUDED."planEligible","riskReason"=CASE WHEN "BillingSubscription"."riskReason" IN ('DISPUTE','FRAUD') THEN "BillingSubscription"."riskReason" ELSE COALESCE(EXCLUDED."riskReason","BillingSubscription"."riskReason") END,"riskThrough"=CASE WHEN "BillingSubscription"."riskReason" IN ('DISPUTE','FRAUD') OR EXCLUDED."riskReason" IN ('DISPUTE','FRAUD') THEN NULL ELSE GREATEST("BillingSubscription"."riskThrough",EXCLUDED."riskThrough") END WHERE "BillingSubscription"."subjectId"=EXCLUDED."subjectId" RETURNING id`,
          );
          if (!saved) return fail("BILLING_CONFLICT");
        }
        await t.$queryRaw(
          Prisma.sql`UPDATE "BillingWebhookReceipt" SET status=${parsed.data.length ? "APPLIED" : "IGNORED"},"appliedAt"=clock_timestamp(),"leaseToken"=NULL,"leaseExpiresAt"=NULL,"lastErrorCode"=NULL WHERE id=${id}::uuid AND "leaseToken"=${token}::uuid`,
        );
        await t.$queryRaw(
          Prisma.sql`UPDATE "BillingAccount" SET "syncToken"=NULL,"syncExpiresAt"=NULL WHERE "subjectId"=${a.subjectId} AND provider=${config.providerId} AND "syncToken"=${accountToken}::uuid`,
        );
      });
      return { status: parsed.data.length ? "APPLIED" : "IGNORED" };
    } catch (error) {
      const code =
        error instanceof BillingError && error.code === "BILLING_CONFLICT"
          ? "BILLING_CONFLICT"
          : "BILLING_UNAVAILABLE";
      await tx(async (t) => {
        if (account) {
          const a = await lockAccount(t, account.providerCustomerId);
          if (a?.syncToken === accountToken)
            await t.$queryRaw(
              Prisma.sql`UPDATE "BillingAccount" SET "syncToken"=NULL,"syncExpiresAt"=NULL WHERE "subjectId"=${a.subjectId} AND provider=${config.providerId} AND "syncToken"=${accountToken}::uuid`,
            );
        }
        await t.$queryRaw(
          Prisma.sql`UPDATE "BillingWebhookReceipt" SET status='PENDING',"leaseToken"=NULL,"leaseExpiresAt"=NULL,"lastErrorCode"=${code},"nextAttemptAt"=clock_timestamp()+make_interval(secs=>LEAST(3600,30*power(2,LEAST("attemptCount"-1,7)))::int) WHERE id=${id}::uuid AND status='PROCESSING' AND "leaseToken"=${token}::uuid`,
        );
      });
      return { status: "PENDING" };
    } finally {
      clearTimeout(deadline);
    }
  }
  async function dispatchCandidates(limit = 32) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 32) return fail("BILLING_INVALID_REQUEST");
    return tx(async (t) =>
      (
        await t.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM "BillingWebhookReceipt" WHERE provider=${config.providerId} AND ((status='PENDING' AND "nextAttemptAt"<=clock_timestamp()) OR (status='PROCESSING' AND "leaseExpiresAt"<=clock_timestamp())) AND ("lastDispatchedAt" IS NULL OR "lastDispatchedAt"<clock_timestamp()-interval '20 seconds') ORDER BY "createdAt",id LIMIT ${limit}`,
        )
      ).map((row) => row.id),
    );
  }
  async function noteDispatched(id: string) {
    if (!z.string().uuid().safeParse(id).success) return fail("BILLING_INVALID_REQUEST");
    await tx(async (t) => {
      await t.$queryRaw(
        Prisma.sql`UPDATE "BillingWebhookReceipt" SET "lastDispatchedAt"=clock_timestamp() WHERE id=${id}::uuid AND provider=${config.providerId} AND status IN ('PENDING','PROCESSING')`,
      );
    });
  }
  return { receiveEvent, processReceipt, dispatchCandidates, noteDispatched };
}
