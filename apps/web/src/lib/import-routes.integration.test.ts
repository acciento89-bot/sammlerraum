import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createMediaAssetLocker } from "@sammlerraum/db/media-lock";
import { LocalPersistentStorage } from "@sammlerraum/storage";
import { LEGACY_MONEY_PROFILE_ID } from "@sammlerraum/contracts/legacy-money";
import { createImportWorkflowService } from "@sammlerraum/domain/imports/import-workflow-service";
import { createImportService } from "@sammlerraum/domain/imports/import-service";
import { createImportCommitService } from "@sammlerraum/domain/imports/import-commit-service";
import { createImportParser } from "../../../worker/src/jobs/import-parser-runtime";
import { createPrismaImportParserRepository } from "../../../worker/src/jobs/import-parser-repository";
import { createImportCommitter } from "../../../worker/src/jobs/commit-import";
import { createImportRouteHandlers } from "./import-routes";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>,
  root: string;
const origin = "https://example.invalid";
async function fixture() {
  const owner = randomUUID(),
    collection = randomUUID();
  await db.$executeRaw`INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (${owner},'HTTP import',${`${owner}@example.invalid`},false,now(),now())`;
  await db.$executeRaw`INSERT INTO "Collection" (id,"ownerId",name,"updatedAt") VALUES (${collection}::uuid,${owner},'HTTP import',now())`;
  const getSession = vi.fn(async () => ({ user: { id: owner } })),
    lock = createMediaAssetLocker(isolated.databaseUrl),
    storage = new LocalPersistentStorage(root, lock),
    deps = { database: db, storage, lock, appOrigin: origin, getSession };
  return {
    owner,
    collection,
    getSession,
    handler: createImportRouteHandlers(deps),
    deps,
    storage,
    lock,
  };
}
function upload(collectionId: string) {
  const form = new FormData();
  form.append(
    "metadata",
    JSON.stringify({
      collectionId,
      locale: "de",
      fileName: "own.csv",
      format: "CSV",
      uploadRequestId: randomUUID(),
      parserOptions: { format: "CSV", hasHeader: true },
    }),
  );
  form.append("file", new Blob(["Title\nHTTP item\n"]), "own.csv");
  return new Request(origin + "/api/v1/imports/upload", {
    method: "POST",
    headers: { origin },
    body: form,
  });
}
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "real owned import HTTP boundary",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
      root = await mkdtemp(join(tmpdir(), "sammlerraum-import-http-"));
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
      if (root) await rm(root, { recursive: true, force: true });
    });
    it("uploads observed bytes and exposes only owned state and parsed header", async () => {
      const f = await fixture(),
        response = await f.handler.POST(upload(f.collection), "upload");
      expect(response.status).toBe(202);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const body = (await response.json()) as { uploadReady: boolean; job: { id: string } };
      expect(body.uploadReady).toBe(true);
      expect(JSON.stringify(body)).not.toContain("sourceStorageKey");
      const state = await f.handler.GET(
        new Request(origin + "/api/v1/imports/status?id=" + body.job.id),
        "status",
      );
      expect(state.status).toBe(200);
      expect(((await state.json()) as { job: { id: string } }).job.id).toBe(body.job.id);
      expect(f.getSession).toHaveBeenCalled();
    });
    it("rejects cross-origin mutations before auth and hides another owner job", async () => {
      const f = await fixture(),
        other = await fixture(),
        bad = upload(f.collection);
      bad.headers.set("origin", "https://foreign.invalid");
      expect((await f.handler.POST(bad, "upload")).status).toBe(403);
      expect(f.getSession).not.toHaveBeenCalled();
      const response = await other.handler.POST(upload(other.collection), "upload"),
        body = (await response.json()) as { job: { id: string } };
      expect(
        (
          await f.handler.GET(
            new Request(origin + "/api/v1/imports/status?id=" + body.job.id),
            "status",
          )
        ).status,
      ).toBe(404);
    });
    it("rejects duplicate JSON keys and query ambiguity without changing inventory", async () => {
      const f = await fixture();
      const request = new Request(origin + "/api/v1/imports/preview", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: '{"jobId":"' + randomUUID() + '","jobId":"' + randomUUID() + '"}',
      });
      expect((await f.handler.POST(request, "preview")).status).toBe(400);
      expect(
        (
          await f.handler.GET(
            new Request(
              origin + "/api/v1/imports/status?id=" + randomUUID() + "&id=" + randomUUID(),
            ),
            "status",
          )
        ).status,
      ).toBe(400);
      expect(await db.collectibleItem.count({ where: { ownerId: f.owner } })).toBe(0);
    });
    it("refuses monetary approval when authoring is off and commits exact money only when enabled", async () => {
      const f = await fixture(),
        actor = { userId: f.owner },
        uploaded = await createImportWorkflowService(db, f.storage, f.lock).uploadImport(
          actor,
          {
            collectionId: f.collection,
            locale: "de",
            fileName: "money.csv",
            format: "CSV",
            uploadRequestId: randomUUID(),
            parserOptions: { format: "CSV", hasHeader: true },
          },
          Buffer.from("Title,Price\nMoney item,12.34\n"),
        );
      await createImportParser(
        createPrismaImportParserRepository(db),
        f.storage,
        {},
        f.lock,
      )({ jobId: uploaded.job.id });
      const core = createImportService(db),
        commit = createImportCommitService(db),
        parsed = await core.getImportJob(actor, uploaded.job.id),
        preview = await core.buildImportPreview(actor, {
          jobId: parsed.id,
          expectedRevision: parsed.revision,
          mapping: {
            schemaVersion: 1,
            locale: "de",
            columns: {
              title: 0,
              purchaseMoney: {
                sourceKind: "DECIMAL",
                profileId: LEGACY_MONEY_PROFILE_ID,
                amountColumn: 1,
                fixedCurrency: "EUR",
              },
            },
          },
        }),
        saved = await commit.saveDecisions(actor, {
          jobId: parsed.id,
          expectedRevision: preview.job.revision,
          previewGeneration: preview.job.previewGeneration,
          decisions: [{ rowNumber: 1, action: "CREATE" }],
        });
      const approval = {
          jobId: parsed.id,
          expectedRevision: saved.revision,
          previewGeneration: preview.job.previewGeneration,
        },
        request = () =>
          new Request(origin + "/api/v1/imports/approve", {
            method: "POST",
            headers: { origin, "content-type": "application/json" },
            body: JSON.stringify(approval),
          });
      expect((await f.handler.POST(request(), "approve")).status).toBe(503);
      expect(await db.collectibleItem.count({ where: { ownerId: f.owner } })).toBe(0);
      const enabled = createImportRouteHandlers({ ...f.deps, authoringEnabled: true });
      expect((await enabled.POST(request(), "approve")).status).toBe(202);
      await createImportCommitter(commit)({ jobId: parsed.id });
      expect(
        await db.$queryRaw`SELECT "purchaseAmountMinor"::text AS amount,"purchaseCurrency" AS currency FROM "CollectibleItem" WHERE "ownerId"=${f.owner}`,
      ).toEqual([{ amount: "1234", currency: "EUR" }]);
    });
  },
);
