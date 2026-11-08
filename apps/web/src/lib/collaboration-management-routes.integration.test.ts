import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createMembershipService } from "@sammlerraum/domain/collaboration/membership-service";
import { createItemService } from "@sammlerraum/domain/items/item-service";
import {
  createCollaborationManagementDependencies,
  createCollaborationManagementHandlers,
} from "./collaboration-management-routes";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
const origin = "https://example.invalid";
function request(path: string, body?: unknown) {
  return new Request(
    origin + path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
}
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "management Request/Response handlers on PostgreSQL with controlled session port",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    it("accepts valid multibyte descriptions above 16KiB on create/update while bounding the actual request stream", async () => {
      const owner = randomUUID();
      await db.user.create({
        data: {
          id: owner,
          name: "Own multilingual request fixture",
          email: `${owner}@example.invalid`,
          emailVerified: true,
        },
      });
      const c = await db.collection.create({
          data: { ownerId: owner, name: "Multilingual collection" },
        }),
        handlers = createCollaborationManagementHandlers(
          createCollaborationManagementDependencies(
            db,
            { api: { getSession: async () => ({ user: { id: owner } }) } },
            origin,
          ),
        ),
        path = `/api/v1/collections/${c.id}/workspace/items`,
        description = "收藏品".repeat(3000);
      const created = await handlers.CREATE_SHARED_ITEM(
        request(path, { title: "Valid multilingual description", publicDescription: description }),
        c.id,
      );
      expect(created.status).toBe(200);
      const itemId = ((await created.json()) as { item: { id: string } }).item.id;
      const view = (await (await handlers.WORKSPACE(request(path), c.id)).json()) as {
        items: { id: string; updatedAt: string; latestSequence: string | null }[];
      };
      const item = view.items.find((row: { id: string }) => row.id === itemId);
      if (!item) throw Error("Created multilingual item absent from workspace");
      const updated = await handlers.UPDATE_SHARED_ITEM(
        request(path, {
          changes: { title: "Only title changed", publicDescription: description },
          expectedUpdatedAt: item.updatedAt,
          expectedLatestSequence: item.latestSequence,
        }),
        c.id,
        itemId,
      );
      expect(updated.status).toBe(200);
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: itemId } })).publicDescription,
      ).toBe(description);
      const escapedRequest = new Request(origin + path, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({
          title: "Valid escaped maximum",
          publicDescription: "品".repeat(10000),
        }).replaceAll("品", "\\u54c1"),
      });
      expect((await handlers.CREATE_SHARED_ITEM(escapedRequest, c.id)).status).toBe(200);
      const duplicateRequest = new Request(origin + path, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body:
          '{"title":"first","title":"second","publicDescription":' +
          JSON.stringify(description) +
          "}",
      });
      expect((await handlers.CREATE_SHARED_ITEM(duplicateRequest, c.id)).status).toBe(400);
      const oversized = { title: "Rejected oversize", publicDescription: "x".repeat(65536) };
      expect((await handlers.CREATE_SHARED_ITEM(request(path, oversized), c.id)).status).toBe(413);
      expect(
        (
          await handlers.UPDATE_SHARED_ITEM(
            request(path, {
              changes: oversized,
              expectedUpdatedAt: item.updatedAt,
              expectedLatestSequence: item.latestSequence,
            }),
            c.id,
            itemId,
          )
        ).status,
      ).toBe(413);
    });
    it("reads actual member roles, forbids Editor role management, persists Owner changes and hides Owner history from members", async () => {
      const owner = randomUUID(),
        editor = randomUUID(),
        viewer = randomUUID(),
        outsider = randomUUID();
      for (const id of [owner, editor, viewer, outsider])
        await db.user.create({
          data: {
            id,
            name: "Own management HTTP user",
            email: `${id}@example.invalid`,
            emailVerified: true,
          },
        });
      const collection = await db.collection.create({
          data: { ownerId: owner, name: "Managed HTTP collection" },
        }),
        item = await createItemService(db, owner).createItem({
          collectionId: collection.id,
          title: "Audited HTTP item",
        }),
        members = createMembershipService(db);
      await members.addMember(
        { userId: owner },
        { collectionId: collection.id, userId: editor, role: "EDITOR", expectedRevision: 0 },
      );
      await members.addMember(
        { userId: owner },
        { collectionId: collection.id, userId: viewer, role: "VIEWER", expectedRevision: 1 },
      );
      const handlers = (userId: string) =>
          createCollaborationManagementHandlers(
            createCollaborationManagementDependencies(
              db,
              { api: { getSession: async () => ({ user: { id: userId } }) } },
              origin,
            ),
          ),
        path = `/api/v1/collections/${collection.id}/members`,
        listing = await handlers(editor).GET_MEMBERS(request(path), collection.id);
      expect(listing.status).toBe(200);
      expect(await listing.json()).toMatchObject({ actorRole: "EDITOR", revision: 2 });
      expect((await handlers(outsider).GET_MEMBERS(request(path), collection.id)).status).toBe(404);
      const change = { action: "CHANGE_ROLE", userId: viewer, role: "EDITOR", expectedRevision: 2 };
      expect(
        (await handlers(editor).MUTATE_MEMBERS(request(path, change), collection.id)).status,
      ).toBe(403);
      expect(
        (await handlers(owner).MUTATE_MEMBERS(request(path, change), collection.id)).status,
      ).toBe(200);
      expect(
        (await handlers(owner).MUTATE_MEMBERS(request(path, change), collection.id)).status,
      ).toBe(409);
      expect(
        await db.collectionMember.findUniqueOrThrow({
          where: { collectionId_userId: { collectionId: collection.id, userId: viewer } },
        }),
      ).toMatchObject({ role: "EDITOR" });
      expect(
        await db.auditEvent.count({
          where: { resourceId: collection.id, action: "MEMBERSHIP_ROLE_CHANGED", actorId: owner },
        }),
      ).toBe(1);
      const auditPath = `/api/v1/audit?resourceType=ITEM&resourceId=${item.id}`;
      expect((await handlers(editor).AUDIT(request(auditPath))).status).toBe(404);
      const owned = await handlers(owner).AUDIT(request("/api/v1/audit"));
      expect(owned.status).toBe(200);
      expect(owned.headers.get("cache-control")).toBe("no-store");
      expect(await owned.json()).toMatchObject({
        events: expect.arrayContaining([
          expect.objectContaining({ resourceId: item.id, action: "ITEM_CREATED" }),
        ]),
      });
      expect((await handlers(editor).SHARING_SETUP(request(path), collection.id)).status).toBe(404);
    });

    it("creates and edits through actual Editor sessions, rejects stale requests and never exposes Owner-private fields", async () => {
      const owner = randomUUID(),
        editor = randomUUID(),
        viewer = randomUUID();
      for (const id of [owner, editor, viewer])
        await db.user.create({
          data: {
            id,
            name: "Own collaborative HTTP user",
            email: `${id}@example.invalid`,
            emailVerified: true,
          },
        });
      const c = await db.collection.create({ data: { ownerId: owner, name: "Editor HTTP scope" } }),
        members = createMembershipService(db);
      await members.addMember(
        { userId: owner },
        { collectionId: c.id, userId: editor, role: "EDITOR", expectedRevision: 0 },
      );
      await members.addMember(
        { userId: owner },
        { collectionId: c.id, userId: viewer, role: "VIEWER", expectedRevision: 1 },
      );
      const handlers = (id: string) =>
          createCollaborationManagementHandlers(
            createCollaborationManagementDependencies(
              db,
              { api: { getSession: async () => ({ user: { id } }) } },
              origin,
            ),
          ),
        path = `/api/v1/collections/${c.id}/workspace`,
        created = await handlers(editor).CREATE_SHARED_ITEM(
          request(path, { title: "Created via actual Editor session" }),
          c.id,
        );
      expect(created.status).toBe(200);
      const result = (await created.json()) as { item: { id: string } },
        itemId = result.item.id;
      await db.collectibleItem.update({
        where: { id: itemId },
        data: {
          privateNotes: "never-editor-http-private-sentinel",
          purchaseAmountMinor: 456n,
          purchaseCurrency: "EUR",
        },
      });
      const listing = await handlers(editor).WORKSPACE(request(path), c.id);
      expect(listing.status).toBe(200);
      const view = (await listing.json()) as {
        items: { id: string; updatedAt: string; latestSequence: string | null }[];
      };
      expect(JSON.stringify(view)).not.toMatch(
        /never-editor-http-private-sentinel|purchaseAmountMinor|purchaseCurrency|privateNotes/,
      );
      const version = view.items[0]!,
        body = {
          changes: { title: "Updated by Editor" },
          expectedUpdatedAt: version.updatedAt,
          expectedLatestSequence: version.latestSequence,
        };
      expect(
        (await handlers(viewer).UPDATE_SHARED_ITEM(request(path, body), c.id, itemId)).status,
      ).toBe(404);
      expect(
        (await handlers(editor).UPDATE_SHARED_ITEM(request(path, body), c.id, itemId)).status,
      ).toBe(200);
      expect(
        (await handlers(editor).UPDATE_SHARED_ITEM(request(path, body), c.id, itemId)).status,
      ).toBe(409);
      expect(await db.collectibleItem.findUniqueOrThrow({ where: { id: itemId } })).toMatchObject({
        ownerId: owner,
        title: "Updated by Editor",
        privateNotes: "never-editor-http-private-sentinel",
        purchaseAmountMinor: 456n,
      });
      expect(
        await db.auditEvent.findFirstOrThrow({
          where: { resourceId: itemId, action: "ITEM_DETAILS_CHANGED" },
        }),
      ).toMatchObject({ actorId: editor, source: "USER" });
      expect(
        (
          await handlers(editor).CREATE_SHARED_ITEM(
            request(path, { title: "Forged", ownerId: owner }),
            c.id,
          )
        ).status,
      ).toBe(400);
    });
  },
);
