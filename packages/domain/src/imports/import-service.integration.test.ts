import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Prisma } from "@sammlerraum/db/search-sql";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { LEGACY_MONEY_PROFILE_ID } from "@sammlerraum/contracts/legacy-money";
import { createImportService } from "./import-service";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
async function fixture() {
  const owner = `import-owner-${randomUUID()}`,
    collection = randomUUID();
  await db.$queryRaw`INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (${owner},'Synthetic import',${`${randomUUID()}@example.invalid`},false,now(),now()) RETURNING id`;
  await db.$queryRaw`INSERT INTO "Collection" (id,"ownerId",name,"updatedAt") VALUES (${collection}::uuid,${owner},'Import target',now()) RETURNING id`;
  return { owner, collection, actor: { userId: owner } };
}
const mapping = {
  schemaVersion: 1,
  locale: "de",
  columns: {
    title: 0,
    quantity: 1,
    identifier: { column: 2, type: "ISBN" },
    purchaseMoney: {
      amountColumn: 3,
      fixedCurrency: "EUR",
      sourceKind: "DECIMAL",
      profileId: LEGACY_MONEY_PROFILE_ID,
    },
  },
};
function input(collectionId: string) {
  return {
    collectionId,
    locale: "de",
    source: {
      format: "CSV",
      fileName: "synthetic.csv",
      byteSize: "1000",
      checksumSha256: "a".repeat(64),
    },
  };
}
async function parsed(jobId: string, rows: string[][]) {
  for (const [i, cells] of rows.entries())
    await db.$queryRaw`INSERT INTO "ImportRow" (id,"jobId","rowNumber","rowKey","rawCells","createdAt","updatedAt") VALUES (${randomUUID()}::uuid,${jobId}::uuid,${i + 1},${`${jobId}:${i + 1}`},${JSON.stringify(cells)}::jsonb,now(),now()) RETURNING id`;
  await db.$queryRaw`UPDATE "ImportJob" SET status='PARSED',"sourceVerifiedAt"=now(),"totalRows"=${rows.length},"parsedRows"=${rows.length} WHERE id=${jobId}::uuid RETURNING id`;
}
describe.runIf(enabled)("persisted owned import preview", () => {
  beforeAll(async () => {
    isolated = await createLegacyMoneyTestSchema();
    db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
  });
  afterAll(async () => {
    await db?.$disconnect();
    await isolated?.cleanup();
  });
  it("creates only an owned pending source intent and conceals foreign jobs/collections", async () => {
    const own = await fixture(),
      foreign = await fixture(),
      service = createImportService(db);
    const job = await service.createImportJob(own.actor, input(own.collection));
    expect(job).toMatchObject({
      status: "AWAITING_UPLOAD",
      source: { verified: false, format: "CSV", byteSize: "1000" },
      progress: { parsedRows: 0, previewedRows: 0 },
    });
    await expect(service.getImportJob(foreign.actor, job.id)).rejects.toMatchObject({
      code: "IMPORT_NOT_FOUND",
    });
    await expect(
      service.createImportJob(own.actor, input(foreign.collection)),
    ).rejects.toMatchObject({ code: "IMPORT_NOT_FOUND" });
    const [count] = await db.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) AS count FROM "CollectibleItem"`;
    expect(Number(count!.count)).toBe(0);
  });
  it("persists duplicate decisions while leaving real existing inventory unchanged", async () => {
    const f = await fixture(),
      service = createImportService(db),
      existing = randomUUID();
    await db.$queryRaw`INSERT INTO "CollectibleItem" (id,"collectionId","ownerId",title,quantity,"updatedAt") VALUES (${existing}::uuid,${f.collection}::uuid,${f.owner},'Existing title',8,now()) RETURNING id`;
    await db.$queryRaw`INSERT INTO "ItemIdentifier" (id,"itemId",type,value,"normalizedValue") VALUES (${randomUUID()}::uuid,${existing}::uuid,'ISBN','9781234','9781234') RETURNING id`;
    const job = await service.createImportJob(f.actor, input(f.collection));
    await parsed(job.id, [["Imported title", "2", "978-1 234", "1,25"]]);
    const preview = await service.buildImportPreview(f.actor, {
      jobId: job.id,
      expectedRevision: job.revision,
      mapping,
    });
    expect(preview).toMatchObject({
      job: { status: "REVIEW_READY", progress: { previewedRows: 1 } },
      complete: true,
      rows: [
        {
          status: "CONFLICT",
          matchingItemIds: [existing],
          allowedActions: ["SKIP", "MERGE", "CREATE_SEPARATE"],
          decision: null,
        },
      ],
    });
    const [actual] = await db.$queryRaw<
      { title: string; quantity: number }[]
    >`SELECT title,quantity FROM "CollectibleItem" WHERE id=${existing}::uuid`;
    expect(actual).toEqual({ title: "Existing title", quantity: 8 });
    const [count] = await db.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) AS count FROM "CollectibleItem" WHERE "ownerId"=${f.owner}`;
    expect(Number(count!.count)).toBe(1);
  });
});

