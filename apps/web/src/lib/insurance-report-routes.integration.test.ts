import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import {
  createInsuranceReportRouteHandlers,
  createInsuranceReportRouteDependencies,
} from "./insurance-report-routes";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
const origin = "https://example.invalid";
async function fixture() {
  const owner = randomUUID(),
    collection = randomUUID();
  await db.$executeRaw`INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (${owner},'Routed report',${`${owner}@example.invalid`},false,now(),now())`;
  await db.$executeRaw`INSERT INTO "Collection" (id,"ownerId",name,"updatedAt") VALUES (${collection}::uuid,${owner},'Routed report',now())`;
  const getSession = vi.fn(async () => ({ user: { id: owner } }));
  const handler = createInsuranceReportRouteHandlers(
    createInsuranceReportRouteDependencies(db, { api: { getSession } }, origin),
  );
  return { owner, collection, getSession, handler };
}
const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(origin + "/api/v1/reports/insurance", {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual private PDF request HTTP envelope",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    it("derives actor only from fresh auth and persists a private pending intent", async () => {
      const f = await fixture();
      const response = await f.handler.POST(
        request({ scope: { kind: "COLLECTION", collectionId: f.collection }, locale: "de" }),
      );
      expect(response.status).toBe(202);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-request-id")).toBeTruthy();
      const job = (await response.json()) as { id: string; status: string };
      expect(Object.keys(job).sort()).toEqual(["id", "status"]);
      expect(job.status).toBe("PENDING");
      expect(
        await db.$queryRaw`SELECT "ownerId",format FROM "ReportJob" WHERE id=${job.id}::uuid`,
      ).toEqual([{ ownerId: f.owner, format: "PDF" }]);
      expect(f.getSession).toHaveBeenCalledWith(
        expect.objectContaining({ query: { disableCookieCache: true, disableRefresh: true } }),
      );
    });
    it("rejects foreign origins before auth, foreign collections, owner overrides and duplicate JSON keys", async () => {
      const f = await fixture(),
        other = await fixture();
      expect(
        (
          await f.handler.POST(
            request(
              { scope: { kind: "ALL" }, locale: "en" },
              { origin: "https://foreign.invalid" },
            ),
          )
        ).status,
      ).toBe(403);
      expect(f.getSession).not.toHaveBeenCalled();
      expect(
        (
          await f.handler.POST(
            request({
              scope: { kind: "COLLECTION", collectionId: other.collection },
              locale: "en",
            }),
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await f.handler.POST(
            request({ scope: { kind: "ALL" }, locale: "en", ownerId: other.owner }),
          )
        ).status,
      ).toBe(400);
      expect(
        (await f.handler.POST(request('{"scope":{"kind":"ALL"},"locale":"de","locale":"en"}')))
          .status,
      ).toBe(400);
      expect(
        (
          await f.handler.POST(
            request({ scope: { kind: "ALL" }, locale: "en", query: { limit: 50 } }),
          )
        ).status,
      ).toBe(400);
      expect(await db.$queryRaw`SELECT id FROM "ReportJob" WHERE "ownerId"=${f.owner}`).toEqual([]);
    });
    it("requires a session and counts actual body bytes without trusting content length", async () => {
      const f = await fixture();
      const anonymous = createInsuranceReportRouteHandlers(
        createInsuranceReportRouteDependencies(
          db,
          { api: { getSession: async () => null } },
          origin,
        ),
      );
      expect((await anonymous.POST(request({ scope: { kind: "ALL" }, locale: "en" }))).status).toBe(
        401,
      );
      expect(
        (await f.handler.POST(request("x".repeat(16385), { "content-length": "1" }))).status,
      ).toBe(413);
      expect(
        (
          await f.handler.POST(
            request({ scope: { kind: "ALL" }, locale: "en" }, { "content-type": "text/plain" }),
          )
        ).status,
      ).toBe(400);
    });
  },
);
