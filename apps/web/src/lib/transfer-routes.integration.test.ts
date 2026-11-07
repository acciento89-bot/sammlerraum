import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createMediaAssetLocker } from "@sammlerraum/db/media-lock";
import { LocalPersistentStorage } from "@sammlerraum/storage";
import { createExportService } from "@sammlerraum/domain/exports/export-service";
import { createPrismaTabularExportRepository } from "../../../worker/src/jobs/tabular-export-repository";
import { createTabularExportJob } from "../../../worker/src/jobs/tabular-export-runtime";
import { createArtifactRouteHandlers } from "./artifact-routes";
import { createInsuranceRouteHandlers } from "./insurance-routes";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>,
  root: string;
const origin = "https://example.invalid";
async function fixture() {
  const owner = randomUUID(),
    collection = randomUUID();
  await db.$executeRaw`INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (${owner},'Transfer HTTP',${`${owner}@example.invalid`},false,now(),now())`;
  await db.$executeRaw`INSERT INTO "Collection" (id,"ownerId",name,"updatedAt") VALUES (${collection}::uuid,${owner},'Transfer HTTP',now())`;
  await db.$executeRaw`INSERT INTO "CollectibleItem" (id,"ownerId","collectionId",title,"updatedAt") VALUES (${randomUUID()}::uuid,${owner},${collection}::uuid,'HTTP export item',now())`;
  const getSession = vi.fn(async () => ({ user: { id: owner } })),
    lock = createMediaAssetLocker(isolated.databaseUrl),
    storage = new LocalPersistentStorage(root, lock),
    deps = { database: db, storage, lock, appOrigin: origin, getSession };
  return {
    owner,
    collection,
    getSession,
    lock,
    storage,
    artifact: createArtifactRouteHandlers(deps),
    insurance: createInsuranceRouteHandlers(deps),
  };
}
const post = (body: unknown, originHeader = origin) =>
  new Request(origin + "/api/v1/exports", {
    method: "POST",
    headers: { origin: originHeader, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual private transfer HTTP boundaries",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
      root = await mkdtemp(join(tmpdir(), "sammlerraum-transfer-http-"));
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
      if (root) await rm(root, { recursive: true, force: true });
    });
    it("requests and downloads a real private export through owner-only HTTP", async () => {
      const f = await fixture(),
        response = await f.artifact.POST_EXPORT(
          post({
            scope: { kind: "COLLECTION", collectionId: f.collection },
            locale: "de",
            format: "CSV",
          }),
        );
      expect(response.status).toBe(202);
      const job = (await response.json()) as { id: string };
      await createTabularExportJob(
        createPrismaTabularExportRepository(db),
        createExportService(db),
        f.storage,
        f.lock,
      )({ jobId: job.id });
      const history = await f.artifact.GET_HISTORY(new Request(origin + "/api/v1/exports"));
      expect(history.status).toBe(200);
      expect(JSON.stringify(await history.json())).not.toContain("storageKey");
      const download = await f.artifact.GET_DOWNLOAD(
        new Request(origin + "/api/v1/exports/download?kind=TABULAR&id=" + job.id),
      );
      expect(download.status).toBe(200);
      expect(download.headers.get("cache-control")).toBe("no-store");
      expect(download.headers.get("content-disposition")).toContain("attachment;");
      expect(download.headers.get("x-content-type-options")).toBe("nosniff");
      expect(await download.text()).toContain("HTTP export item");
    });
    it("saves private insurance with revision checking and hides it from another account", async () => {
      const f = await fixture(),
        other = await fixture(),
        target = { kind: "COLLECTION", collectionId: f.collection },
        input = {
          target,
          expectedRevision: 0,
          insurance: {
            amountMinor: "12345",
            currency: "EUR",
            valuationDate: "2026-01-01",
            policyReference: "Private policy",
          },
        };
      const response = await f.insurance.PUT(post(input));
      expect(response.status).toBe(200);
      expect((await response.json()) as unknown).toMatchObject({
        revision: 1,
        insurance: { amountMinor: "12345", minorUnitExponent: 2, basis: "COLLECTION_TOTAL" },
      });
      expect((await f.insurance.PUT(post(input))).status).toBe(409);
      const url = origin + "/api/v1/insurance?kind=COLLECTION&id=" + f.collection;
      expect((await other.insurance.GET(new Request(url))).status).toBe(404);
      expect((await f.insurance.GET(new Request(url))).status).toBe(200);
    });
    it("rejects foreign origins before auth and malformed or duplicate JSON inputs", async () => {
      const f = await fixture();
      expect((await f.artifact.POST_EXPORT(post({}, "https://foreign.invalid"))).status).toBe(403);
      expect(f.getSession).not.toHaveBeenCalled();
      expect((await f.insurance.PUT(post({}, "https://foreign.invalid"))).status).toBe(403);
      expect(f.getSession).not.toHaveBeenCalled();
      expect((await f.artifact.POST_EXPORT(post('{"format":"CSV","format":"XLSX"}'))).status).toBe(
        400,
      );
      expect(
        (await f.insurance.PUT(post('{"expectedRevision":0,"expectedRevision":1}'))).status,
      ).toBe(400);
    });
    it("rejects ambiguous download selectors and never accepts arbitrary asset or storage paths", async () => {
      const f = await fixture();
      for (const query of [
        "kind=TABULAR&id=" + randomUUID() + "&id=" + randomUUID(),
        "kind=TABULAR&id=" + randomUUID() + "&storageKey=private",
        "kind=unknown&id=" + randomUUID(),
      ])
        expect(
          (await f.artifact.GET_DOWNLOAD(new Request(origin + "/api/v1/exports/download?" + query)))
            .status,
        ).toBe(400);
    });
  },
);
