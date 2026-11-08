import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createInsuranceService } from "./insurance-service";
import { createItemQuery } from "../items/item-query";
import { createExportService } from "../exports/export-service";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
const insurance = {
  amountMinor: "12345",
  currency: "EUR",
  valuationDate: "2026-01-01",
  insurer: "Own insurer",
  policyReference: "PRIVATE-POLICY-42",
  notes: "Private insurance note",
};
async function fixture() {
  const owner = randomUUID(),
    collection = randomUUID(),
    item = randomUUID();
  await db.$executeRaw`INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (${owner},'Synthetic insurance',${`${owner}@example.invalid`},false,now(),now())`;
  await db.$executeRaw`INSERT INTO "Collection" (id,"ownerId",name,visibility,"updatedAt") VALUES (${collection}::uuid,${owner},'Insurance collection','PUBLIC',now())`;
  await db.$executeRaw`INSERT INTO "CollectibleItem" (id,"ownerId","collectionId",title,visibility,quantity,"updatedAt") VALUES (${item}::uuid,${owner},${collection}::uuid,'Insurance item','PUBLIC',2,now())`;
  return { owner, actor: { userId: owner }, collection, item };
}
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "real private collection/item insurance",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    it("persists owned item insurance but never exposes policy or notes in public items or default tabular exports", async () => {
      const f = await fixture(),
        service = createInsuranceService(db);
      const saved = await service.setItemInsurance(f.actor, f.item, {
        expectedRevision: 0,
        insurance,
      });
      expect(saved).toMatchObject({
        revision: 1,
        insurance: { ...insurance, basis: "PER_UNIT", minorUnitExponent: 2 },
      });
      expect(await service.getInsuranceData(f.actor, { kind: "ITEM", itemId: f.item })).toEqual(
        saved,
      );
      const publicDto = await createItemQuery(db).getPublicItem(f.item);
      expect(publicDto).not.toHaveProperty("policyReference");
      expect(JSON.stringify(publicDto)).not.toContain("PRIVATE-POLICY-42");
      expect(
        JSON.stringify(
          await createExportService(db).captureExportSource(f.actor, {
            scope: { kind: "ALL" },
            format: "CSV",
            locale: "de",
          }),
        ),
      ).not.toContain("PRIVATE-POLICY-42");
    });
    it("separates collection totals from per-unit item values and blocks foreign/public access", async () => {
      const f = await fixture(),
        other = await fixture(),
        service = createInsuranceService(db);
      expect(
        await service.setCollectionInsurance(f.actor, f.collection, {
          expectedRevision: 0,
          insurance,
        }),
      ).toMatchObject({ insurance: { basis: "COLLECTION_TOTAL" } });
      await expect(
        service.getInsuranceData(other.actor, { kind: "COLLECTION", collectionId: f.collection }),
      ).rejects.toMatchObject({ code: "INSURANCE_NOT_FOUND" });
      await expect(
        service.setItemInsurance(other.actor, f.item, { expectedRevision: 0, insurance }),
      ).rejects.toMatchObject({ code: "INSURANCE_NOT_FOUND" });
      await expect(
        service.getInsuranceData({ userId: "" }, { kind: "ITEM", itemId: f.item }),
      ).rejects.toMatchObject({ code: "INSURANCE_NOT_FOUND" });
    });
    it("uses current revisions and preserves a clear tombstone against stale initial recreation", async () => {
      const f = await fixture(),
        service = createInsuranceService(db);
      await service.setItemInsurance(f.actor, f.item, { expectedRevision: 0, insurance });
      await expect(
        service.setItemInsurance(f.actor, f.item, { expectedRevision: 0, insurance }),
      ).rejects.toMatchObject({ code: "INSURANCE_CONFLICT" });
      expect(
        await service.setItemInsurance(f.actor, f.item, { expectedRevision: 1, insurance: null }),
      ).toMatchObject({ revision: 2, insurance: null });
      await expect(
        service.setItemInsurance(f.actor, f.item, { expectedRevision: 0, insurance }),
      ).rejects.toMatchObject({ code: "INSURANCE_CONFLICT" });
      expect(
        await service.setItemInsurance(f.actor, f.item, {
          expectedRevision: 2,
          insurance: { ...insurance, amountMinor: "0" },
        }),
      ).toMatchObject({ revision: 3, insurance: { amountMinor: "0" } });
    });
    it("serializes competing updates so only one exact revision wins", async () => {
      const f = await fixture(),
        service = createInsuranceService(db);
      const results = await Promise.allSettled([
        service.setItemInsurance(f.actor, f.item, { expectedRevision: 0, insurance }),
        service.setItemInsurance(f.actor, f.item, {
          expectedRevision: 0,
          insurance: { ...insurance, amountMinor: "1" },
        }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      expect(
        await service.getInsuranceData(f.actor, { kind: "ITEM", itemId: f.item }),
      ).toMatchObject({ revision: 1 });
    });
    it.each([
      ["JPY", 0],
      ["BHD", 3],
      ["CLF", 4],
    ] as const)(
      "pins exact %s exponent without float conversion",
      async (currency, minorUnitExponent) => {
        const f = await fixture(),
          service = createInsuranceService(db);
        expect(
          await service.setItemInsurance(f.actor, f.item, {
            expectedRevision: 0,
            insurance: { ...insurance, amountMinor: "9223372036854775807", currency },
          }),
        ).toMatchObject({
          insurance: { amountMinor: "9223372036854775807", currency, minorUnitExponent },
        });
      },
    );
    it.each([
      { amountMinor: "-1" },
      { amountMinor: "1.5" },
      { amountMinor: "9223372036854775808" },
      { currency: "ZZZ" },
      { valuationDate: "2026-02-30" },
      { valuationDate: "9999-01-01" },
      { minorUnitExponent: 0 },
      { policyReference: "x".repeat(501) },
    ])("refuses invalid or authority-overriding input %j", async (patch) => {
      const f = await fixture(),
        service = createInsuranceService(db);
      await expect(
        service.setItemInsurance(f.actor, f.item, {
          expectedRevision: 0,
          insurance: { ...insurance, ...patch },
        }),
      ).rejects.toMatchObject({ code: "INSURANCE_INVALID" });
      expect(
        await service.getInsuranceData(f.actor, { kind: "ITEM", itemId: f.item }),
      ).toMatchObject({ revision: 0, insurance: null });
    });
    it("denies mutation of inactive items and access after parent soft deletion", async () => {
      const f = await fixture(),
        service = createInsuranceService(db);
      await db.$executeRaw`UPDATE "CollectibleItem" SET "archivedAt"=now() WHERE id=${f.item}::uuid`;
      await expect(
        service.setItemInsurance(f.actor, f.item, { expectedRevision: 0, insurance }),
      ).rejects.toMatchObject({ code: "INSURANCE_INACTIVE" });
      await db.$executeRaw`UPDATE "Collection" SET "deletedAt"=now() WHERE id=${f.collection}::uuid`;
      await expect(
        service.getInsuranceData(f.actor, { kind: "ITEM", itemId: f.item }),
      ).rejects.toMatchObject({ code: "INSURANCE_NOT_FOUND" });
    });
    it("enforces owned links in the database and physically cascades private records with their target", async () => {
      const f = await fixture(),
        other = await fixture(),
        service = createInsuranceService(db);
      await service.setItemInsurance(f.actor, f.item, { expectedRevision: 0, insurance });
      await expect(
        db.$executeRaw`UPDATE "InsuranceRecord" SET "ownerId"=${other.owner} WHERE "itemId"=${f.item}::uuid`,
      ).rejects.toBeDefined();
      await db.$executeRaw`DELETE FROM "CollectibleItem" WHERE id=${f.item}::uuid`;
      expect(
        await db.$queryRaw`SELECT id FROM "InsuranceRecord" WHERE "itemId"=${f.item}::uuid`,
      ).toEqual([]);
    });
    it("rejects direct foreign-target records and wrong currency/exponent pairs through actual constraints", async () => {
      const f = await fixture(),
        other = await fixture();
      await expect(
        db.$executeRaw`INSERT INTO "InsuranceRecord" (id,"ownerId","itemId",basis,"updatedAt") VALUES (${randomUUID()}::uuid,${other.owner},${f.item}::uuid,'PER_UNIT',now())`,
      ).rejects.toBeDefined();
      await createInsuranceService(db).setItemInsurance(f.actor, f.item, {
        expectedRevision: 0,
        insurance,
      });
      await expect(
        db.$executeRaw`UPDATE "InsuranceRecord" SET revision=revision+1,"minorUnitExponent"=0 WHERE "itemId"=${f.item}::uuid`,
      ).rejects.toBeDefined();
      expect(
        await createInsuranceService(db).getInsuranceData(f.actor, {
          kind: "ITEM",
          itemId: f.item,
        }),
      ).toMatchObject({ revision: 1, insurance: { currency: "EUR", minorUnitExponent: 2 } });
    });
    it("retains an owner-readable inactive declaration but removes records with a physically deleted collection", async () => {
      const f = await fixture(),
        service = createInsuranceService(db);
      await service.setItemInsurance(f.actor, f.item, { expectedRevision: 0, insurance });
      await service.setCollectionInsurance(f.actor, f.collection, {
        expectedRevision: 0,
        insurance,
      });
      await db.$executeRaw`UPDATE "CollectibleItem" SET "disposedAt"=now() WHERE id=${f.item}::uuid`;
      expect(
        await service.getInsuranceData(f.actor, { kind: "ITEM", itemId: f.item }),
      ).toMatchObject({ revision: 1, insurance: { policyReference: insurance.policyReference } });
      await db.$executeRaw`DELETE FROM "Collection" WHERE id=${f.collection}::uuid`;
      expect(
        await db.$queryRaw`SELECT id FROM "InsuranceRecord" WHERE "ownerId"=${f.owner}`,
      ).toEqual([]);
    });
  },
);
