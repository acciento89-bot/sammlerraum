import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "./testing/legacy-money-schema";
import { createTestDatabaseClient } from "./test-database";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
let isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>,
  db: ReturnType<typeof createTestDatabaseClient>;
async function fixture() {
  const owner = `native-import-${randomUUID()}`,
    collection = randomUUID(),
    job = randomUUID();
  await db.$queryRaw`INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (${owner},'Synthetic',${`${randomUUID()}@example.invalid`},false,now(),now()) RETURNING id`;
  await db.$queryRaw`INSERT INTO "Collection" (id,"ownerId",name,"updatedAt") VALUES (${collection}::uuid,${owner},'Synthetic',now()) RETURNING id`;
  await db.$queryRaw`INSERT INTO "ImportJob" (id,"ownerId","collectionId",locale,"sourceFormat","sourceFileName","sourceByteSize","sourceChecksumSha256","sourceStorageKey","updatedAt") VALUES (${job}::uuid,${owner},${collection}::uuid,'de','CSV','source.csv',1000,${"a".repeat(64)},${`imports/${job}/source`},now()) RETURNING id`;
  return { owner, collection, job };
}
describe.runIf(enabled)("native staged import invariants", () => {
  beforeAll(async () => {
    isolated = await createLegacyMoneyTestSchema();
    db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
  });
  afterAll(async () => {
    await db?.$disconnect();
    await isolated?.cleanup();
  });
  it("pins job source identity and rejects premature parsing or a mapping NULL hole", async () => {
    const f = await fixture();
    await expect(
      db.$queryRaw`UPDATE "ImportJob" SET "sourceChecksumSha256"=${"b".repeat(64)} WHERE id=${f.job}::uuid RETURNING id`,
    ).rejects.toThrow();
    await expect(
      db.$queryRaw`UPDATE "ImportJob" SET status='PARSING' WHERE id=${f.job}::uuid RETURNING id`,
    ).rejects.toThrow();
    await expect(
      db.$queryRaw`UPDATE "ImportJob" SET "mappingHash"=${"b".repeat(64)},"previewGeneration"=1 WHERE id=${f.job}::uuid RETURNING id`,
    ).rejects.toThrow();
  });
  it("checks actual cell types and inclusive compact UTF-8 row bytes", async () => {
    // Independent byte oracle; JSONB presentation whitespace must not alter the bound.
    const value = "🦊".repeat(16383) + "x";
    // One cell is independently limited to16KiB, so construct four valid cells.
    const cells = ["🦊".repeat(4095), "🦊".repeat(4095), "🦊".repeat(4095), "🦊".repeat(4095)];
    const gap = 65536 - Buffer.byteLength(JSON.stringify(cells));
    cells[0] += "x".repeat(gap);
    expect(Buffer.byteLength(JSON.stringify(cells))).toBe(65536);
    const [valid] = await db.$queryRaw<
      { valid: boolean }[]
    >`SELECT import_raw_cells_valid(${JSON.stringify(cells)}::jsonb) AS valid`;
    expect(valid?.valid).toBe(true);
    cells[1] += "x";
    const [over] = await db.$queryRaw<
      { valid: boolean }[]
    >`SELECT import_raw_cells_valid(${JSON.stringify(cells)}::jsonb) AS valid`;
    expect(over?.valid).toBe(false);
    for (const bad of [
      { not: "array" },
      [1],
      [{}],
      Array.from({ length: 257 }, () => null),
      [value],
    ]) {
      const [result] = await db.$queryRaw<
        { valid: boolean }[]
      >`SELECT import_raw_cells_valid(${JSON.stringify(bad)}::jsonb) AS valid`;
      expect(result?.valid).toBe(false);
    }
  });
  it("pins source row identity and permits exactly one row key per source row", async () => {
    const f = await fixture(),
      id = randomUUID(),
      key = `${f.job}:1`;
    await db.$queryRaw`INSERT INTO "ImportRow" (id,"jobId","rowNumber","rowKey","rawCells","updatedAt") VALUES (${id}::uuid,${f.job}::uuid,1,${key},'["Title"]'::jsonb,now()) RETURNING id`;
    await expect(
      db.$queryRaw`UPDATE "ImportRow" SET "rawCells"='["Changed"]'::jsonb WHERE id=${id}::uuid RETURNING id`,
    ).rejects.toThrow();
    await expect(
      db.$queryRaw`INSERT INTO "ImportRow" (id,"jobId","rowNumber","rowKey","rawCells","updatedAt") VALUES (${randomUUID()}::uuid,${f.job}::uuid,1,${key},'["Title"]'::jsonb,now()) RETURNING id`,
    ).rejects.toThrow();
    await expect(
      db.$queryRaw`UPDATE "ImportRow" SET status='READY',"previewGeneration"=1 WHERE id=${id}::uuid RETURNING id`,
    ).rejects.toThrow();
  });
  it("binds collection ownership natively and keeps profile names unique per owner", async () => {
    const a = await fixture(),
      b = await fixture(),
      foreignJob = randomUUID();
    await expect(
      db.$queryRaw`INSERT INTO "ImportJob" (id,"ownerId","collectionId",locale,"sourceFormat","sourceFileName","sourceByteSize","sourceChecksumSha256","sourceStorageKey","updatedAt") VALUES (${foreignJob}::uuid,${a.owner},${b.collection}::uuid,'de','CSV','source.csv',1000,${"a".repeat(64)},${`imports/${foreignJob}/source`},now()) RETURNING id`,
    ).rejects.toThrow();
    const mapping = JSON.stringify({ schemaVersion: 1, locale: "de", columns: { title: 0 } });
    await db.$queryRaw`INSERT INTO "ImportMappingProfile" (id,"ownerId",name,"normalizedName",mapping,"updatedAt") VALUES (${randomUUID()}::uuid,${a.owner},'Saved','saved',${mapping}::jsonb,now()) RETURNING id`;
    await expect(
      db.$queryRaw`INSERT INTO "ImportMappingProfile" (id,"ownerId",name,"normalizedName",mapping,"updatedAt") VALUES (${randomUUID()}::uuid,${a.owner},'Saved','saved',${mapping}::jsonb,now()) RETURNING id`,
    ).rejects.toThrow();
    await db.$queryRaw`INSERT INTO "ImportMappingProfile" (id,"ownerId",name,"normalizedName",mapping,"updatedAt") VALUES (${randomUUID()}::uuid,${b.owner},'Saved','saved',${mapping}::jsonb,now()) RETURNING id`;
  });
});
