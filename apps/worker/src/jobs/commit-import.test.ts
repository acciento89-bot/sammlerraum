import { LEGACY_MONEY_PROFILE_ID } from "@sammlerraum/contracts/legacy-money";
import { readMoneyFact } from "../../../../packages/domain/src/money/legacy-money-store";
import { moneyTransaction } from "../../../../packages/domain/src/money/legacy-money-transaction";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createImportService } from "@sammlerraum/domain/imports/import-service";
import { createImportCommitService } from "@sammlerraum/domain/imports/import-commit-service";
import { createPersonalMoneyService } from "@sammlerraum/domain/money/personal-money-service";
import { createImportCommitter } from "./commit-import";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
const mapping = {
  schemaVersion: 1,
  locale: "de",
  columns: { title: 0, quantity: 1, identifier: { column: 2, type: "ISBN" } },
};
async function fixture(cells: string[][], existing = false, mapInput: unknown = mapping) {
  const owner = randomUUID(),
    collection = randomUUID(),
    actor = { userId: owner };
  await db.$executeRaw`INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (${owner},'Synthetic commit',${`${owner}@example.invalid`},false,now(),now())`;
  await db.$executeRaw`INSERT INTO "Collection" (id,"ownerId",name,"updatedAt") VALUES (${collection}::uuid,${owner},'Commit',now())`;
  let itemId: string | undefined;
  if (existing) {
    itemId = randomUUID();
    await db.$executeRaw`INSERT INTO "CollectibleItem" (id,"ownerId","collectionId",title,quantity,"privateNotes","updatedAt") VALUES (${itemId}::uuid,${owner},${collection}::uuid,'Keep title',7,'Keep private notes',now())`;
    await db.$executeRaw`INSERT INTO "ItemIdentifier" (id,"itemId",type,value,"normalizedValue") VALUES (${randomUUID()}::uuid,${itemId}::uuid,'ISBN','9781234','9781234')`;
  }
  const source = createImportService(db),
    job = await source.createImportJob(actor, {
      collectionId: collection,
      locale: "de",
      source: {
        format: "CSV",
        fileName: "synthetic.csv",
        byteSize: "1",
        checksumSha256: "a".repeat(64),
      },
    });
  for (const [i, row] of cells.entries())
    await db.$executeRaw`INSERT INTO "ImportRow" (id,"jobId","rowNumber","rowKey","rawCells","updatedAt") VALUES (${randomUUID()}::uuid,${job.id}::uuid,${i + 1},${`${job.id}:${i + 1}`},${JSON.stringify(row)}::jsonb,now())`;
  await db.$executeRaw`UPDATE "ImportJob" SET status='PARSED',"sourceVerifiedAt"=now(),"parsedRows"=${cells.length},"totalRows"=${cells.length} WHERE id=${job.id}::uuid`;
  let preview = await source.buildImportPreview(actor, {
    jobId: job.id,
    expectedRevision: job.revision,
    mapping: mapInput,
  });
  while (!preview.complete)
    preview = await source.buildImportPreview(actor, {
      jobId: job.id,
      expectedRevision: preview.job.revision,
      mapping: mapInput,
    });
  return { owner, collection, actor, job: preview.job, source, itemId };
}
async function count(owner: string) {
  return Number(
    (
      await db.$queryRaw<
        { count: bigint }[]
      >`SELECT count(*) AS count FROM "CollectibleItem" WHERE "ownerId"=${owner}`
    )[0]!.count,
  );
}
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual approved import commit",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    it("does not create another item when the same approved commit is retried", async () => {
      const f = await fixture([["One", "2", ""]]),
        service = createImportCommitService(db);
      const saved = await service.saveDecisions(f.actor, {
        jobId: f.job.id,
        expectedRevision: f.job.revision,
        previewGeneration: f.job.previewGeneration,
        decisions: [{ rowNumber: 1, action: "CREATE" }],
      });
      await service.approveCommit(f.actor, {
        jobId: f.job.id,
        expectedRevision: saved.revision,
        previewGeneration: f.job.previewGeneration,
      });
      const handler = createImportCommitter(service);
      await handler({ jobId: f.job.id });
      await handler({ jobId: f.job.id });
      expect(await count(f.owner)).toBe(1);
      expect(await f.source.getImportJob(f.actor, f.job.id)).toMatchObject({
        status: "COMPLETED",
        progress: { committedRows: 1 },
      });
    });
    it("merges only explicitly chosen mapped fields and preserves private data", async () => {
      const f = await fixture([["Replace title", "2", "9781234"]], true),
        service = createImportCommitService(db);
      const target = await service.prepareMergeTarget(f.actor, {
        jobId: f.job.id,
        rowNumber: 1,
        previewGeneration: f.job.previewGeneration,
        targetItemId: f.itemId,
      });
      const saved = await service.saveDecisions(f.actor, {
        jobId: f.job.id,
        expectedRevision: f.job.revision,
        previewGeneration: f.job.previewGeneration,
        decisions: [
          {
            rowNumber: 1,
            action: "MERGE",
            targetItemId: f.itemId,
            expectedTargetToken: target.preconditionToken,
            fields: ["title"],
          },
        ],
      });
      await service.approveCommit(f.actor, {
        jobId: f.job.id,
        expectedRevision: saved.revision,
        previewGeneration: f.job.previewGeneration,
      });
      await createImportCommitter(service)({ jobId: f.job.id });
      expect(await db.collectibleItem.findUnique({ where: { id: f.itemId! } })).toMatchObject({
        title: "Replace title",
        quantity: 7,
        privateNotes: "Keep private notes",
      });
      expect(await count(f.owner)).toBe(1);
    });
    it.each([
      [
        "CANONICAL",
        {
          amountColumn: 3,
          fixedCurrency: "EUR",
          sourceKind: "DECIMAL",
          profileId: LEGACY_MONEY_PROFILE_ID,
        },
        "0",
        "EUR",
        "0",
      ],
      [
        "UNKNOWN",
        {
          amountColumn: 3,
          fixedCurrency: "DEM",
          sourceKind: "RAW",
          profileId: null,
          sourceContract: "LEGACY_UNKNOWN_RAW_V1",
        },
        "9007199254740991",
        "DEM",
        "9007199254740991",
      ],
    ] as const)(
      "writes %s money through the existing exact authority",
      async (kind, money, amount, currency, raw) => {
        const f = await fixture([["Money", "2", "", amount]], false, {
            ...mapping,
            columns: { ...mapping.columns, purchaseMoney: money },
          }),
          service = createImportCommitService(db);
        const saved = await service.saveDecisions(f.actor, {
          jobId: f.job.id,
          expectedRevision: f.job.revision,
          previewGeneration: f.job.previewGeneration,
          decisions: [{ rowNumber: 1, action: "CREATE" }],
        });
        await service.approveCommit(f.actor, {
          jobId: f.job.id,
          expectedRevision: saved.revision,
          previewGeneration: f.job.previewGeneration,
        });
        await createImportCommitter(service)({ jobId: f.job.id });
        const item = (await db.collectibleItem.findMany({ where: { ownerId: f.owner } }))[0]!;
        const view = await db.$transaction((tx) =>
          readMoneyFact(moneyTransaction(tx), { family: "PURCHASE", itemId: item.id }, f.actor),
        );
        expect(view.raw).toEqual({ amountMinor: raw, currency });
        expect(view.interpretation.kind).toBe(kind === "CANONICAL" ? "INTERPRETED" : "UNKNOWN");
      },
    );
    it("requires complete decisions and skips invalid rows without inventing inventory", async () => {
      const f = await fixture([["", "bad", ""]]),
        service = createImportCommitService(db);
      await expect(
        service.approveCommit(f.actor, {
          jobId: f.job.id,
          expectedRevision: f.job.revision,
          previewGeneration: f.job.previewGeneration,
        }),
      ).rejects.toMatchObject({ code: "IMPORT_CONFLICT" });
      await expect(
        service.saveDecisions(f.actor, {
          jobId: f.job.id,
          expectedRevision: f.job.revision,
          previewGeneration: f.job.previewGeneration,
          decisions: [{ rowNumber: 1, action: "CREATE" }],
        }),
      ).rejects.toMatchObject({ code: "IMPORT_CONFLICT" });
      const saved = await service.saveDecisions(f.actor, {
        jobId: f.job.id,
        expectedRevision: f.job.revision,
        previewGeneration: f.job.previewGeneration,
        decisions: [{ rowNumber: 1, action: "SKIP" }],
      });
      await service.approveCommit(f.actor, {
        jobId: f.job.id,
        expectedRevision: saved.revision,
        previewGeneration: f.job.previewGeneration,
      });
      await createImportCommitter(service)({ jobId: f.job.id });
      expect(await count(f.owner)).toBe(0);
    });
    it("resumes after a committed chunk without creating duplicates", async () => {
      const f = await fixture(Array.from({ length: 12 }, (_, i) => ["Item " + i, "1", ""])),
        service = createImportCommitService(db);
      const saved = await service.saveDecisions(f.actor, {
        jobId: f.job.id,
        expectedRevision: f.job.revision,
        previewGeneration: f.job.previewGeneration,
        decisions: Array.from({ length: 12 }, (_, i) => ({ rowNumber: i + 1, action: "CREATE" })),
      });
      await service.approveCommit(f.actor, {
        jobId: f.job.id,
        expectedRevision: saved.revision,
        previewGeneration: f.job.previewGeneration,
      });
      expect(await service.commitNextBatch(f.job.id)).toMatchObject({
        complete: false,
        processed: 10,
      });
      expect(await count(f.owner)).toBe(10);
      await createImportCommitter(service)({ jobId: f.job.id });
      await createImportCommitter(service)({ jobId: f.job.id });
      expect(await count(f.owner)).toBe(12);
    });
    it("creates explicitly separate source duplicates and refuses corrupted completed membership", async () => {
      const f = await fixture([
          ["One", "1", "9781234"],
          ["One", "1", "9781234"],
        ]),
        service = createImportCommitService(db);
      const saved = await service.saveDecisions(f.actor, {
        jobId: f.job.id,
        expectedRevision: f.job.revision,
        previewGeneration: f.job.previewGeneration,
        decisions: [
          { rowNumber: 1, action: "CREATE_SEPARATE" },
          { rowNumber: 2, action: "CREATE_SEPARATE" },
        ],
      });
      await service.approveCommit(f.actor, {
        jobId: f.job.id,
        expectedRevision: saved.revision,
        previewGeneration: f.job.previewGeneration,
      });
      await createImportCommitter(service)({ jobId: f.job.id });
      expect(await count(f.owner)).toBe(2);
      await db.$executeRaw`DELETE FROM "ImportRow" WHERE "jobId"=${f.job.id}::uuid AND "rowNumber"=2`;
      await expect(service.commitNextBatch(f.job.id)).rejects.toMatchObject({
        code: "IMPORT_CONFLICT",
      });
      expect(await count(f.owner)).toBe(2);
    });
    it("rejects foreign actors and target changes after explicit merge approval", async () => {
      const f = await fixture([["Replacement", "2", "9781234"]], true),
        service = createImportCommitService(db);
      await expect(
        service.prepareMergeTarget(
          { userId: randomUUID() },
          {
            jobId: f.job.id,
            rowNumber: 1,
            previewGeneration: f.job.previewGeneration,
            targetItemId: f.itemId,
          },
        ),
      ).rejects.toMatchObject({ code: "IMPORT_NOT_FOUND" });
      const selected = await service.prepareMergeTarget(f.actor, {
        jobId: f.job.id,
        rowNumber: 1,
        previewGeneration: f.job.previewGeneration,
        targetItemId: f.itemId,
      });
      const saved = await service.saveDecisions(f.actor, {
        jobId: f.job.id,
        expectedRevision: f.job.revision,
        previewGeneration: f.job.previewGeneration,
        decisions: [
          {
            rowNumber: 1,
            action: "MERGE",
            targetItemId: f.itemId,
            expectedTargetToken: selected.preconditionToken,
            fields: ["title"],
          },
        ],
      });
      await service.approveCommit(f.actor, {
        jobId: f.job.id,
        expectedRevision: saved.revision,
        previewGeneration: f.job.previewGeneration,
      });
      await db.collectibleItem.update({
        where: { id: f.itemId! },
        data: { title: "Human changed title" },
      });
      await expect(service.commitNextBatch(f.job.id)).rejects.toMatchObject({
        code: "IMPORT_CONFLICT",
      });
      expect(await db.collectibleItem.findUnique({ where: { id: f.itemId! } })).toMatchObject({
        title: "Human changed title",
        quantity: 7,
      });
    });

    it("rejects a forged completed receipt even when row counts agree", async () => {
      const f = await fixture([["One", "1", ""]]),
        service = createImportCommitService(db);
      const saved = await service.saveDecisions(f.actor, {
        jobId: f.job.id,
        expectedRevision: f.job.revision,
        previewGeneration: f.job.previewGeneration,
        decisions: [{ rowNumber: 1, action: "CREATE" }],
      });
      await service.approveCommit(f.actor, {
        jobId: f.job.id,
        expectedRevision: saved.revision,
        previewGeneration: f.job.previewGeneration,
      });
      await db.$executeRaw`UPDATE "ImportRow" SET status='COMMITTED',"committedItemId"=${randomUUID()}::uuid,"commitReceipt"='{}'::jsonb,"committedAt"=now() WHERE "jobId"=${f.job.id}::uuid`;
      await db.$executeRaw`UPDATE "ImportJob" SET status='COMPLETED',"committedRows"=1 WHERE id=${f.job.id}::uuid`;
      await expect(service.commitNextBatch(f.job.id)).rejects.toMatchObject({
        code: "IMPORT_CONFLICT",
      });
      expect(await count(f.owner)).toBe(0);
    });
    it("pins a target-bound monetary replacement preview before merging a zero price", async () => {
      const map = {
        ...mapping,
        columns: {
          ...mapping.columns,
          purchaseMoney: {
            amountColumn: 3,
            fixedCurrency: "EUR",
            sourceKind: "DECIMAL",
            profileId: LEGACY_MONEY_PROFILE_ID,
          },
        },
      };
      const f = await fixture([["New title", "2", "9781234", "0"]], true, map),
        service = createImportCommitService(db);
      await db.collectibleItem.update({
        where: { id: f.itemId! },
        data: { purchaseAmountMinor: 125n, purchaseCurrency: "EUR" },
      });
      const selected = await service.prepareMergeTarget(f.actor, {
        jobId: f.job.id,
        rowNumber: 1,
        previewGeneration: f.job.previewGeneration,
        targetItemId: f.itemId,
      });
      const saved = await service.saveDecisions(f.actor, {
        jobId: f.job.id,
        expectedRevision: f.job.revision,
        previewGeneration: f.job.previewGeneration,
        decisions: [
          {
            rowNumber: 1,
            action: "MERGE",
            targetItemId: f.itemId,
            expectedTargetToken: selected.preconditionToken,
            fields: ["purchaseMoney"],
          },
        ],
      });
      const [row] = await db.$queryRaw<
        { decision: { replacementMoneyPreview?: { source: unknown } } }[]
      >`SELECT decision FROM "ImportRow" WHERE "jobId"=${f.job.id}::uuid`;
      expect(row!.decision.replacementMoneyPreview?.source).toMatchObject({
        intent: "REPLACE",
        expectedFactToken: selected.purchase.factToken,
      });
      await service.approveCommit(f.actor, {
        jobId: f.job.id,
        expectedRevision: saved.revision,
        previewGeneration: f.job.previewGeneration,
      });
      await createImportCommitter(service)({ jobId: f.job.id });
      expect(await db.collectibleItem.findUnique({ where: { id: f.itemId! } })).toMatchObject({
        title: "Keep title",
        quantity: 7,
        purchaseAmountMinor: 0n,
        purchaseCurrency: "EUR",
      });
      const view = await db.$transaction((tx) =>
        readMoneyFact(moneyTransaction(tx), { family: "PURCHASE", itemId: f.itemId! }, f.actor),
      );
      expect(view.interpretation.kind).toBe("INTERPRETED");
    });

    it("atomically rolls back inventory, money and row receipts on a real interrupted receipt write", async () => {
      const map = {
        ...mapping,
        columns: {
          ...mapping.columns,
          purchaseMoney: {
            amountColumn: 3,
            fixedCurrency: "EUR",
            sourceKind: "DECIMAL",
            profileId: LEGACY_MONEY_PROFILE_ID,
          },
        },
      };
      const f = await fixture([["Atomic", "1", "", "1.25"]], false, map),
        service = createImportCommitService(db);
      const saved = await service.saveDecisions(f.actor, {
        jobId: f.job.id,
        expectedRevision: f.job.revision,
        previewGeneration: f.job.previewGeneration,
        decisions: [{ rowNumber: 1, action: "CREATE" }],
      });
      await service.approveCommit(f.actor, {
        jobId: f.job.id,
        expectedRevision: saved.revision,
        previewGeneration: f.job.previewGeneration,
      });
      await db.$executeRawUnsafe(
        `CREATE FUNCTION test_commit_interrupt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."jobId"::text=TG_ARGV[0] AND NEW.status='COMMITTED' THEN RAISE EXCEPTION 'synthetic receipt interruption'; END IF; RETURN NEW; END $$`,
      );
      await db.$executeRawUnsafe(
        `CREATE TRIGGER test_commit_interrupt BEFORE UPDATE ON "ImportRow" FOR EACH ROW EXECUTE FUNCTION test_commit_interrupt('${f.job.id}')`,
      );
      try {
        await expect(service.commitNextBatch(f.job.id)).rejects.toThrow();
        expect(await count(f.owner)).toBe(0);
        expect(await f.source.getImportJob(f.actor, f.job.id)).toMatchObject({
          status: "COMMITTING",
          progress: { committedRows: 0 },
        });
      } finally {
        await db.$executeRawUnsafe('DROP TRIGGER test_commit_interrupt ON "ImportRow"');
        await db.$executeRawUnsafe("DROP FUNCTION test_commit_interrupt()");
      }
      await createImportCommitter(service)({ jobId: f.job.id });
      expect(await count(f.owner)).toBe(1);
    });
    it("serializes duplicate workers and freezes decisions after approval", async () => {
      const f = await fixture([
          ["One", "1", ""],
          ["Two", "1", ""],
        ]),
        service = createImportCommitService(db);
      const saved = await service.saveDecisions(f.actor, {
        jobId: f.job.id,
        expectedRevision: f.job.revision,
        previewGeneration: f.job.previewGeneration,
        decisions: [
          { rowNumber: 1, action: "CREATE" },
          { rowNumber: 2, action: "CREATE" },
        ],
      });
      await service.approveCommit(f.actor, {
        jobId: f.job.id,
        expectedRevision: saved.revision,
        previewGeneration: f.job.previewGeneration,
      });
      await expect(
        db.$executeRaw`UPDATE "ImportRow" SET decision=NULL WHERE "jobId"=${f.job.id}::uuid`,
      ).rejects.toThrow();
      const handler = createImportCommitter(service);
      await Promise.all([handler({ jobId: f.job.id }), handler({ jobId: f.job.id })]);
      expect(await count(f.owner)).toBe(2);
    });
    it("does not turn an unmapped default quantity into a merge overwrite", async () => {
      const f = await fixture([["Changed title", "999", "9781234"]], true, {
          ...mapping,
          columns: { title: 0, identifier: { column: 2, type: "ISBN" } },
        }),
        service = createImportCommitService(db);
      const selected = await service.prepareMergeTarget(f.actor, {
        jobId: f.job.id,
        rowNumber: 1,
        previewGeneration: f.job.previewGeneration,
        targetItemId: f.itemId,
      });
      await expect(
        service.saveDecisions(f.actor, {
          jobId: f.job.id,
          expectedRevision: f.job.revision,
          previewGeneration: f.job.previewGeneration,
          decisions: [
            {
              rowNumber: 1,
              action: "MERGE",
              targetItemId: f.itemId,
              expectedTargetToken: selected.preconditionToken,
              fields: ["quantity"],
            },
          ],
        }),
      ).rejects.toMatchObject({ code: "IMPORT_INVALID" });
      expect(await db.collectibleItem.findUnique({ where: { id: f.itemId! } })).toMatchObject({
        quantity: 7,
      });
    });
    it("refuses a changed money generation and closes the approved worker job without overwriting it", async () => {
      const map = {
        ...mapping,
        columns: {
          ...mapping.columns,
          purchaseMoney: {
            amountColumn: 3,
            fixedCurrency: "EUR",
            sourceKind: "DECIMAL",
            profileId: LEGACY_MONEY_PROFILE_ID,
          },
        },
      };
      const f = await fixture([["New title", "2", "9781234", "0"]], true, map),
        service = createImportCommitService(db);
      await db.collectibleItem.update({
        where: { id: f.itemId! },
        data: { purchaseAmountMinor: 125n, purchaseCurrency: "EUR" },
      });
      const selected = await service.prepareMergeTarget(f.actor, {
        jobId: f.job.id,
        rowNumber: 1,
        previewGeneration: f.job.previewGeneration,
        targetItemId: f.itemId,
      });
      const saved = await service.saveDecisions(f.actor, {
        jobId: f.job.id,
        expectedRevision: f.job.revision,
        previewGeneration: f.job.previewGeneration,
        decisions: [
          {
            rowNumber: 1,
            action: "MERGE",
            targetItemId: f.itemId,
            expectedTargetToken: selected.preconditionToken,
            fields: ["purchaseMoney"],
          },
        ],
      });
      await service.approveCommit(f.actor, {
        jobId: f.job.id,
        expectedRevision: saved.revision,
        previewGeneration: f.job.previewGeneration,
      });
      await createPersonalMoneyService(db, f.owner).updateItemV2(f.itemId!, {
        schemaVersion: 1,
        item: {},
        purchase: {
          op: "REPLACE",
          expectedFactToken: selected.purchase.factToken,
          authoring: {
            kind: "DECIMAL",
            profileId: LEGACY_MONEY_PROFILE_ID,
            currency: "EUR",
            decimal: "1.25",
          },
        },
      });
      await createImportCommitter(service)({ jobId: f.job.id });
      expect(await f.source.getImportJob(f.actor, f.job.id)).toMatchObject({
        status: "FAILED",
        progress: { committedRows: 0 },
      });
      expect(await db.collectibleItem.findUnique({ where: { id: f.itemId! } })).toMatchObject({
        purchaseAmountMinor: 125n,
        quantity: 7,
      });
    });

    it("rejects a duplicate introduced after preview before creating inventory", async () => {
      const f = await fixture([["New", "1", "9781234"]]),
        service = createImportCommitService(db);
      const saved = await service.saveDecisions(f.actor, {
        jobId: f.job.id,
        expectedRevision: f.job.revision,
        previewGeneration: f.job.previewGeneration,
        decisions: [{ rowNumber: 1, action: "CREATE" }],
      });
      await service.approveCommit(f.actor, {
        jobId: f.job.id,
        expectedRevision: saved.revision,
        previewGeneration: f.job.previewGeneration,
      });
      const id = randomUUID();
      await db.$executeRaw`INSERT INTO "CollectibleItem" (id,"ownerId","collectionId",title,"updatedAt") VALUES (${id}::uuid,${f.owner},${f.collection}::uuid,'Human added',now())`;
      await db.$executeRaw`INSERT INTO "ItemIdentifier" (id,"itemId",type,value,"normalizedValue") VALUES (${randomUUID()}::uuid,${id}::uuid,'ISBN','9781234','9781234')`;
      await createImportCommitter(service)({ jobId: f.job.id });
      expect(await count(f.owner)).toBe(1);
      expect(await f.source.getImportJob(f.actor, f.job.id)).toMatchObject({
        status: "FAILED",
        progress: { committedRows: 0 },
      });
    });
    it("requires one unambiguous merge per target in an approved job", async () => {
      const f = await fixture(
          [
            ["First", "1", "9781234"],
            ["Second", "2", "9781234"],
          ],
          true,
        ),
        service = createImportCommitService(db),
        decisions = [];
      for (let rowNumber = 1; rowNumber <= 2; rowNumber++) {
        const target = await service.prepareMergeTarget(f.actor, {
          jobId: f.job.id,
          rowNumber,
          previewGeneration: f.job.previewGeneration,
          targetItemId: f.itemId,
        });
        decisions.push({
          rowNumber,
          action: "MERGE",
          targetItemId: f.itemId,
          expectedTargetToken: target.preconditionToken,
          fields: ["title"],
        });
      }
      const saved = await service.saveDecisions(f.actor, {
        jobId: f.job.id,
        expectedRevision: f.job.revision,
        previewGeneration: f.job.previewGeneration,
        decisions,
      });
      await expect(
        service.approveCommit(f.actor, {
          jobId: f.job.id,
          expectedRevision: saved.revision,
          previewGeneration: f.job.previewGeneration,
        }),
      ).rejects.toMatchObject({ code: "IMPORT_CONFLICT" });
      expect(await count(f.owner)).toBe(1);
    });
    it("does not retain an old interpretation when UNKNOWN replaces the same raw numbers", async () => {
      const map = {
        ...mapping,
        columns: {
          ...mapping.columns,
          purchaseMoney: {
            amountColumn: 3,
            fixedCurrency: "EUR",
            sourceKind: "RAW",
            profileId: null,
            sourceContract: "LEGACY_UNKNOWN_RAW_V1",
          },
        },
      };
      const f = await fixture([["Source", "1", "9781234", "125"]], true, map),
        service = createImportCommitService(db),
        money = createPersonalMoneyService(db, f.owner);
      const previous = await money.getItemV2(f.itemId!);
      await money.updateItemV2(f.itemId!, {
        schemaVersion: 1,
        item: {},
        purchase: {
          op: "REPLACE",
          expectedFactToken: previous.purchase.factToken,
          authoring: {
            kind: "DECIMAL",
            profileId: LEGACY_MONEY_PROFILE_ID,
            currency: "EUR",
            decimal: "1.25",
          },
        },
      });
      const target = await service.prepareMergeTarget(f.actor, {
        jobId: f.job.id,
        rowNumber: 1,
        previewGeneration: f.job.previewGeneration,
        targetItemId: f.itemId,
      });
      expect(target.purchase.interpretation.kind).toBe("INTERPRETED");
      const saved = await service.saveDecisions(f.actor, {
        jobId: f.job.id,
        expectedRevision: f.job.revision,
        previewGeneration: f.job.previewGeneration,
        decisions: [
          {
            rowNumber: 1,
            action: "MERGE",
            targetItemId: f.itemId,
            expectedTargetToken: target.preconditionToken,
            fields: ["purchaseMoney"],
          },
        ],
      });
      await service.approveCommit(f.actor, {
        jobId: f.job.id,
        expectedRevision: saved.revision,
        previewGeneration: f.job.previewGeneration,
      });
      await createImportCommitter(service)({ jobId: f.job.id });
      const current = await money.getItemV2(f.itemId!);
      expect(current.purchase.raw).toEqual({ amountMinor: "125", currency: "EUR" });
      expect(current.purchase.interpretation.kind).toBe("UNKNOWN");
    });
    it("commits101 approved rows over bounded transactions and checks all durable receipts", async () => {
      const f = await fixture(Array.from({ length: 101 }, (_, i) => ["Item " + i, "1", ""])),
        service = createImportCommitService(db);
      let revision = f.job.revision;
      for (let start = 1; start <= 101; start += 100) {
        const saved = await service.saveDecisions(f.actor, {
          jobId: f.job.id,
          expectedRevision: revision,
          previewGeneration: f.job.previewGeneration,
          decisions: Array.from({ length: Math.min(100, 102 - start) }, (_, i) => ({
            rowNumber: start + i,
            action: "CREATE",
          })),
        });
        revision = saved.revision;
      }
      await service.approveCommit(f.actor, {
        jobId: f.job.id,
        expectedRevision: revision,
        previewGeneration: f.job.previewGeneration,
      });
      await createImportCommitter(service)({ jobId: f.job.id });
      await createImportCommitter(service)({ jobId: f.job.id });
      expect(await count(f.owner)).toBe(101);
      expect(await f.source.getImportJob(f.actor, f.job.id)).toMatchObject({
        status: "COMPLETED",
        progress: { committedRows: 101 },
      });
    });
  },
);
