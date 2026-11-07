import { createLocationService } from "../locations/location-service";
import {
  createConditionService,
  createConditionMaintenanceService,
} from "../condition/condition-service";
import { createGradingService } from "../grading/grading-service";
import type { MembershipDatabase } from "../collaboration/transfer-transaction";
import type { Prisma } from "@sammlerraum/db/search-sql";
import { createInvitationService } from "../collaboration/invitation-service";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createItemService } from "../items/item-service";
import { createCollectionService } from "../collections/collection-service";
import { createAuditService } from "./audit-service";
import { createRestoreService } from "./restore-service";
import { createShareService } from "../sharing/share-service";
import { createMembershipService } from "../collaboration/membership-service";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
async function fixture() {
  const owner = randomUUID();
  await db.user.create({
    data: {
      id: owner,
      email: `${owner}@example.invalid`,
      name: "Owned restore fixture",
      emailVerified: true,
    },
  });
  const collection = await db.collection.create({
      data: { ownerId: owner, name: "Restore collection" },
    }),
    items = createItemService(db, owner),
    item = await items.createItem({
      collectionId: collection.id,
      title: "Restore item",
      quantity: 2,
    });
  return {
    owner,
    who: { userId: owner },
    collection: collection.id,
    item: item.id,
    items,
    audit: createAuditService(db),
    restore: createRestoreService(db),
  };
}
async function visibilityEvent(f: Awaited<ReturnType<typeof fixture>>) {
  await f.items.updateItem(f.item, { visibility: "PUBLIC" });
  const events = (
    await f.audit.listAuditEventsForResource(f.who, { resourceType: "ITEM", resourceId: f.item })
  ).events;
  return events.find((e) => e.action === "ITEM_VISIBILITY_CHANGED")!;
}
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "owned conflict-aware restoration on real PostgreSQL",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    it("refuses restoration when a newer conflicting visibility change exists", async () => {
      const f = await fixture(),
        event = await visibilityEvent(f);
      await f.items.updateItem(f.item, { visibility: "UNLISTED" });
      const preview = await f.restore.getRestorePreview(f.who, { eventId: event.id });
      await expect(
        f.restore.restoreAuditEvent(f.who, {
          eventId: event.id,
          field: "visibility",
          ...preview.preconditions,
        }),
      ).rejects.toMatchObject({ code: "RESTORE_CONFLICT" });
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item } })).visibility,
      ).toBe("UNLISTED");
    });
    it("also refuses a changed-away-and-back field although its current value matches the original event", async () => {
      const f = await fixture(),
        event = await visibilityEvent(f);
      await f.items.updateItem(f.item, { visibility: "PRIVATE" });
      await f.items.updateItem(f.item, { visibility: "PUBLIC" });
      const preview = await f.restore.getRestorePreview(f.who, { eventId: event.id });
      await expect(
        f.restore.restoreAuditEvent(f.who, {
          eventId: event.id,
          field: "visibility",
          ...preview.preconditions,
        }),
      ).rejects.toMatchObject({ code: "RESTORE_CONFLICT" });
    });
    it("restores only the selected field and appends a new original-actor event without deleting history", async () => {
      const f = await fixture(),
        event = await visibilityEvent(f);
      await f.items.updateItem(f.item, { title: "Retain newer title" });
      const preview = await f.restore.getRestorePreview(f.who, { eventId: event.id }),
        result = await f.restore.restoreAuditEvent(f.who, {
          eventId: event.id,
          field: "visibility",
          ...preview.preconditions,
        });
      expect(result.restored).toBe(true);
      expect(await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item } })).toMatchObject({
        visibility: "PRIVATE",
        title: "Retain newer title",
      });
      const events = (
        await f.audit.listAuditEventsForResource(f.who, {
          resourceType: "ITEM",
          resourceId: f.item,
        })
      ).events;
      expect(events).toContainEqual(event);
      expect(events).toContainEqual(
        expect.objectContaining({
          action: "ITEM_VISIBILITY_RESTORED",
          actorId: f.owner,
          source: "USER",
          before: { visibility: "PUBLIC", restoredEventId: event.id },
          after: { visibility: "PRIVATE", restoredEventId: event.id },
        }),
      );
    });
    it("rejects a stale confirmation even if only an unrelated field changed after preview", async () => {
      const f = await fixture(),
        event = await visibilityEvent(f),
        preview = await f.restore.getRestorePreview(f.who, { eventId: event.id });
      await f.items.updateItem(f.item, { title: "Changed since confirmation" });
      await expect(
        f.restore.restoreAuditEvent(f.who, {
          eventId: event.id,
          field: "visibility",
          ...preview.preconditions,
        }),
      ).rejects.toMatchObject({ code: "RESTORE_CONFLICT" });
    });
    it("restores an actual trashed item but permanently keeps its previous direct share revoked", async () => {
      const f = await fixture(),
        shares = createShareService(db),
        share = await shares.createShare(f.who, {
          target: { kind: "ITEM", id: f.item },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
        });
      const deletion = await f.restore.softDeleteItem(f.who, { itemId: f.item });
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item } })).deletedAt,
      ).not.toBeNull();
      const preview = await f.restore.getRestorePreview(f.who, { eventId: deletion.eventId });
      await f.restore.restoreItem(f.who, { itemId: f.item, ...preview.preconditions });
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item } })).deletedAt,
      ).toBeNull();
      await expect(shares.resolveShare(null, { token: share.token })).rejects.toMatchObject({
        code: "SHARE_REVOKED",
      });
    });
    it("restores a soft-deleted collection without reviving its old grants", async () => {
      const f = await fixture(),
        shares = createShareService(db),
        share = await shares.createShare(f.who, {
          target: { kind: "COLLECTION", id: f.collection },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
        });
      await createCollectionService(db, f.owner).deleteCollection(f.collection);
      const event = (
          await f.audit.listAuditEventsForResource(f.who, {
            resourceType: "COLLECTION",
            resourceId: f.collection,
          })
        ).events.find((e) => e.action === "COLLECTION_DELETED")!,
        preview = await f.restore.getRestorePreview(f.who, { eventId: event.id });
      await f.restore.restoreAuditEvent(f.who, {
        eventId: event.id,
        field: "deletedAt",
        ...preview.preconditions,
      });
      expect(
        (await db.collection.findUniqueOrThrow({ where: { id: f.collection } })).deletedAt,
      ).toBeNull();
      await expect(shares.resolveShare(null, { token: share.token })).rejects.toMatchObject({
        code: "SHARE_REVOKED",
      });
    });
    it("uses the actual current owner after transfer and denies the old owner even though they remain Admin", async () => {
      const f = await fixture(),
        event = await visibilityEvent(f),
        next = randomUUID();
      await db.user.create({
        data: {
          id: next,
          email: `${next}@example.invalid`,
          name: "New actual restore owner",
          emailVerified: true,
        },
      });
      const members = createMembershipService(db);
      await members.addMember(f.who, {
        collectionId: f.collection,
        userId: next,
        role: "EDITOR",
        expectedRevision: 0,
      });
      await members.transferOwnership(f.who, {
        collectionId: f.collection,
        newOwnerId: next,
        expectedRevision: 1,
        confirmPrivateTransfer: true,
      });
      await expect(f.restore.getRestorePreview(f.who, { eventId: event.id })).rejects.toMatchObject(
        { code: "RESTORE_NOT_FOUND" },
      );
      const who = { userId: next },
        preview = await f.restore.getRestorePreview(who, { eventId: event.id });
      await f.restore.restoreAuditEvent(who, {
        eventId: event.id,
        field: "visibility",
        ...preview.preconditions,
      });
      expect(
        (
          await createAuditService(db).listAuditEventsForResource(who, {
            resourceType: "ITEM",
            resourceId: f.item,
          })
        ).events,
      ).toContainEqual(
        expect.objectContaining({ action: "ITEM_VISIBILITY_RESTORED", actorId: next }),
      );
    });
    it("cannot restore financial provenance, roles or private text from a content digest", async () => {
      const f = await fixture();
      await f.items.updateItem(f.item, { privateNotes: "Private note changed" });
      const event = (
          await f.audit.listAuditEventsForResource(f.who, {
            resourceType: "ITEM",
            resourceId: f.item,
          })
        ).events.find((e) => e.action === "ITEM_DETAILS_CHANGED")!,
        preview = await f.restore.getRestorePreview(f.who, { eventId: event.id });
      await expect(
        f.restore.restoreAuditEvent(f.who, {
          eventId: event.id,
          field: "privateNotes",
          ...preview.preconditions,
        }),
      ).rejects.toMatchObject({ code: "RESTORE_INVALID" });
      await expect(
        f.restore.restoreAuditEvent(f.who, {
          eventId: event.id,
          field: "purchaseAmountMinor",
          ...preview.preconditions,
        }),
      ).rejects.toMatchObject({ code: "RESTORE_INVALID" });
    });
    it("rolls the restored field back when insertion of its real restore audit fails", async () => {
      const f = await fixture(),
        event = await visibilityEvent(f),
        preview = await f.restore.getRestorePreview(f.who, { eventId: event.id });
      await db.$executeRawUnsafe(
        `CREATE FUNCTION owned_restore_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='ITEM_VISIBILITY_RESTORED' THEN RAISE EXCEPTION 'Owned restore audit failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$`,
      );
      await db.$executeRawUnsafe(
        `CREATE TRIGGER owned_restore_audit_failure BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION owned_restore_audit_failure()`,
      );
      try {
        await expect(
          f.restore.restoreAuditEvent(f.who, {
            eventId: event.id,
            field: "visibility",
            ...preview.preconditions,
          }),
        ).rejects.toThrow();
        expect(
          (await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item } })).visibility,
        ).toBe("PUBLIC");
      } finally {
        await db.$executeRawUnsafe(`DROP TRIGGER owned_restore_audit_failure ON "AuditEvent"`);
        await db.$executeRawUnsafe(`DROP FUNCTION owned_restore_audit_failure()`);
      }
    });
    it("does not deadlock a held guest share read and rejects a trash/restore round trip before returning its data", async () => {
      const f = await fixture(),
        share = await createShareService(db).createShare(f.who, {
          target: { kind: "ITEM", id: f.item },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
        });
      let reached!: () => void,
        release!: () => void,
        loads = 0;
      const ready = new Promise<void>((r) => {
          reached = r;
        }),
        held = new Promise<void>((r) => {
          release = r;
        });
      const hooked: MembershipDatabase = {
        $transaction: (work, options) =>
          db.$transaction(
            (tx) =>
              work({
                $queryRaw: async <T>(query: Prisma.Sql) => {
                  const value = await tx.$queryRaw<T>(query);
                  if (
                    query.sql.includes('LEFT JOIN "ShareRevocation"') &&
                    query.sql.includes("FOR SHARE OF s") &&
                    ++loads === 2
                  ) {
                    reached();
                    await held;
                  }
                  return value;
                },
              }),
            options,
          ),
      };
      const reading = createShareService(hooked)
        .resolveShare(null, { token: share.token })
        .then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
      try {
        await ready;
        const deleted = await f.restore.softDeleteItem(f.who, { itemId: f.item }),
          preview = await f.restore.getRestorePreview(f.who, { eventId: deleted.eventId });
        await f.restore.restoreItem(f.who, { itemId: f.item, ...preview.preconditions });
        release();
        expect(await reading).toMatchObject({ error: { code: "SHARE_REVOKED" } });
      } finally {
        release();
        await reading;
      }
    });
    it("permanently retires pending invitations when a collection enters trash", async () => {
      const f = await fixture(),
        recipient = randomUUID();
      await db.user.create({
        data: {
          id: recipient,
          name: "Pending restore invite",
          email: `${recipient}@example.invalid`,
          emailVerified: true,
        },
      });
      const invites = createInvitationService(db),
        created = await invites.createInvitation(f.who, {
          collectionId: f.collection,
          expectedRevision: 0,
          target: { kind: "USER", userId: recipient },
          role: "VIEWER",
        });
      await createCollectionService(db, f.owner).deleteCollection(f.collection);
      const event = (
          await f.audit.listAuditEventsForResource(f.who, {
            resourceType: "COLLECTION",
            resourceId: f.collection,
          })
        ).events.find((e) => e.action === "COLLECTION_DELETED")!,
        preview = await f.restore.getRestorePreview(f.who, { eventId: event.id });
      await f.restore.restoreAuditEvent(f.who, {
        eventId: event.id,
        field: "deletedAt",
        ...preview.preconditions,
      });
      await expect(
        invites.acceptInvitation({ userId: recipient }, { token: created.token }),
      ).rejects.toMatchObject({ code: "INVITATION_REVOKED" });
      expect(await db.collectionMember.count({ where: { collectionId: f.collection } })).toBe(0);
    });
    it("keeps trash revocation markers immutable but permits actual parent erasure", async () => {
      const f = await fixture(),
        share = await createShareService(db).createShare(f.who, {
          target: { kind: "ITEM", id: f.item },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
        });
      await f.restore.softDeleteItem(f.who, { itemId: f.item });
      expect(
        await db.shareRevocation.findUnique({ where: { shareId: share.share.id } }),
      ).not.toBeNull();
      await expect(
        db.$executeRaw`DELETE FROM "ShareRevocation" WHERE "shareId"=${share.share.id}::uuid`,
      ).rejects.toThrow();
      await expect(
        db.$executeRaw`UPDATE "ShareRevocation" SET reason='COLLECTION_TRASHED' WHERE "shareId"=${share.share.id}::uuid`,
      ).rejects.toThrow();
      await db.collection.delete({ where: { id: f.collection } });
      expect(await db.shareRevocation.count({ where: { shareId: share.share.id } })).toBe(0);
    });

    it("restores an owned storage location and appends the true physical movement history", async () => {
      const f = await fixture(),
        locations = createLocationService(db, f.owner),
        a = await locations.createLocation({ name: "Original shelf", type: "SHELF" }),
        b = await locations.createLocation({ name: "Later box", type: "BOX" });
      await locations.assignItemLocation(f.item, a.id);
      await locations.assignItemLocation(f.item, b.id);
      const event = (
          await f.audit.listAuditEventsForResource(f.who, {
            resourceType: "ITEM",
            resourceId: f.item,
          })
        ).events.find((e) => e.action === "ITEM_LOCATION_CHANGED")!,
        preview = await f.restore.getRestorePreview(f.who, { eventId: event.id });
      await f.restore.restoreAuditEvent(f.who, {
        eventId: event.id,
        field: "storageLocationId",
        ...preview.preconditions,
      });
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item } })).storageLocationId,
      ).toBe(a.id);
      const history = await db.itemLocationHistory.findMany({ where: { itemId: f.item } });
      expect(history).toHaveLength(3);
      expect(history).toContainEqual(
        expect.objectContaining({
          fromLocationId: b.id,
          toLocationId: a.id,
          assignedById: f.owner,
        }),
      );
    });
    it("refuses an old owner's location namespace after an actual ownership transfer", async () => {
      const f = await fixture(),
        locations = createLocationService(db, f.owner),
        a = await locations.createLocation({ name: "Previous owner shelf", type: "SHELF" });
      await locations.assignItemLocation(f.item, a.id);
      await locations.assignItemLocation(f.item, null);
      const event = (
          await f.audit.listAuditEventsForResource(f.who, {
            resourceType: "ITEM",
            resourceId: f.item,
          })
        ).events.find((e) => e.action === "ITEM_LOCATION_CHANGED")!,
        next = randomUUID();
      await db.user.create({
        data: {
          id: next,
          email: `${next}@example.invalid`,
          name: "Location recipient",
          emailVerified: true,
        },
      });
      const members = createMembershipService(db);
      await members.addMember(f.who, {
        collectionId: f.collection,
        userId: next,
        role: "EDITOR",
        expectedRevision: 0,
      });
      await members.transferOwnership(f.who, {
        collectionId: f.collection,
        newOwnerId: next,
        expectedRevision: 1,
        confirmPrivateTransfer: true,
      });
      const who = { userId: next },
        preview = await f.restore.getRestorePreview(who, { eventId: event.id });
      await expect(
        f.restore.restoreAuditEvent(who, {
          eventId: event.id,
          field: "storageLocationId",
          ...preview.preconditions,
        }),
      ).rejects.toMatchObject({ code: "RESTORE_CONFLICT" });
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item } })).storageLocationId,
      ).toBeNull();
    });
    it("refuses quantity restoration when a new single-item grading now binds the quantity", async () => {
      const f = await fixture();
      await f.items.updateItem(f.item, { quantity: 1 });
      const event = (
        await f.audit.listAuditEventsForResource(f.who, {
          resourceType: "ITEM",
          resourceId: f.item,
        })
      ).events.find((e) => e.action === "ITEM_DETAILS_CHANGED")!;
      await createGradingService(db, f.owner).addGrading(f.item, {
        provider: "Restore grading",
        grade: "A",
      });
      const preview = await f.restore.getRestorePreview(f.who, { eventId: event.id });
      await expect(
        f.restore.restoreAuditEvent(f.who, {
          eventId: event.id,
          field: "quantity",
          ...preview.preconditions,
        }),
      ).rejects.toMatchObject({ code: "RESTORE_CONFLICT" });
      expect((await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item } })).quantity).toBe(
        1,
      );
    });
    it("unarchives without silently reactivating a prior sales offer", async () => {
      const f = await fixture();
      await f.items.updateItem(f.item, { tradeStatus: "FOR_SALE" });
      await f.items.archiveItem(f.item);
      const event = (
          await f.audit.listAuditEventsForResource(f.who, {
            resourceType: "ITEM",
            resourceId: f.item,
          })
        ).events.find((e) => e.action === "ITEM_ARCHIVED")!,
        preview = await f.restore.getRestorePreview(f.who, { eventId: event.id });
      await f.restore.restoreAuditEvent(f.who, {
        eventId: event.id,
        field: "archivedAt",
        ...preview.preconditions,
      });
      expect(await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item } })).toMatchObject({
        archivedAt: null,
        tradeStatus: "NOT_FOR_TRADE",
      });
    });

    it("restores a condition only while its original category option remains active", async () => {
      const f = await fixture(),
        category = await db.categoryTemplate.create({
          data: { key: `restore_${randomUUID().replaceAll("-", "")}` },
        }),
        maintenance = createConditionMaintenanceService(db),
        scheme = await maintenance.createConditionScheme({
          categoryTemplateId: category.id,
          key: `restore_${randomUUID().replaceAll("-", "")}`,
          labels: { de: "Zustand", en: "Condition" },
          options: [
            {
              labelKey: "restore.original",
              labels: { de: "Original", en: "Original" },
              normalizedBand: 3,
            },
            {
              labelKey: "restore.changed",
              labels: { de: "Geändert", en: "Changed" },
              normalizedBand: 4,
            },
          ],
        }),
        conditions = createConditionService(db, f.owner);
      await conditions.setItemCategory(f.item, { categoryTemplateId: category.id });
      await conditions.setItemCondition(f.item, scheme.options[0]!.id);
      await conditions.setItemCondition(f.item, scheme.options[1]!.id);
      const event = (
          await f.audit.listAuditEventsForResource(f.who, {
            resourceType: "ITEM",
            resourceId: f.item,
          })
        ).events.find((e) => e.action === "ITEM_CONDITION_CHANGED")!,
        preview = await f.restore.getRestorePreview(f.who, { eventId: event.id });
      await maintenance.setConditionOptionActive(scheme.options[0]!.id, false);
      await expect(
        f.restore.restoreAuditEvent(f.who, {
          eventId: event.id,
          field: "conditionOptionId",
          ...preview.preconditions,
        }),
      ).rejects.toMatchObject({ code: "RESTORE_CONFLICT" });
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item } })).conditionOptionId,
      ).toBe(scheme.options[1]!.id);
      await maintenance.setConditionOptionActive(scheme.options[0]!.id, true);
      await f.restore.restoreAuditEvent(f.who, {
        eventId: event.id,
        field: "conditionOptionId",
        ...preview.preconditions,
      });
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item } })).conditionOptionId,
      ).toBe(scheme.options[0]!.id);
    });
  },
);
