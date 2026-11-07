import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createMediaAssetLocker } from "@sammlerraum/db/media-lock";
import { LocalPersistentStorage } from "@sammlerraum/storage";
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
    handler = createImportRouteHandlers({
      database: db,
      storage: new LocalPersistentStorage(root, lock),
      lock,
      appOrigin: origin,
      getSession,
    });
  return { owner, collection, getSession, handler };
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
  },
);
