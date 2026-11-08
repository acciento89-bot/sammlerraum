import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
async function implementation() {
  const path = "./session-service",
    m = await import(path).catch(() => null);
  expect(m?.createBillingSessionService, "actual own-account session service").toBeTypeOf(
    "function",
  );
  return m!.createBillingSessionService;
}
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "owned durable billing sessions",
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
      const id = "billing-session-" + randomUUID();
      await db.user.create({
        data: { id, email: id + "@example.invalid", name: "Own billing", emailVerified: true },
      });
      const calls: { kind: string; input: any }[] = [];
      const provider = {
        id: "stripe",
        async createCustomer(input: any) {
          calls.push({ kind: "customer", input });
          return "cus_" + id;
        },
        async createCheckout(input: any) {
          calls.push({ kind: "checkout", input });
          return {
            id: "cs_" + input.requestKey,
            url: "https://checkout.stripe.com/c/pay/" + input.requestKey,
            expiresAt: input.expiresAt,
          };
        },
        async createPortalSession(input: any) {
          calls.push({ kind: "portal", input });
          return {
            id: "bps_" + input.requestKey,
            url: "https://billing.stripe.com/p/session/" + input.requestKey,
          };
        },
      };
      return { id, calls, provider };
    }
    const checkout = () => ({ requestKey: randomUUID(), cadence: "MONTHLY", locale: "de" });
    it("never grants a portal for the customer of another actor", async () => {
      const { id, provider, calls } = await fixture(),
        other = await fixture();
      await db.$executeRaw`INSERT INTO "BillingAccount" ("subjectId",provider,"providerCustomerId") VALUES (${other.id},'stripe','cus_foreign')`;
      const service = (await implementation())(db, provider);
      await expect(
        service.portal({ userId: id }, { requestKey: randomUUID(), locale: "de" }),
      ).rejects.toMatchObject({ code: "BILLING_NOT_FOUND" });
      expect(calls).toHaveLength(0);
    });
    it("persists owner binding and exact retry receipt, never a Premium grant", async () => {
      const { id, provider } = await fixture(),
        service = (await implementation())(db, provider),
        input = checkout();
      const first = await service.checkout({ userId: id }, input),
        second = await service.checkout({ userId: id }, input);
      expect(second).toEqual(first);
      expect(
        await db.$queryRaw`SELECT "subjectId","providerCustomerId" FROM "BillingAccount" WHERE "subjectId"=${id}`,
      ).toEqual([{ subjectId: id, providerCustomerId: "cus_" + id }]);
      expect(
        await db.$queryRaw`SELECT count(*)::int AS n FROM "BillingSubscription" WHERE "subjectId"=${id}`,
      ).toEqual([{ n: 0 }]);
      expect(
        await db.$queryRaw`SELECT count(*)::int AS n FROM "BillingOperation" WHERE "subjectId"=${id}`,
      ).toEqual([{ n: 1 }]);
    });
    it("binds request nonce to cadence and rejects changed retry without another checkout", async () => {
      const { id, provider, calls } = await fixture(),
        service = (await implementation())(db, provider),
        input = checkout();
      await service.checkout({ userId: id }, input);
      await expect(
        service.checkout({ userId: id }, { ...input, cadence: "YEARLY" }),
      ).rejects.toMatchObject({ code: "BILLING_CONFLICT" });
      expect(calls.filter((c) => c.kind === "checkout")).toHaveLength(1);
    });
    it("reserves only one active Checkout across concurrent different nonces", async () => {
      const { id, provider, calls } = await fixture(),
        service = (await implementation())(db, provider);
      const results = await Promise.allSettled([
        service.checkout({ userId: id }, checkout()),
        service.checkout({ userId: id }, checkout()),
      ]);
      expect(results.some((r) => r.status === "fulfilled")).toBe(true);
      expect(
        await db.$queryRaw`SELECT count(*)::int AS n FROM "BillingOperation" WHERE "subjectId"=${id} AND purpose='CHECKOUT'`,
      ).toEqual([{ n: 1 }]);
      expect(
        new Set(calls.filter((c) => c.kind === "checkout").map((c) => c.input.requestKey)).size,
      ).toBe(1);
    });
    it("checks current subject authorization after provider I/O, without holding a DB transaction", async () => {
      const f = await fixture();
      let started!: () => void, release!: () => void;
      const begin = new Promise<void>((r) => (started = r)),
        gate = new Promise<void>((r) => (release = r));
      f.provider.createCustomer = async (input) => {
        f.calls.push({ kind: "customer", input });
        started();
        await gate;
        return "cus_" + f.id;
      };
      const service = (await implementation())(db, f.provider),
        pending = service.checkout({ userId: f.id }, checkout());
      await begin;
      await db.user.update({ where: { id: f.id }, data: { emailVerified: false } });
      release();
      await expect(pending).rejects.toMatchObject({ code: "BILLING_NOT_FOUND" });
      expect(f.calls.some((c) => c.kind === "checkout")).toBe(false);
    });
  },
);
