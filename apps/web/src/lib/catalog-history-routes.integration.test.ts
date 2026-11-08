import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createCategoryTemplateMaintenanceService } from "@sammlerraum/domain/catalog/category-template-service";
import { createCatalogMaintenanceService } from "@sammlerraum/domain/catalog/catalog-service";
import {
  createCatalogLinkRouteDependencies,
  createCatalogLinkRouteHandlers,
} from "./catalog-link-routes";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const owner = `history_owner_${randomUUID()}`;
let categoryId: string, entryId: string;
let actor: string | null = owner;
const auth = { api: { getSession: async () => (actor ? { user: { id: actor } } : null) } };
const handlers = () =>
  createCatalogLinkRouteHandlers(
    createCatalogLinkRouteDependencies(db!, auth, "http://localhost:3000"),
  );
const request = (path: string) => new Request(`http://localhost:3000${path}`);
describe.runIf(enabled)("history HTTP and advisory authority", () => {
  beforeAll(async () => {
    await db!.user.create({
      data: { id: owner, name: "History fixture", email: `${owner}@example.test` },
    });
    categoryId = (
      await createCategoryTemplateMaintenanceService(db!).createCategoryTemplate({
        key: `httphistory_${randomUUID().replaceAll("-", "")}`,
        labels: { de: "Historie", en: "History" },
      })
    ).id;
    entryId = (
      await createCatalogMaintenanceService(db!).createCatalogEntry({
        categoryTemplateId: categoryId,
        text: { language: "en", title: "History reference" },
        sources: [{ note: "Reference source" }],
      })
    ).state.id;
  });
  afterAll(async () => {
    if (!db) return;
    await db.applicationRoleGrant.deleteMany({ where: { userId: owner } });
    await db.user.deleteMany({ where: { id: owner } });
    await db.catalogRevision.deleteMany({ where: { entryId } });
    await db.catalogEntry.deleteMany({ where: { id: entryId } });
    await db.categoryTemplate.deleteMany({ where: { id: categoryId } });
    await db.$disconnect();
  });
  it("serves bounded canonical history with no-store and strict inputs", async () => {
    actor = owner;
    const list = await handlers().HISTORY(request("/?limit=1"), entryId);
    expect(list.status).toBe(200);
    expect(list.headers.get("cache-control")).toBe("no-store");
    expect(
      ((await list.json()) as { revisions: Array<{ revision: number; text: { title: string } }> })
        .revisions[0],
    ).toMatchObject({ revision: 1, text: { title: "History reference" } });
    expect((await handlers().REVISION(request("/"), entryId, "1")).status).toBe(200);
    for (const query of ["?limit=51", "?limit=1&limit=2", "?other=1", "?cursor=bad"])
      expect((await handlers().HISTORY(request(`/${query}`), entryId)).status).toBe(400);
    for (const revision of ["0", "01", "1.2", "2147483648"])
      expect((await handlers().REVISION(request("/"), entryId, revision)).status).toBe(400);
    expect((await handlers().REVISION(request("/"), entryId, "2")).status).toBe(404);
    actor = null;
    expect((await handlers().HISTORY(request("/"), entryId)).status).toBe(401);
    actor = owner;
  });
  it("reports only actual own grant capability and immediately observes revocation", async () => {
    actor = owner;
    expect(await (await handlers().CAPABILITIES(request("/"))).json()).toEqual({
      canModerate: false,
    });
    await db!.applicationRoleGrant.create({
      data: {
        userId: owner,
        role: "MODERATOR",
        grantedBy: "synthetic test",
        reason: "Synthetic browser authority",
      },
    });
    expect(await (await handlers().CAPABILITIES(request("/"))).json()).toEqual({
      canModerate: true,
    });
    await db!.applicationRoleGrant.delete({ where: { userId: owner } });
    expect(await (await handlers().CAPABILITIES(request("/"))).json()).toEqual({
      canModerate: false,
    });
    expect((await handlers().CAPABILITIES(request("/?role=ADMIN"))).status).toBe(400);
    actor = null;
    expect((await handlers().CAPABILITIES(request("/"))).status).toBe(401);
    actor = owner;
  });
});
