import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
const free = {
  ITEM_CREATE: 1,
  MEDIA_COUNT: 1,
  MEDIA_BYTES: 1000,
  AI_MONTHLY: 1,
  IMPORT_PROFILES: 1,
  MARKET_DATA: false,
  EXTENDED_HISTORY: false,
  ADVANCED_ANALYTICS: false,
  XLSX: false,
  ADVANCED_FILTERS: false,
};
const policy = {
  FREE: free,
  PREMIUM: {
    ...free,
    ITEM_CREATE: 10,
    MEDIA_COUNT: 10,
    MEDIA_BYTES: 10000,
    AI_MONTHLY: 10,
    IMPORT_PROFILES: 10,
    MARKET_DATA: true,
    EXTENDED_HISTORY: true,
    ADVANCED_ANALYTICS: true,
    XLSX: true,
    ADVANCED_FILTERS: true,
  },
};
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "private current billing overview",
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
      const who = "overview-" + randomUUID();
      await db.user.create({
        data: {
          id: who,
          email: who + "@example.invalid",
          emailVerified: true,
          name: "Own synthetic collector",
        },
      });
      const collection = await db.collection.create({ data: { ownerId: who, name: "Owned" } });
      await db.collectibleItem.create({
        data: { ownerId: who, collectionId: collection.id, title: "Retained" },
      });
      return { who, collection };
    }
    async function service() {
      const path = "./billing-overview";
      const module = await import(path).catch(() => null);
      expect(module?.createBillingOverviewService).toBeTypeOf("function");
      return module!.createBillingOverviewService(db, policy, { providerIds: ["stripe_test"] });
    }
    it("shows actual own Free usage and never derives a paid plan from a stored hosted session", async () => {
      const f = await fixture(),
        foreign = await fixture();
      await db.collectibleItem.create({
        data: { ownerId: foreign.who, collectionId: foreign.collection.id, title: "Not included" },
      });
      await db.$executeRaw`INSERT INTO "BillingAccount" ("subjectId",provider,"providerCustomerId") VALUES (${f.who},'stripe_test','cus_own_overview')`;
      expect(await (await service()).getOverview(f.who)).toMatchObject({
        plan: "FREE",
        hasCustomer: true,
        usage: {
          ITEM_CREATE: "1",
          MEDIA_COUNT: "0",
          MEDIA_BYTES: "0",
          AI_MONTHLY: "0",
          IMPORT_PROFILES: "0",
        },
      });
    });
    it("preserves retained excess and reports cancellation through the confirmed current period", async () => {
      const f = await fixture();
      await db.collectibleItem.create({
        data: { ownerId: f.who, collectionId: f.collection.id, title: "Retained excess" },
      });
      await db.$executeRaw`INSERT INTO "BillingAccount" ("subjectId",provider,"providerCustomerId") VALUES (${f.who},'stripe_test',${"cus_" + randomUUID()})`;
      await db.$executeRaw`INSERT INTO "BillingSubscription" (id,"subjectId",provider,"providerSubscriptionId","planEligible",status,"currentPeriodStart","currentPeriodEnd","cancelAtPeriodEnd","providerUpdatedAt") VALUES (${randomUUID()}::uuid,${f.who},'stripe_test',${"sub_" + randomUUID()},true,'ACTIVE',timezone('UTC',clock_timestamp())-interval '1 hour',timezone('UTC',clock_timestamp())+interval '1 hour',true,timezone('UTC',clock_timestamp()))`;
      const own = await service();
      expect(await own.getOverview(f.who)).toMatchObject({
        plan: "PREMIUM",
        cancelAtPeriodEnd: true,
        usage: { ITEM_CREATE: "2" },
      });
      await db.$executeRaw`UPDATE "BillingSubscription" SET status='CANCELED' WHERE "subjectId"=${f.who}`;
      expect(await own.getOverview(f.who)).toMatchObject({
        plan: "FREE",
        limits: { ITEM_CREATE: 1 },
        usage: { ITEM_CREATE: "2" },
      });
    });
    it("hides another environment customer and returns no provider identifiers or private profile data", async () => {
      const f = await fixture();
      await db.$executeRaw`INSERT INTO "BillingAccount" ("subjectId",provider,"providerCustomerId") VALUES (${f.who},'stripe_live','cus_never_disclose')`;
      const result = await (await service()).getOverview(f.who);
      expect(result).toMatchObject({ hasCustomer: false, plan: "FREE" });
      expect(JSON.stringify(result)).not.toMatch(/cus_never_disclose|example.invalid|stripe_live/);
    });
    it("does not invent Free state for a missing owner", async () => {
      await expect((await service()).getOverview("missing-" + randomUUID())).rejects.toMatchObject({
        code: "BILLING_NOT_FOUND",
      });
    });
  },
);
