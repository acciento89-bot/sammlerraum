import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { LocalPersistentStorage } from "@sammlerraum/storage";
import { createPrismaImportParserRepository } from "./import-parser-repository";
import { createImportParser } from "./import-parser-runtime";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>,
  root: string,
  storage: LocalPersistentStorage;
async function fixture(
  text: string | Uint8Array,
  checksum?: string,
  format: "CSV" | "XLSX" = "CSV",
) {
  const owner = randomUUID(),
    collection = randomUUID(),
    id = randomUUID(),
    bytes = typeof text === "string" ? Buffer.from(text) : Buffer.from(text);
  await db.$executeRaw`INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (${owner},'Synthetic parser',${`${owner}@example.invalid`},false,now(),now())`;
  await db.$executeRaw`INSERT INTO "Collection" (id,"ownerId",name,"updatedAt") VALUES (${collection}::uuid,${owner},'Parser',now())`;
  await db.$executeRaw`INSERT INTO "ImportJob" (id,"ownerId","collectionId",locale,"sourceFormat","sourceFileName","sourceByteSize","sourceChecksumSha256","sourceStorageKey","parserOptions","updatedAt") VALUES (${id}::uuid,${owner},${collection}::uuid,'de',${format}::"ImportSourceFormat",'synthetic.csv',${BigInt(bytes.length)},${checksum ?? createHash("sha256").update(bytes).digest("hex")},${`imports/${id}/source`},${JSON.stringify({ schemaVersion: 1, format, hasHeader: true, delimiter: "," })}::jsonb,now())`;
  await storage.put(`imports/${id}/source`, bytes);
  return { id, owner, collection };
}
async function job(id: string) {
  return (
    await db.$queryRaw<
      { status: string; parsedRows: number; totalRows: number | null; errorCode: string | null }[]
    >`SELECT status,"parsedRows","totalRows","errorCode" FROM "ImportJob" WHERE id=${id}::uuid`
  )[0]!;
}
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual source-to-PostgreSQL import parser",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
      root = await mkdtemp(join(tmpdir(), "sammlerraum-parser-"));
      storage = new LocalPersistentStorage(root);
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
      if (root) await rm(root, { recursive: true, force: true });
    });
    it("verifies actual bytes and persists over100 rows without touching inventory", async () => {
      const f = await fixture(
        "Title,Amount\n" + Array.from({ length: 101 }, (_, i) => `Item ${i},1.25`).join("\n"),
      );
      await createImportParser(createPrismaImportParserRepository(db), storage)({ jobId: f.id });
      expect(await job(f.id)).toMatchObject({
        status: "PARSED",
        parsedRows: 101,
        totalRows: 101,
        errorCode: null,
      });
      const rows = await db.$queryRaw<
        { rowKey: string; sourceRowNumber: number; rawCells: unknown }[]
      >`SELECT "rowKey","sourceRowNumber","rawCells" FROM "ImportRow" WHERE "jobId"=${f.id}::uuid ORDER BY "rowNumber"`;
      expect(rows).toHaveLength(101);
      expect(rows[100]).toMatchObject({
        rowKey: `${f.id}:101`,
        sourceRowNumber: 102,
        rawCells: ["Item 100", "1.25"],
      });
      await createImportParser(createPrismaImportParserRepository(db), storage)({ jobId: f.id });
      expect((await job(f.id)).parsedRows).toBe(101);
      expect(
        (
          await db.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM "CollectibleItem"`
        )[0]!.count,
      ).toBe(0n);
    });
    it("rejects mismatched source checksums and late row-limit failures", async () => {
      const bad = await fixture("Title\nOne", "a".repeat(64));
      await createImportParser(createPrismaImportParserRepository(db), storage)({ jobId: bad.id });
      expect(await job(bad.id)).toMatchObject({
        status: "FAILED",
        parsedRows: 0,
        errorCode: "IMPORT_SOURCE_INVALID",
      });
      const late = await fixture(
        "Title\n" + Array.from({ length: 102 }, (_, i) => `Item ${i}`).join("\n"),
      );
      await createImportParser(createPrismaImportParserRepository(db), storage, { maxRows: 101 })({
        jobId: late.id,
      });
      expect(await job(late.id)).toMatchObject({
        status: "FAILED",
        parsedRows: 100,
        totalRows: null,
        errorCode: "IMPORT_ROW_LIMIT_EXCEEDED",
      });
    });
    it("fences expired claims and verifies rather than replacing a persisted retry prefix", async () => {
      const f = await fixture("Title\nOne\nTwo"),
        repo = createPrismaImportParserRepository(db),
        first = await repo.claim(f.id);
      expect(first).not.toBeNull();
      expect(await repo.claim(f.id)).toBeNull();
      expect(await repo.verified(first!)).toBe(true);
      await repo.append(first!, [{ rowNumber: 1, sourceRowNumber: 2, cells: ["One"] }]);
      await db.$executeRaw`UPDATE "ImportJob" SET "parsingLeaseUntil"=now()-interval '1 second' WHERE id=${f.id}::uuid`;
      const second = await repo.claim(f.id);
      expect(second?.token).not.toBe(first?.token);
      expect(await repo.renew(first!)).toBe(false);
      await expect(
        repo.append(first!, [{ rowNumber: 2, sourceRowNumber: 3, cells: ["Two"] }]),
      ).rejects.toMatchObject({ code: "IMPORT_CLAIM_LOST" });
      await createImportParser(repo, storage)({ jobId: f.id }); // already claimed: no second owner
      expect((await job(f.id)).status).toBe("PARSING");
      await db.$executeRaw`UPDATE "ImportJob" SET "parsingLeaseUntil"=now()-interval '1 second' WHERE id=${f.id}::uuid`;
      await createImportParser(repo, storage)({ jobId: f.id });
      expect(await job(f.id)).toMatchObject({ status: "PARSED", parsedRows: 2 });
    });
    it("refuses jobs whose target is deleted and pins claimed parser options", async () => {
      const f = await fixture("Title\nOne");
      const repo = createPrismaImportParserRepository(db);
      expect(await repo.claim(f.id)).not.toBeNull();
      await expect(
        db.$executeRaw`UPDATE "ImportJob" SET "parserOptions"='{}'::jsonb WHERE id=${f.id}::uuid`,
      ).rejects.toThrow();
      await db.$executeRaw`UPDATE "Collection" SET "deletedAt"=now() WHERE id=${f.collection}::uuid`;
      await db.$executeRaw`UPDATE "ImportJob" SET "parsingLeaseUntil"=now()-interval '1 second' WHERE id=${f.id}::uuid`;
      expect(await repo.claim(f.id)).toBeNull();
    });
    it("rejects divergent retry rows and missing membership before finishing", async () => {
      const f = await fixture("Title\nOne\nTwo"),
        repo = createPrismaImportParserRepository(db),
        claim = (await repo.claim(f.id))!;
      await repo.verified(claim);
      await repo.append(claim, [{ rowNumber: 1, sourceRowNumber: 2, cells: ["One"] }]);
      await expect(
        repo.append(claim, [{ rowNumber: 1, sourceRowNumber: 2, cells: ["Changed"] }]),
      ).rejects.toMatchObject({ code: "IMPORT_PARSE_INTEGRITY" });
      expect((await job(f.id)).parsedRows).toBe(1);
      await db.$executeRaw`DELETE FROM "ImportRow" WHERE "jobId"=${f.id}::uuid`;
      await expect(repo.finish(claim, 1)).rejects.toMatchObject({ code: "IMPORT_PARSE_INTEGRITY" });
      expect((await job(f.id)).status).toBe("PARSING");
    });
    it("persists exact cached workbook cells through actual storage and database", async () => {
      const { workbookFixture } = await import("./import-xlsx-fixture.test-helper");
      const bytes = workbookFixture(
        '<row r="1"><c r="A1" t="inlineStr"><is><t>Amount</t></is></c></row><row r="2"><c r="A2"><f>1+1</f><v>9007199254740993</v></c></row>',
      );
      const f = await fixture(bytes, undefined, "XLSX");
      await createImportParser(createPrismaImportParserRepository(db), storage)({ jobId: f.id });
      expect(await job(f.id)).toMatchObject({ status: "PARSED", parsedRows: 1, totalRows: 1 });
      expect(
        (
          await db.$queryRaw<
            { rawCells: unknown }[]
          >`SELECT "rawCells" FROM "ImportRow" WHERE "jobId"=${f.id}::uuid`
        )[0]!.rawCells,
      ).toEqual(["9007199254740993"]);
    });
  },
);