describe.runIf(enabled)("resumable frozen import generations", () => {
  // The previous suite's fixture owns teardown, so this suite owns a separate schema.
  beforeAll(async () => {
    isolated = await createLegacyMoneyTestSchema();
    db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
  });
  afterAll(async () => {
    await db?.$disconnect();
    await isolated?.cleanup();
  });
  it("resumes bounded batches and updates duplicates from earlier batches before complete review", async () => {
    const f = await fixture(),
      service = createImportService(db),
      job = await service.createImportJob(f.actor, input(f.collection));
    await parsed(
      job.id,
      Array.from({ length: 101 }, (_, i) => [
        `Title ${i}`,
        "1",
        i === 0 || i === 100 ? "shared" : "unique" + i,
        "1,25",
      ]),
    );
    const first = await service.buildImportPreview(f.actor, {
      jobId: job.id,
      expectedRevision: job.revision,
      mapping,
    });
    expect(first).toMatchObject({
      complete: false,
      job: { status: "PREVIEWING", progress: { previewedRows: 100 } },
      rows: expect.any(Array),
    });
    expect(first.rows).toHaveLength(100);
    const second = await service.buildImportPreview(f.actor, {
      jobId: job.id,
      expectedRevision: first.job.revision,
      mapping,
    });
    expect(second).toMatchObject({
      complete: true,
      job: { status: "REVIEW_READY", progress: { previewedRows: 101 } },
    });
    const page = await service.getImportPreviewPage(f.actor, { jobId: job.id, limit: 1 });
    expect(page).toMatchObject({
      hasMore: true,
      nextAfterRowNumber: 1,
      items: [
        {
          rowNumber: "1",
          preview: {
            status: "CONFLICT",
            duplicateInSource: true,
            allowedActions: ["SKIP", "CREATE_SEPARATE"],
          },
        },
      ],
    });
    await expect(
      service.buildImportPreview(f.actor, {
        jobId: job.id,
        expectedRevision: first.job.revision,
        mapping,
      }),
    ).rejects.toMatchObject({ code: "IMPORT_CONFLICT" });
    const [count] = await db.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) AS count FROM "CollectibleItem" WHERE "ownerId"=${f.owner}`;
    expect(Number(count!.count)).toBe(0);
  });
  it("freezes a selected profile revision across edits and rejects a changed mapping", async () => {
    const f = await fixture(),
      service = createImportService(db),
      profile = await service.saveImportProfile(f.actor, { name: " My spreadsheet ", mapping });
    const job = await service.createImportJob(f.actor, input(f.collection));
    await parsed(job.id, [
      ["First", "1", "one", "1,25"],
      ["Second", "1", "two", "2,50"],
    ]);
    const first = await service.buildImportPreview(f.actor, {
      jobId: job.id,
      expectedRevision: job.revision,
      mappingProfileId: profile.id,
      expectedProfileRevision: profile.revision,
      batchSize: 1,
    });
    const changed = { ...mapping, columns: { ...mapping.columns, title: 1 } };
    const updated = await service.saveImportProfile(f.actor, {
      profileId: profile.id,
      expectedRevision: profile.revision,
      name: profile.name,
      mapping: changed,
    });
    expect(updated.revision).toBe(2);
    const second = await service.buildImportPreview(f.actor, {
      jobId: job.id,
      expectedRevision: first.job.revision,
      mappingProfileId: profile.id,
      expectedProfileRevision: 1,
      batchSize: 1,
    });
    expect(second.rows[0]?.values?.title).toBe("Second");
    expect(second.job.mappingProfile?.revision).toBe(1);
    expect(second.job.mapping?.columns.title).toBe(0);
    await expect(
      service.buildImportPreview(f.actor, {
        jobId: job.id,
        expectedRevision: second.job.revision,
        mappingProfileId: profile.id,
        expectedProfileRevision: 2,
      }),
    ).rejects.toMatchObject({ code: "IMPORT_CONFLICT" });
    await expect(
      service.saveImportProfile(f.actor, {
        profileId: profile.id,
        expectedRevision: 1,
        name: profile.name,
        mapping,
      }),
    ).rejects.toMatchObject({ code: "IMPORT_CONFLICT" });
  });
  it("keeps foreign profiles hidden even when the requested name collides with an own profile", async () => {
    const f = await fixture(),
      other = await fixture(),
      service = createImportService(db);
    const own = await service.saveImportProfile(f.actor, { name: "Own profile", mapping }),
      foreign = await service.saveImportProfile(other.actor, { name: "Foreign profile", mapping });
    await expect(
      service.saveImportProfile(f.actor, {
        profileId: foreign.id,
        expectedRevision: 1,
        name: own.name,
        mapping,
      }),
    ).rejects.toMatchObject({ code: "IMPORT_NOT_FOUND" });
  });
  it("serializes actual concurrent profile creation on separate PostgreSQL clients", async () => {
    const f = await fixture(),
      other = createTestDatabaseClient({
        databaseUrl: isolated.databaseUrl,
        schema: isolated.schema,
      });
    try {
      const results = await Promise.allSettled([
        createImportService(db).saveImportProfile(f.actor, { name: " Shared name ", mapping }),
        createImportService(other).saveImportProfile(f.actor, { name: "shared name", mapping }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const failed = results.find((r) => r.status === "rejected");
      expect(failed?.status === "rejected" ? failed.reason : null).toMatchObject({
        code: "IMPORT_CONFLICT",
      });
      const [count] = await db.$queryRaw<
        { count: bigint }[]
      >`SELECT count(*) AS count FROM "ImportMappingProfile" WHERE "ownerId"=${f.owner}`;
      expect(Number(count!.count)).toBe(1);
    } finally {
      await other.$disconnect();
    }
  });
  it("rolls back row previews and progress after an actual final statement timeout", async () => {
    const f = await fixture(),
      service = createImportService(db),
      job = await service.createImportJob(f.actor, input(f.collection));
    await parsed(job.id, [["Title", "1", "one", "1,25"]]);
    await db.$queryRaw(
      Prisma.raw(
        `CREATE FUNCTION test_import_preview_timeout() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN PERFORM pg_sleep(2.1); RETURN NEW; END $$`,
      ),
    );
    await db.$queryRaw(
      Prisma.raw(
        `CREATE TRIGGER test_import_preview_timeout BEFORE UPDATE ON "ImportJob" FOR EACH ROW WHEN (NEW.id='${job.id}'::uuid AND NEW.status='REVIEW_READY') EXECUTE FUNCTION test_import_preview_timeout()`,
      ),
    );
    try {
      await expect(
        service.buildImportPreview(f.actor, {
          jobId: job.id,
          expectedRevision: job.revision,
          mapping,
        }),
      ).rejects.toMatchObject({ code: "SEARCH_UNAVAILABLE" });
      const current = await service.getImportJob(f.actor, job.id);
      expect(current).toMatchObject({
        status: "PARSED",
        revision: job.revision,
        previewGeneration: 0,
        mapping: null,
        progress: { previewedRows: 0 },
      });
      const [row] = await db.$queryRaw<
        { status: string; preview: unknown }[]
      >`SELECT status,preview FROM "ImportRow" WHERE "jobId"=${job.id}::uuid`;
      expect(row).toEqual({ status: "PENDING", preview: null });
    } finally {
      await db.$queryRaw(Prisma.raw('DROP TRIGGER test_import_preview_timeout ON "ImportJob"'));
      await db.$queryRaw(Prisma.raw("DROP FUNCTION test_import_preview_timeout()"));
    }
  });
  it("refuses an unverified source and completes a genuinely empty parsed selection", async () => {
    const f = await fixture(),
      service = createImportService(db),
      job = await service.createImportJob(f.actor, input(f.collection));
    await expect(
      service.buildImportPreview(f.actor, {
        jobId: job.id,
        expectedRevision: job.revision,
        mapping,
      }),
    ).rejects.toMatchObject({ code: "IMPORT_NOT_READY" });
    await expect(service.getImportPreviewPage(f.actor, { jobId: job.id })).rejects.toMatchObject({
      code: "IMPORT_NOT_READY",
    });
    await parsed(job.id, []);
    const result = await service.buildImportPreview(f.actor, {
      jobId: job.id,
      expectedRevision: job.revision,
      mapping,
    });
    expect(result).toMatchObject({
      complete: true,
      rows: [],
      job: { status: "REVIEW_READY", progress: { totalRows: 0, previewedRows: 0 } },
    });
    expect(await service.getImportPreviewPage(f.actor, { jobId: job.id })).toMatchObject({
      items: [],
      hasMore: false,
      nextAfterRowNumber: null,
    });
  });
  it("does not use matching identifiers in foreign, other-collection or deleted inventory", async () => {
    const f = await fixture(),
      foreign = await fixture(),
      ownOther = randomUUID(),
      service = createImportService(db);
    await db.$queryRaw`INSERT INTO "Collection" (id,"ownerId",name,"updatedAt") VALUES (${ownOther}::uuid,${f.owner},'Other owned',now()) RETURNING id`;
    const excluded: string[] = [];
    for (const [owner, collection, deleted] of [
      [foreign.owner, foreign.collection, false],
      [f.owner, ownOther, false],
      [f.owner, f.collection, true],
    ] as const) {
      const id = randomUUID();
      excluded.push(id);
      await db.$queryRaw`INSERT INTO "CollectibleItem" (id,"ownerId","collectionId",title,quantity,"deletedAt","updatedAt") VALUES (${id}::uuid,${owner},${collection}::uuid,'Private excluded item',1,${deleted ? new Date() : null},now()) RETURNING id`;
      await db.$queryRaw`INSERT INTO "ItemIdentifier" (id,"itemId",type,value,"normalizedValue") VALUES (${randomUUID()}::uuid,${id}::uuid,'ISBN','same','SAME') RETURNING id`;
    }
    const job = await service.createImportJob(f.actor, input(f.collection));
    await parsed(job.id, [["Title", "1", "same", "1,25"]]);
    const result = await service.buildImportPreview(f.actor, {
      jobId: job.id,
      expectedRevision: job.revision,
      mapping,
    });
    expect(result.rows[0]).toMatchObject({
      status: "READY",
      matchingItemIds: [],
      allowedActions: ["CREATE", "SKIP"],
    });
    for (const id of excluded) expect(JSON.stringify(result)).not.toContain(id);
  });
  it("closes a corrupted complete generation before pagination instead of presenting partial rows", async () => {
    const f = await fixture(),
      service = createImportService(db),
      job = await service.createImportJob(f.actor, input(f.collection));
    await parsed(job.id, [
      ["First", "1", "one", "1,25"],
      ["Second", "1", "two", "1,25"],
    ]);
    const complete = await service.buildImportPreview(f.actor, {
      jobId: job.id,
      expectedRevision: job.revision,
      mapping,
    });
    await db.$queryRaw`DELETE FROM "ImportRow" WHERE "jobId"=${job.id}::uuid AND "rowNumber"=2 RETURNING id`;
    await expect(
      service.getImportPreviewPage(f.actor, { jobId: job.id, limit: 1 }),
    ).rejects.toMatchObject({ code: "SEARCH_INVARIANT" });
    await expect(
      service.buildImportPreview(f.actor, {
        jobId: job.id,
        expectedRevision: complete.job.revision,
        mapping,
      }),
    ).rejects.toMatchObject({ code: "SEARCH_INVARIANT" });
  });
  it("persists invalid rows as skippable errors while leaving inventory empty", async () => {
    const f = await fixture(),
      service = createImportService(db),
      job = await service.createImportJob(f.actor, input(f.collection));
    await parsed(job.id, [["Title", "1.5", "one", "1,25"]]);
    const result = await service.buildImportPreview(f.actor, {
      jobId: job.id,
      expectedRevision: job.revision,
      mapping,
    });
    expect(result).toMatchObject({
      complete: true,
      rows: [
        {
          status: "INVALID",
          values: null,
          errors: [{ field: "quantity", code: "INVALID_VALUE" }],
          allowedActions: ["SKIP"],
        },
      ],
    });
    const page = await service.getImportPreviewPage(f.actor, { jobId: job.id });
    expect(page.items[0]?.preview.status).toBe("INVALID");
    const [count] = await db.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) AS count FROM "CollectibleItem" WHERE "ownerId"=${f.owner}`;
    expect(Number(count!.count)).toBe(0);
  });
});
