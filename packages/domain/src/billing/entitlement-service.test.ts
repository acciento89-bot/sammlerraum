import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createEntitlementService } from "./entitlement-service";

// Removing local expiry/status or quota validation must break these actual-DB witnesses.
const policy = {
  FREE: {
    ITEM_CREATE: 2,
    MEDIA_COUNT: 2,
    MEDIA_BYTES: 100,
    AI_MONTHLY: 1,
    IMPORT_PROFILES: 1,
    MARKET_DATA: false,
    EXTENDED_HISTORY: false,
    ADVANCED_ANALYTICS: false,
    XLSX: false,
    ADVANCED_FILTERS: false,
  },
  PREMIUM: {
    ITEM_CREATE: 10,
    MEDIA_COUNT: 10,
    MEDIA_BYTES: 1000,
    AI_MONTHLY: 20,
    IMPORT_PROFILES: 10,
    MARKET_DATA: true,
    EXTENDED_HISTORY: true,
    ADVANCED_ANALYTICS: true,
    XLSX: true,
    ADVANCED_FILTERS: true,
  },
};
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")("local billing entitlements", () => {
  let db: ReturnType<typeof createTestDatabaseClient>;
  let isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
  beforeAll(async () => {
    isolated = await createLegacyMoneyTestSchema();
    db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
  });
  afterAll(async () => {
    await db?.$disconnect();
    await isolated?.cleanup();
  });
  async function user() {
    const id = `billing-${randomUUID()}`;
    await db.user.create({
      data: { id, email: `${id}@example.invalid`, name: "Billing fixture", emailVerified: true },
    });
    return id;
  }
  async function subscription(
    subjectId: string,
    status: string,
    end = new Date(Date.now() + 3600000),
  ) {
    await db.$executeRaw`INSERT INTO "BillingAccount" ("subjectId",provider,"providerCustomerId") VALUES (${subjectId},'stripe',${"cus_" + randomUUID()})`;
    await db.$executeRaw`INSERT INTO "BillingSubscription" (id,"subjectId",provider,"providerSubscriptionId",status,"currentPeriodStart","currentPeriodEnd","providerUpdatedAt") VALUES (${randomUUID()}::uuid,${subjectId},'stripe',${"sub_" + randomUUID()},${status}::"BillingSubscriptionStatus",${new Date(Date.now() - 3600000)},${end},CURRENT_TIMESTAMP)`;
  }
  it("rejects item creation at the explicit Free limit and allows a fitting batch", async () => {
    const service = createEntitlementService(db, policy),
      id = await user();
    expect(await service.getEntitlements(id)).toMatchObject({
      plan: "FREE",
      limits: { ITEM_CREATE: 2 },
    });
    await expect(
      service.assertEntitled(id, "ITEM_CREATE", { currentCount: 1, amount: 1 }),
    ).resolves.toMatchObject({ plan: "FREE" });
    await expect(
      service.assertEntitled(id, "ITEM_CREATE", { currentCount: 2, amount: 1 }),
    ).rejects.toMatchObject({ code: "PLAN_LIMIT_REACHED" });
    await expect(
      service.assertEntitled(id, "ITEM_CREATE", { currentCount: 1, amount: 2 }),
    ).rejects.toMatchObject({ code: "PLAN_LIMIT_REACHED" });
  });
  it("blocks premium-only operations while keeping base inventory independent", async () => {
    const service = createEntitlementService(db, policy),
      id = await user();
    for (const f of [
      "XLSX",
      "MARKET_DATA",
      "EXTENDED_HISTORY",
      "ADVANCED_ANALYTICS",
      "ADVANCED_FILTERS",
    ] as const)
      await expect(service.assertEntitled(id, f)).rejects.toMatchObject({
        code: "PREMIUM_REQUIRED",
      });
    await expect(
      service.assertEntitled(id, "MEDIA_BYTES", { currentCount: 99, amount: 2 }),
    ).rejects.toMatchObject({ code: "PLAN_LIMIT_REACHED" });
  });
  it("uses active current local state, never checkout query strings or another owner", async () => {
    const owner = await user(),
      other = await user();
    await subscription(owner, "ACTIVE");
    const service = createEntitlementService(db, policy);
    await expect(service.assertEntitled(owner, "XLSX")).resolves.toMatchObject({ plan: "PREMIUM" });
    await expect(service.assertEntitled(other, "XLSX")).rejects.toMatchObject({
      code: "PREMIUM_REQUIRED",
    });
  });
  it.each(["PAST_DUE", "CANCELED", "UNPAID", "INCOMPLETE", "INCOMPLETE_EXPIRED", "PAUSED"])(
    "downgrades %s without deleting personal inventory",
    async (status) => {
      const id = await user();
      await subscription(id, status);
      const collection = await db.collection.create({ data: { ownerId: id, name: "Preserved" } });
      const item = await db.collectibleItem.create({
        data: { ownerId: id, collectionId: collection.id, title: "Retained" },
      });
      const service = createEntitlementService(db, policy);
      expect((await service.getEntitlements(id)).plan).toBe("FREE");
      expect(await db.collectibleItem.findUnique({ where: { id: item.id } })).toMatchObject({
        title: "Retained",
      });
    },
  );
  it("downgrades an expired active record using the database clock", async () => {
    const id = await user();
    await subscription(id, "ACTIVE", new Date(Date.now() - 1000));
    expect((await createEntitlementService(db, policy).getEntitlements(id)).plan).toBe("FREE");
  });
  it("retains active cancellation until paid period end", async () => {
    const id = await user();
    await subscription(id, "ACTIVE");
    await db.$executeRaw`UPDATE "BillingSubscription" SET "cancelAtPeriodEnd"=true WHERE "subjectId"=${id}`;
    expect(await createEntitlementService(db, policy).getEntitlements(id)).toMatchObject({
      plan: "PREMIUM",
      cancelAtPeriodEnd: true,
    });
  });
  it("fails closed for nonexistent subjects and invalid quantities", async () => {
    const service = createEntitlementService(db, policy),
      id = await user();
    await expect(service.getEntitlements("missing")).rejects.toMatchObject({
      code: "BILLING_NOT_FOUND",
    });
    for (const currentCount of [-1, NaN, Infinity, 1.5])
      await expect(
        service.assertEntitled(id, "ITEM_CREATE", { currentCount, amount: 1 }),
      ).rejects.toMatchObject({ code: "BILLING_INVALID_REQUEST" });
    await expect(service.assertEntitled(id, "ITEM_CREATE")).rejects.toMatchObject({
      code: "BILLING_INVALID_REQUEST",
    });
  });
});
