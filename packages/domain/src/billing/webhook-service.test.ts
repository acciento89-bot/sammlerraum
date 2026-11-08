import { StripeBillingProvider } from "@sammlerraum/billing/stripe-provider";
import { randomUUID, createHash } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createEntitlementService } from "./entitlement-service";
const tier = {
  ITEM_CREATE: 10,
  MEDIA_COUNT: 10,
  MEDIA_BYTES: 1000,
  AI_MONTHLY: 2,
  IMPORT_PROFILES: 1,
  MARKET_DATA: false,
  EXTENDED_HISTORY: false,
  ADVANCED_ANALYTICS: false,
  XLSX: false,
  ADVANCED_FILTERS: false,
};
const policy = { FREE: tier, PREMIUM: { ...tier, XLSX: true } };
async function implementation() {
  const path = "./webhook-service",
    m = await import(path).catch(() => null);
  expect(m?.createBillingWebhookService, "durable canonical sync service").toBeTypeOf("function");
  return m!.createBillingWebhookService;
}
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "canonical signed billing receipt sync",
  () => {
    let db: ReturnType<typeof createTestDatabaseClient>,
      isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    async function fixture() {
      const owner = "billing-hook-" + randomUUID(),
        customerId = "cus_" + randomUUID(),
        subscriptionId = "sub_" + randomUUID();
      await db.user.create({
        data: {
          id: owner,
          email: owner + "@example.invalid",
          name: "Hook fixture",
          emailVerified: true,
        },
      });
      await db.$executeRaw`INSERT INTO "BillingAccount" ("subjectId",provider,"providerCustomerId") VALUES (${owner},'stripe',${customerId})`;
      const snapshot: import("@sammlerraum/billing/types").BillingSubscriptionSnapshot = {
        subscriptionId,
        customerId,
        status: "ACTIVE",
        currentPeriodStart: new Date(Date.now() - 3600000),
        currentPeriodEnd: new Date(Date.now() + 3600000),
        cancelAtPeriodEnd: false,
        planEligible: true,
        risk: null,
      };
      const provider = {
        id: "stripe",
        async resolveCustomer() {
          return customerId;
        },
        async readEventState() {
          return [snapshot];
        },
      };
      const event = (created = 100) => ({
        eventId: "evt_" + randomUUID().replaceAll("-", ""),
        type: "customer.subscription.updated",
        created,
        liveMode: false,
        customerId,
        subscriptionId,
        invoiceId: null,
        chargeId: null,
        paymentIntentId: null,
        digest: createHash("sha256").update(randomUUID()).digest("hex"),
      });
      const service = (await implementation())(db, { providerId: "stripe", liveMode: false });
      return { owner, customerId, subscriptionId, snapshot, provider, event, service };
    }
    it("durably deduplicates an event, then applies one locally owned canonical snapshot", async () => {
      const f = await fixture(),
        event = f.event();
      const a = await f.service.receiveEvent(event),
        b = await f.service.receiveEvent(event);
      expect(a).toEqual(b);
      await f.service.processReceipt(a.id, f.provider);
      await f.service.processReceipt(a.id, f.provider);
      expect(
        await db.$queryRaw`SELECT count(*)::int AS n FROM "BillingWebhookReceipt" WHERE "eventId"=${event.eventId}`,
      ).toEqual([{ n: 1 }]);
      expect(
        await createEntitlementService(db, policy, { providerIds: ["stripe"] }).getEntitlements(
          f.owner,
        ),
      ).toMatchObject({
        plan: "PREMIUM",
      });
    });
    it("an older delivered event reads current canonical state instead of resurrecting an expired grant", async () => {
      const f = await fixture();
      await f.service.processReceipt((await f.service.receiveEvent(f.event(200))).id, f.provider);
      f.snapshot.status = "CANCELED";
      await f.service.processReceipt((await f.service.receiveEvent(f.event(100))).id, f.provider);
      expect(
        (
          await createEntitlementService(db, policy, { providerIds: ["stripe"] }).getEntitlements(
            f.owner,
          )
        ).plan,
      ).toBe("FREE");
    });
    it("rejects altered duplicate event bodies and test/live crossover", async () => {
      const f = await fixture(),
        e = f.event();
      await f.service.receiveEvent(e);
      await expect(f.service.receiveEvent({ ...e, digest: "a".repeat(64) })).rejects.toMatchObject({
        code: "BILLING_EVENT_CONFLICT",
      });
      await expect(f.service.receiveEvent({ ...f.event(), liveMode: true })).rejects.toMatchObject({
        code: "BILLING_INVALID_REQUEST",
      });
    });
    it("never attaches a canonical foreign customer subscription using event hints", async () => {
      const f = await fixture();
      f.snapshot.customerId = "cus_foreign";
      await f.service.processReceipt((await f.service.receiveEvent(f.event())).id, f.provider);
      expect(
        (
          await createEntitlementService(db, policy, { providerIds: ["stripe"] }).getEntitlements(
            f.owner,
          )
        ).plan,
      ).toBe("FREE");
      expect(
        await db.$queryRaw`SELECT count(*)::int AS n FROM "BillingSubscription" WHERE "subjectId"=${f.owner}`,
      ).toEqual([{ n: 0 }]);
    });
    it("keeps transient provider failure durably retryable and never claims it applied", async () => {
      const f = await fixture(),
        receipt = await f.service.receiveEvent(f.event());
      f.provider.readEventState = async () => {
        throw new Error("private-provider-failure");
      };
      await f.service.processReceipt(receipt.id, f.provider);
      const [state] = await db.$queryRaw<
        { status: string; lastErrorCode: string; future: boolean }[]
      >`SELECT status,"lastErrorCode","nextAttemptAt">(clock_timestamp() AT TIME ZONE 'UTC') AS future FROM "BillingWebhookReceipt" WHERE id=${receipt.id}::uuid`;
      expect(state).toEqual({
        status: "PENDING",
        lastErrorCode: "BILLING_UNAVAILABLE",
        future: true,
      });
      expect(
        (
          await createEntitlementService(db, policy, { providerIds: ["stripe"] }).getEntitlements(
            f.owner,
          )
        ).plan,
      ).toBe("FREE");
    });
    it("a delayed stale lease cannot re-grant after a successor reconciles cancellation", async () => {
      const f = await fixture(),
        first = await f.service.receiveEvent(f.event(200));
      let begin!: () => void, release!: () => void;
      const started = new Promise<void>((r) => (begin = r)),
        gate = new Promise<void>((r) => (release = r));
      const old = structuredClone(f.snapshot);
      let reads = 0;
      f.provider.readEventState = async () => {
        if (++reads === 1) {
          begin();
          await gate;
          return [old];
        }
        return [f.snapshot];
      };
      const pending = f.service.processReceipt(first.id, f.provider);
      await started;
      await db.$executeRaw`UPDATE "BillingAccount" SET "syncExpiresAt"=(clock_timestamp() AT TIME ZONE 'UTC')-interval '1 second' WHERE "subjectId"=${f.owner}`;
      f.snapshot.status = "CANCELED";
      await f.service.processReceipt((await f.service.receiveEvent(f.event(100))).id, f.provider);
      release();
      await pending;
      expect(
        (
          await createEntitlementService(db, policy, { providerIds: ["stripe"] }).getEntitlements(
            f.owner,
          )
        ).plan,
      ).toBe("FREE");
      expect(
        await db.$queryRaw`SELECT status::text FROM "BillingSubscription" WHERE "subjectId"=${f.owner}`,
      ).toEqual([{ status: "CANCELED" }]);
    });
    it("serializes different receipts on the actual account without holding provider I/O in a transaction", async () => {
      const f = await fixture();
      let begin!: () => void, release!: () => void;
      const started = new Promise<void>((r) => (begin = r)),
        gate = new Promise<void>((r) => (release = r));
      let reads = 0;
      f.provider.readEventState = async () => {
        if (++reads === 1) {
          begin();
          await gate;
        }
        return [f.snapshot];
      };
      const first = f.service.processReceipt(
        (await f.service.receiveEvent(f.event())).id,
        f.provider,
      );
      await started;
      const second = await f.service.receiveEvent(f.event());
      await f.service.processReceipt(second.id, f.provider);
      expect(reads).toBe(1);
      release();
      await first;
      f.snapshot.status = "CANCELED";
      await db.$executeRaw`UPDATE "BillingWebhookReceipt" SET "nextAttemptAt"=(clock_timestamp() AT TIME ZONE 'UTC')-interval '1 second' WHERE id=${second.id}::uuid`;
      await f.service.processReceipt(second.id, f.provider);
      expect(
        (
          await createEntitlementService(db, policy, { providerIds: ["stripe"] }).getEntitlements(
            f.owner,
          )
        ).plan,
      ).toBe("FREE");
    });
    it("ordinary active events cannot clear a persisted dispute hold", async () => {
      const f = await fixture();
      f.snapshot.risk = { reason: "DISPUTE", through: null };
      await f.service.processReceipt((await f.service.receiveEvent(f.event())).id, f.provider);
      f.snapshot.risk = null;
      await f.service.processReceipt((await f.service.receiveEvent(f.event())).id, f.provider);
      expect(
        (
          await createEntitlementService(db, policy, { providerIds: ["stripe"] }).getEntitlements(
            f.owner,
          )
        ).plan,
      ).toBe("FREE");
    });
    it("a refunded historical period does not revoke a newer fully paid period", async () => {
      const f = await fixture();
      f.snapshot.risk = {
        reason: "REFUND",
        through: new Date(f.snapshot.currentPeriodStart.getTime() - 1000),
      };
      await f.service.processReceipt((await f.service.receiveEvent(f.event())).id, f.provider);
      expect(
        (
          await createEntitlementService(db, policy, { providerIds: ["stripe"] }).getEntitlements(
            f.owner,
          )
        ).plan,
      ).toBe("PREMIUM");
    });
    it("unmanaged canonical prices cannot grant Premium even with an active status", async () => {
      const f = await fixture();
      f.snapshot.planEligible = false;
      await f.service.processReceipt((await f.service.receiveEvent(f.event())).id, f.provider);
      expect(
        (
          await createEntitlementService(db, policy, { providerIds: ["stripe"] }).getEntitlements(
            f.owner,
          )
        ).plan,
      ).toBe("FREE");
    });
    it("actual account erasure cascades local customer mappings, subscriptions and owned event hints", async () => {
      const f = await fixture(),
        e = f.event();
      await f.service.processReceipt((await f.service.receiveEvent(e)).id, f.provider);
      await db.user.delete({ where: { id: f.owner } });
      expect(
        await db.$queryRaw`SELECT count(*)::int AS n FROM "BillingWebhookReceipt" WHERE "eventId"=${e.eventId}`,
      ).toEqual([{ n: 0 }]);
      expect(
        await db.$queryRaw`SELECT count(*)::int AS n FROM "BillingSubscription" WHERE "subjectId"=${f.owner}`,
      ).toEqual([{ n: 0 }]);
    });

    it("dispatches only due receipts and recovers an expired processing lease", async () => {
      const f = await fixture(),
        r = await f.service.receiveEvent(f.event());
      expect(await f.service.dispatchCandidates(32)).toContain(r.id);
      await f.service.noteDispatched(r.id);
      expect(await f.service.dispatchCandidates(32)).not.toContain(r.id);
      await db.$executeRaw`UPDATE "BillingWebhookReceipt" SET status='PROCESSING',"leaseToken"=${randomUUID()}::uuid,"leaseExpiresAt"=(clock_timestamp() AT TIME ZONE 'UTC')-interval '1 second',"lastDispatchedAt"=(clock_timestamp() AT TIME ZONE 'UTC')-interval '1 minute' WHERE id=${r.id}::uuid`;
      expect(await f.service.dispatchCandidates(32)).toContain(r.id);
      await f.service.processReceipt(r.id, f.provider);
      expect(await f.service.dispatchCandidates(32)).not.toContain(r.id);
    });
    it("a real SDK full-refund graph revokes the current purchased line period even when invoice.period_end equals its start", async () => {
      const f = await fixture(),
        start = Math.floor(Date.now() / 1000) - 1000,
        end = start + 7200;
      const adapter = new StripeBillingProvider({
        apiKey: "fixture-not-a-real-key",
        appOrigin: "https://sammlerraum.example",
        monthlyPriceId: "price_monthly_fixture",
        yearlyPriceId: "price_yearly_fixture",
        fetch: async (input, init) => {
          const path = new URL(new Request(input, init).url).pathname;
          if (path.includes("/charges/"))
            return Response.json({
              id: "ch_owned",
              customer: f.customerId,
              amount: 1000,
              amount_refunded: 1000,
              payment_intent: "pi_owned",
            });
          if (path.endsWith("/invoice_payments"))
            return Response.json({
              data: [
                {
                  id: "inpay_owned",
                  status: "paid",
                  invoice: "in_owned",
                  payment: { type: "payment_intent", payment_intent: "pi_owned" },
                },
              ],
              has_more: false,
            });
          if (path.endsWith("/lines"))
            return Response.json({
              data: [
                {
                  id: "il_owned",
                  invoice: "in_owned",
                  amount: 1000,
                  parent: {
                    type: "subscription_item_details",
                    subscription_item_details: { subscription: f.subscriptionId },
                  },
                  pricing: {
                    type: "price_details",
                    price_details: { price: "price_monthly_fixture" },
                  },
                  period: { start, end },
                },
              ],
              has_more: false,
            });
          if (path.includes("/invoices/"))
            return Response.json({
              id: "in_owned",
              customer: f.customerId,
              period_end: start,
              parent: {
                type: "subscription_details",
                subscription_details: { subscription: f.subscriptionId },
              },
            });
          if (path.includes("/subscriptions/"))
            return Response.json({
              id: f.subscriptionId,
              customer: f.customerId,
              status: "active",
              cancel_at_period_end: false,
              items: {
                data: [
                  {
                    id: "si_owned",
                    price: { id: "price_monthly_fixture" },
                    quantity: 1,
                    current_period_start: start,
                    current_period_end: end,
                  },
                ],
                has_more: false,
              },
            });
          throw Error("Unexpected offline refund graph request");
        },
      });
      const event = {
        ...f.event(),
        type: "charge.refunded",
        objectId: "ch_owned",
        chargeId: "ch_owned",
      };
      const provider = {
        id: "stripe",
        resolveCustomer: async () => f.customerId,
        readEventState: adapter.readEventState.bind(adapter),
      };
      await f.service.processReceipt((await f.service.receiveEvent(event)).id, provider);
      expect(
        (
          await createEntitlementService(db, policy, { providerIds: ["stripe"] }).getEntitlements(
            f.owner,
          )
        ).plan,
      ).toBe("FREE");
      const [row] = await db.$queryRaw<
        { riskThrough: Date }[]
      >`SELECT "riskThrough" FROM "BillingSubscription" WHERE "subjectId"=${f.owner}`;
      expect(row?.riskThrough).toEqual(new Date(end * 1000));
    });
  },
);
