import { Prisma } from "@sammlerraum/db/search-sql";
import { randomUUID, randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createMembershipService } from "../collaboration/membership-service";
import { createAuditService, recordAuditEventInTransaction } from "./audit-service";
import { createTrustedAuditContext, type AuditContext } from "./audit-context";
import { runTransferTransaction } from "../collaboration/transfer-transaction";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
async function fixture() {
  const owner = randomUUID(),
    other = randomUUID();
  for (const id of [owner, other])
    await db.user.create({
      data: {
        id,
        email: `${id}@example.invalid`,
        name: "Owned audit fixture",
        emailVerified: true,
      },
    });
  const collection = await db.collection.create({
      data: { ownerId: owner, name: "Private audited collection" },
    }),
    item = await db.collectibleItem.create({
      data: { ownerId: owner, collectionId: collection.id, title: "Audited item" },
    });
  return {
    owner,
    other,
    collection: collection.id,
    item: item.id,
    who: { userId: owner },
    service: createAuditService(db),
  };
}
const change = (item: string) => ({
  resourceType: "ITEM",
  resourceId: item,
  action: "ITEM_VISIBILITY_CHANGED",
  source: "USER",
  before: { visibility: "PRIVATE" },
  after: { visibility: "PUBLIC" },
});
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "native append-only audit history",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    it("records original actor, source, exact before/after and database time", async () => {
      const f = await fixture();
      await db.collectibleItem.update({ where: { id: f.item }, data: { visibility: "PUBLIC" } });
      const event = await f.service.recordAuditEvent(f.who, change(f.item));
      expect(event).toMatchObject({
        resourceType: "ITEM",
        resourceId: f.item,
        actorId: f.owner,
        source: "USER",
        action: "ITEM_VISIBILITY_CHANGED",
        before: { visibility: "PRIVATE" },
        after: { visibility: "PUBLIC" },
      });
      expect(event.sequence).toMatch(/^[1-9][0-9]*$/);
      expect(Math.abs(Date.parse(event.createdAt) - Date.now())).toBeLessThan(10000);
      expect(
        (
          await f.service.listAuditEventsForResource(f.who, {
            resourceType: "ITEM",
            resourceId: f.item,
          })
        ).events,
      ).toEqual([event]);
    });
    it("rejects auth/session/byte dumps and forged user/source identity before appending", async () => {
      const f = await fixture();
      for (const input of [
        { ...change(f.item), before: { visibility: "PRIVATE", accessToken: "never-store-secret" } },
        { ...change(f.item), actorId: f.other },
        { ...change(f.item), after: { visibility: "PUBLIC", documentBytes: "never-store-bytes" } },
      ])
        await expect(f.service.recordAuditEvent(f.who, input)).rejects.toMatchObject({
          code: "AUDIT_INVALID",
        });
      await expect(
        f.service.recordAuditEvent(f.who, { ...change(f.item), source: "SYSTEM" }),
      ).rejects.toMatchObject({ code: "AUDIT_FORBIDDEN" });
      expect(
        (
          await f.service.listAuditEventsForResource(f.who, {
            resourceType: "ITEM",
            resourceId: f.item,
          })
        ).events,
      ).toEqual([]);
    });
    it("blocks arbitrary SQL rewriting/deletion and foreign-owner reads/writes", async () => {
      const f = await fixture(),
        event = await f.service.recordAuditEvent(f.who, change(f.item));
      await expect(
        db.$executeRaw`UPDATE "AuditEvent" SET source='SYSTEM' WHERE id=${event.id}::uuid`,
      ).rejects.toThrow();
      await expect(
        db.$executeRaw`DELETE FROM "AuditEvent" WHERE id=${event.id}::uuid`,
      ).rejects.toThrow();
      await expect(
        f.service.recordAuditEvent({ userId: f.other }, change(f.item)),
      ).rejects.toMatchObject({ code: "AUDIT_NOT_FOUND" });
      await expect(
        f.service.listAuditEventsForResource(
          { userId: f.other },
          { resourceType: "ITEM", resourceId: f.item },
        ),
      ).rejects.toMatchObject({ code: "AUDIT_NOT_FOUND" });
    });
    it("retains an item's history after moving it and deleting the old collection", async () => {
      const f = await fixture(),
        event = await f.service.recordAuditEvent(f.who, change(f.item)),
        target = await db.collection.create({
          data: { ownerId: f.owner, name: "Current collection" },
        });
      await db.collectibleItem.update({ where: { id: f.item }, data: { collectionId: target.id } });
      await db.collection.delete({ where: { id: f.collection } });
      expect(
        (
          await f.service.listAuditEventsForResource(f.who, {
            resourceType: "ITEM",
            resourceId: f.item,
          })
        ).events,
      ).toEqual([event]);
    });
    it("follows current ownership, preserves the true original actor and permits actual actor/account erasure", async () => {
      const f = await fixture(),
        event = await f.service.recordAuditEvent(f.who, change(f.item)),
        members = createMembershipService(db);
      await members.addMember(f.who, {
        collectionId: f.collection,
        userId: f.other,
        role: "EDITOR",
        expectedRevision: 0,
      });
      await members.transferOwnership(f.who, {
        collectionId: f.collection,
        newOwnerId: f.other,
        expectedRevision: 1,
        confirmPrivateTransfer: true,
      });
      await expect(
        f.service.listAuditEventsForResource(f.who, { resourceType: "ITEM", resourceId: f.item }),
      ).rejects.toMatchObject({ code: "AUDIT_NOT_FOUND" });
      expect(
        (
          await f.service.listAuditEventsForResource(
            { userId: f.other },
            { resourceType: "ITEM", resourceId: f.item },
          )
        ).events,
      ).toContainEqual(event);
      await expect(
        db.$executeRaw`UPDATE "AuditEvent" SET "actorId"=NULL WHERE id=${event.id}::uuid`,
      ).rejects.toThrow();
      await db.user.delete({ where: { id: f.owner } });
      expect(
        (
          await f.service.listAuditEventsForResource(
            { userId: f.other },
            { resourceType: "ITEM", resourceId: f.item },
          )
        ).events,
      ).toContainEqual({ ...event, actorId: null });
      await db.user.delete({ where: { id: f.other } });
      expect(await db.$queryRaw`SELECT id FROM "AuditEvent" WHERE id=${event.id}::uuid`).toEqual(
        [],
      );
    });
    it("records all declared sources only through genuine server contexts and rejects copied context objects", async () => {
      const f = await fixture(),
        { source: _, ...mutation } = change(f.item),
        genuine = createTrustedAuditContext({ source: "USER", actorId: f.owner });
      for (const fake of [
        JSON.parse(JSON.stringify(genuine)),
        { ...genuine, source: "SYSTEM" },
        Object.create(genuine),
      ])
        await expect(
          runTransferTransaction(db, (tx) =>
            recordAuditEventInTransaction(tx, fake as AuditContext, mutation),
          ),
        ).rejects.toMatchObject({ code: "AUDIT_INVALID" });
      for (const source of [
        "USER",
        "IMPORT",
        "AI",
        "MARKET_SYNC",
        "SYSTEM",
        "MODERATION",
      ] as const) {
        const event = await runTransferTransaction(db, (tx) =>
          recordAuditEventInTransaction(
            tx,
            createTrustedAuditContext({ source, actorId: source === "USER" ? f.owner : null }),
            mutation,
          ),
        );
        expect(event.source).toBe(source);
        expect(event.actorId).toBe(source === "USER" ? f.owner : null);
      }
      expect(
        (
          await f.service.listAuditEventsForResource(f.who, {
            resourceType: "ITEM",
            resourceId: f.item,
          })
        ).events,
      ).toHaveLength(6);
    });
    it("rolls audit and the actual inventory mutation back together in the caller's transaction", async () => {
      const f = await fixture(),
        { source: _, ...mutation } = change(f.item);
      let appended = false;
      await expect(
        runTransferTransaction(db, async (tx) => {
          await tx.$queryRaw(
            Prisma.sql`UPDATE "CollectibleItem" SET visibility='PUBLIC' WHERE id=${f.item}::uuid RETURNING id`,
          );
          await recordAuditEventInTransaction(
            tx,
            createTrustedAuditContext({ source: "USER", actorId: f.owner }),
            mutation,
          );
          appended = true;
          throw Error("Owned rollback fixture");
        }),
      ).rejects.toThrow();
      expect(appended).toBe(true);
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item } })).visibility,
      ).toBe("PRIVATE");
      expect(
        (
          await f.service.listAuditEventsForResource(f.who, {
            resourceType: "ITEM",
            resourceId: f.item,
          })
        ).events,
      ).toEqual([]);
    });
    it("pages actual committed events with exact bigint cursors and bounded resource-local results", async () => {
      const f = await fixture();
      for (let i = 0; i < 55; i++) await f.service.recordAuditEvent(f.who, change(f.item));
      const first = await f.service.listAuditEventsForResource(f.who, {
        resourceType: "ITEM",
        resourceId: f.item,
        limit: 50,
      });
      expect(first.events).toHaveLength(50);
      expect(first.next).toBe(first.events.at(-1)!.sequence);
      const second = await f.service.listAuditEventsForResource(f.who, {
        resourceType: "ITEM",
        resourceId: f.item,
        limit: 50,
        beforeSequence: first.next!,
      });
      expect(second.events).toHaveLength(5);
      expect(second.next).toBeNull();
      expect(new Set([...first.events, ...second.events].map((e) => e.id)).size).toBe(55);
      await expect(
        f.service.listAuditEventsForResource(f.who, {
          resourceType: "ITEM",
          resourceId: f.item,
          beforeSequence: "9223372036854775808",
        }),
      ).rejects.toMatchObject({ code: "AUDIT_INVALID" });
    });
    it("anchors collection events to the current collection and never accepts an incomplete SQL scope", async () => {
      const f = await fixture(),
        input = {
          ...change(f.item),
          resourceType: "COLLECTION",
          resourceId: f.collection,
          action: "COLLECTION_VISIBILITY_CHANGED",
        };
      const event = await f.service.recordAuditEvent(f.who, input);
      expect(
        (
          await f.service.listAuditEventsForResource(f.who, {
            resourceType: "COLLECTION",
            resourceId: f.collection,
          })
        ).events,
      ).toEqual([event]);
      await expect(
        db.$executeRaw`INSERT INTO "AuditEvent" (id,"resourceType","resourceId",action,source,"actorId",before,after) VALUES (${randomUUID()}::uuid,'ITEM',${f.item}::uuid,'ITEM_VISIBILITY_CHANGED','USER',${f.owner},'{"visibility":"PRIVATE"}'::jsonb,'{"visibility":"PUBLIC"}'::jsonb)`,
      ).rejects.toThrow();
      await db.collection.delete({ where: { id: f.collection } });
      expect(await db.$queryRaw`SELECT id FROM "AuditEvent" WHERE id=${event.id}::uuid`).toEqual(
        [],
      );
    });
    it("retains a deleted personal location's history but removes it with the actual namespace account", async () => {
      const f = await fixture(),
        location = await db.storageLocation.create({
          data: {
            ownerId: f.owner,
            name: "Old cabinet",
            type: "CABINET",
            qrToken: randomBytes(32).toString("base64url"),
          },
        });
      await db.storageLocation.update({
        where: { id: location.id },
        data: { name: "Selected cabinet" },
      });
      const event = await f.service.recordAuditEvent(f.who, {
        resourceType: "LOCATION",
        resourceId: location.id,
        action: "LOCATION_DETAILS_CHANGED",
        source: "USER",
        before: { name: "Old cabinet", type: "CABINET", parentId: null },
        after: { name: "Selected cabinet", type: "CABINET", parentId: null },
      });
      await db.storageLocation.delete({ where: { id: location.id } });
      expect(
        (
          await f.service.listAuditEventsForResource(f.who, {
            resourceType: "LOCATION",
            resourceId: location.id,
          })
        ).events,
      ).toEqual([event]);
      await expect(
        f.service.listAuditEventsForResource(
          { userId: f.other },
          { resourceType: "LOCATION", resourceId: location.id },
        ),
      ).rejects.toMatchObject({ code: "AUDIT_NOT_FOUND" });
      await db.user.delete({ where: { id: f.owner } });
      expect(await db.$queryRaw`SELECT id FROM "AuditEvent" WHERE id=${event.id}::uuid`).toEqual(
        [],
      );
    });

    it("binds an internal USER emission to current database edit membership and keeps the true editor actor", async () => {
      const f = await fixture(),
        members = createMembershipService(db),
        { source: _, ...mutation } = change(f.item);
      await members.addMember(f.who, {
        collectionId: f.collection,
        userId: f.other,
        role: "VIEWER",
        expectedRevision: 0,
      });
      await expect(
        runTransferTransaction(db, (tx) =>
          recordAuditEventInTransaction(
            tx,
            createTrustedAuditContext({ source: "USER", actorId: f.other }),
            mutation,
          ),
        ),
      ).rejects.toMatchObject({ code: "AUDIT_NOT_FOUND" });
      const editable = await fixture();
      await members.addMember(editable.who, {
        collectionId: editable.collection,
        userId: editable.other,
        role: "EDITOR",
        expectedRevision: 0,
      });
      const { source: __, ...changeByEditor } = change(editable.item),
        event = await runTransferTransaction(db, (tx) =>
          recordAuditEventInTransaction(
            tx,
            createTrustedAuditContext({ source: "USER", actorId: editable.other }),
            changeByEditor,
          ),
        );
      expect(event.actorId).toBe(editable.other);
      expect(event.actorId).not.toBe(editable.owner);
    });
    it("hides a foreign resource even while its actual owner holds a write lock", async () => {
      const f = await fixture();
      let entered!: () => void, release!: () => void;
      const ready = new Promise<void>((resolve) => {
          entered = resolve;
        }),
        finish = new Promise<void>((resolve) => {
          release = resolve;
        });
      const held = db.$transaction(
        async (tx) => {
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM "Collection" WHERE id=${f.collection}::uuid FOR UPDATE`,
          );
          entered();
          await finish;
        },
        { maxWait: 2000, timeout: 10000 },
      );
      try {
        await ready;
        await expect(
          f.service.listAuditEventsForResource(
            { userId: f.other },
            { resourceType: "ITEM", resourceId: f.item },
          ),
        ).rejects.toMatchObject({ code: "AUDIT_NOT_FOUND" });
      } finally {
        release();
        await held;
      }
    });
  },
);
