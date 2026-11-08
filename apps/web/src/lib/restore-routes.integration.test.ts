import type { createRestoreService } from "@sammlerraum/domain/audit/restore-service";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createItemService } from "@sammlerraum/domain/items/item-service";
import { createAuditService } from "@sammlerraum/domain/audit/audit-service";
import { createRestoreRouteDependencies, createRestoreRouteHandlers } from "./restore-routes";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
const origin = "https://example.invalid";
function request(eventId: string, body?: unknown, from = origin) {
  return new Request(
    `${origin}/api/v1/audit/${eventId}/restore`,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { origin: from, "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
}
async function fixture() {
  const owner = randomUUID(),
    outsider = randomUUID();
  for (const id of [owner, outsider])
    await db.user.create({
      data: {
        id,
        name: "Owned restoration HTTP fixture",
        email: `${id}@example.invalid`,
        emailVerified: true,
      },
    });
  const collection = await db.collection.create({
      data: { ownerId: owner, name: "Private restoration collection" },
    }),
    items = createItemService(db, owner),
    item = await items.createItem({
      collectionId: collection.id,
      title: "HTTP restoration",
      privateNotes: "private-restore-http-sentinel",
    });
  await items.updateItem(item.id, { visibility: "PUBLIC" });
  const event = (
    await createAuditService(db).listAuditEventsForResource(
      { userId: owner },
      { resourceType: "ITEM", resourceId: item.id },
    )
  ).events.find((value) => value.action === "ITEM_VISIBILITY_CHANGED")!;
  const handlers = (userId: string | null) =>
    createRestoreRouteHandlers(
      createRestoreRouteDependencies(
        db,
        { api: { getSession: async () => (userId ? { user: { id: userId } } : null) } },
        origin,
      ),
    );
  return { owner, outsider, item: item.id, event: event.id, handlers };
}
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "restoration HTTP with native PostgreSQL and controlled server-session port",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    it("previews the owned field, persists an append-only restoration and rejects replay", async () => {
      const f = await fixture(),
        handlers = f.handlers(f.owner),
        preview = await handlers.GET(request(f.event), f.event);
      expect(preview.status).toBe(200);
      expect(preview.headers.get("cache-control")).toBe("no-store");
      const value = (await preview.json()) as Awaited<
        ReturnType<ReturnType<typeof createRestoreService>["getRestorePreview"]>
      >;
      expect(JSON.stringify(value)).not.toContain("private-restore-http-sentinel");
      expect(value.supportedFields).toEqual(["visibility"]);
      const body = { field: "visibility", ...value.preconditions },
        restored = await handlers.POST(request(f.event, body), f.event);
      expect(restored.status).toBe(200);
      expect(await restored.json()).toMatchObject({
        restored: true,
        resourceId: f.item,
        field: "visibility",
      });
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item } })).visibility,
      ).toBe("PRIVATE");
      expect((await handlers.POST(request(f.event, body), f.event)).status).toBe(409);
      expect(
        await db.auditEvent.count({
          where: { resourceId: f.item, action: "ITEM_VISIBILITY_RESTORED", actorId: f.owner },
        }),
      ).toBe(1);
    });
    it("denies foreign and absent sessions and rejects cross-origin writes without a mutation", async () => {
      const f = await fixture(),
        preview = await f.handlers(f.owner).GET(request(f.event), f.event),
        value = (await preview.json()) as Awaited<
          ReturnType<ReturnType<typeof createRestoreService>["getRestorePreview"]>
        >,
        body = { field: "visibility", ...value.preconditions };
      expect((await f.handlers(f.outsider).GET(request(f.event), f.event)).status).toBe(404);
      expect((await f.handlers(f.outsider).POST(request(f.event, body), f.event)).status).toBe(404);
      expect((await f.handlers(null).POST(request(f.event, body), f.event)).status).toBe(401);
      expect(
        (await f.handlers(f.owner).POST(request(f.event, body, "https://foreign.invalid"), f.event))
          .status,
      ).toBe(403);
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item } })).visibility,
      ).toBe("PUBLIC");
      expect(
        await db.auditEvent.count({
          where: { resourceId: f.item, action: "ITEM_VISIBILITY_RESTORED" },
        }),
      ).toBe(0);
    });
    it("rejects stale confirmation after a genuine intervening item edit", async () => {
      const f = await fixture(),
        handlers = f.handlers(f.owner),
        preview = await handlers.GET(request(f.event), f.event),
        value = (await preview.json()) as Awaited<
          ReturnType<ReturnType<typeof createRestoreService>["getRestorePreview"]>
        >;
      await createItemService(db, f.owner).updateItem(f.item, { title: "Concurrent edited title" });
      const result = await handlers.POST(
        request(f.event, { field: "visibility", ...value.preconditions }),
        f.event,
      );
      expect(result.status).toBe(409);
      expect(await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item } })).toMatchObject({
        visibility: "PUBLIC",
        title: "Concurrent edited title",
      });
    });
  },
);
