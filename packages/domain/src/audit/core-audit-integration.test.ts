import { createMembershipService } from "../collaboration/membership-service";
import { createPersonalMoneyService } from "../money/personal-money-service";
import sharp from "sharp";
import { createMediaService } from "../media/media-service";
import { createMediaCleanupService } from "../media/cleanup-service";
import { createCustomFieldService } from "../custom-fields/custom-field-service";
import { createTagService } from "../items/tag-service";
import { createCollectionService } from "../collections/collection-service";
import { createGradingService } from "../grading/grading-service";
import { createValuationService } from "../valuations/valuation-service";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createItemService } from "../items/item-service";
import {
  createConditionService,
  createConditionMaintenanceService,
} from "../condition/condition-service";
import { createLocationService } from "../locations/location-service";
import { createAuditService } from "./audit-service";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
async function fixture(quantity = 2) {
  const owner = randomUUID();
  await db.user.create({
    data: {
      id: owner,
      email: `${owner}@example.invalid`,
      name: "Owned actual mutation audit",
      emailVerified: true,
    },
  });
  const collection = await db.collection.create({
      data: { ownerId: owner, name: "Real audited mutations" },
    }),
    category = await db.categoryTemplate.create({
      data: { key: `audit_${randomUUID().replaceAll("-", "")}` },
    });
  const scheme = await createConditionMaintenanceService(db).createConditionScheme({
    categoryTemplateId: category.id,
    key: `audit_${randomUUID().replaceAll("-", "")}`,
    labels: { de: "Zustand", en: "Condition" },
    options: [
      { labelKey: "audit.mint", labels: { de: "Sehr gut", en: "Very good" }, normalizedBand: 4 },
    ],
  });
  const item = await createItemService(db, owner).createItem({
    collectionId: collection.id,
    title: "Actually changed item",
    quantity,
  });
  await createConditionService(db, owner).setItemCategory(item.id, {
    categoryTemplateId: category.id,
  });
  return {
    owner,
    collection: collection.id,
    item: item.id,
    option: scheme.options[0]!.id,
    condition: createConditionService(db, owner),
    locations: createLocationService(db, owner),
    audit: createAuditService(db),
    who: { userId: owner },
  };
}
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual core mutations append their real audit in the same transaction",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    it("records actual condition and location changes with the real user and before/after values", async () => {
      const f = await fixture(),
        location = await f.locations.createLocation({ name: "Audit cabinet", type: "CABINET" });
      await f.condition.setItemCondition(f.item, f.option);
      await f.locations.assignItemLocation(f.item, location.id);
      const events = (
        await f.audit.listAuditEventsForResource(f.who, {
          resourceType: "ITEM",
          resourceId: f.item,
        })
      ).events;
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "ITEM_CONDITION_CHANGED",
            source: "USER",
            actorId: f.owner,
            before: expect.objectContaining({ conditionOptionId: null }),
            after: expect.objectContaining({ conditionOptionId: f.option }),
          }),
          expect.objectContaining({
            action: "ITEM_LOCATION_CHANGED",
            source: "USER",
            actorId: f.owner,
            before: expect.objectContaining({ storageLocationId: null }),
            after: expect.objectContaining({ storageLocationId: location.id }),
          }),
        ]),
      );
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item } })).storageLocationId,
      ).toBe(location.id);
    });
    it("a genuine default audit INSERT failure rolls the actual condition write back", async () => {
      const f = await fixture(),
        before = (
          await f.audit.listAuditEventsForResource(f.who, {
            resourceType: "ITEM",
            resourceId: f.item,
          })
        ).events;
      await db.$executeRawUnsafe(
        `CREATE FUNCTION owned_condition_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='ITEM_CONDITION_CHANGED' THEN RAISE EXCEPTION 'Owned audit failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$`,
      );
      await db.$executeRawUnsafe(
        `CREATE TRIGGER owned_condition_audit_failure BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION owned_condition_audit_failure()`,
      );
      try {
        await expect(f.condition.setItemCondition(f.item, f.option)).rejects.toThrow();
        expect(
          (await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item } })).conditionOptionId,
        ).toBeNull();
        expect(
          (
            await f.audit.listAuditEventsForResource(f.who, {
              resourceType: "ITEM",
              resourceId: f.item,
            })
          ).events,
        ).toEqual(before);
      } finally {
        await db.$executeRawUnsafe(`DROP TRIGGER owned_condition_audit_failure ON "AuditEvent"`);
        await db.$executeRawUnsafe(`DROP FUNCTION owned_condition_audit_failure()`);
      }
      await f.condition.setItemCondition(f.item, f.option);
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item } })).conditionOptionId,
      ).toBe(f.option);
      expect(
        (
          await f.audit.listAuditEventsForResource(f.who, {
            resourceType: "ITEM",
            resourceId: f.item,
          })
        ).events,
      ).toContainEqual(expect.objectContaining({ action: "ITEM_CONDITION_CHANGED" }));
    });
    it("records category changes and condition clearing without inventing a second unchanged event", async () => {
      const f = await fixture();
      await f.condition.setItemCondition(f.item, f.option);
      await f.condition.setItemCategory(f.item, { categoryTemplateId: null, clearCondition: true });
      const events = (
        await f.audit.listAuditEventsForResource(f.who, {
          resourceType: "ITEM",
          resourceId: f.item,
        })
      ).events;
      expect(events).toContainEqual(
        expect.objectContaining({
          action: "ITEM_CATEGORY_CHANGED",
          actorId: f.owner,
          before: expect.objectContaining({ conditionOptionId: f.option }),
          after: { categoryTemplateId: null, conditionOptionId: null },
        }),
      );
      const prior = events.length;
      await f.condition.setItemCategory(f.item, { categoryTemplateId: null });
      expect(
        (
          await f.audit.listAuditEventsForResource(f.who, {
            resourceType: "ITEM",
            resourceId: f.item,
          })
        ).events,
      ).toHaveLength(prior);
    });
    it("audits grading create/update/delete with selected authored facts and excludes verification URLs/source text", async () => {
      const f = await fixture(1),
        grading = createGradingService(db, f.owner),
        certificate = `audit-${randomUUID()}`;
      const created = await grading.addGrading(f.item, {
        provider: "Audit Lab",
        grade: "A",
        certificateNo: certificate,
        verificationUrl: "https://example.invalid/proof?token=never-copy-grading-url",
        source: "never-copy-grading-source",
      });
      await grading.updateGrading(f.item, created.id, {
        provider: "Audit Lab",
        grade: "B",
        certificateNo: certificate,
      });
      await grading.removeGrading(f.item, created.id);
      const events = (
        await f.audit.listAuditEventsForResource(f.who, {
          resourceType: "ITEM",
          resourceId: f.item,
        })
      ).events;
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "ITEM_GRADING_CREATED",
            before: null,
            after: expect.objectContaining({
              id: created.id,
              grade: "A",
              certificateNo: certificate,
            }),
          }),
          expect.objectContaining({
            action: "ITEM_GRADING_UPDATED",
            before: expect.objectContaining({ grade: "A" }),
            after: expect.objectContaining({ grade: "B" }),
          }),
          expect.objectContaining({
            action: "ITEM_GRADING_REMOVED",
            before: expect.objectContaining({ grade: "B" }),
            after: null,
          }),
        ]),
      );
      expect(JSON.stringify(events)).not.toMatch(
        /never-copy-grading-url|never-copy-grading-source/,
      );
      expect(events.every((e) => e.actorId === f.owner)).toBe(true);
    });
    it("keeps a manual valuation's exact bigint, stored scale, basis and true author in audit", async () => {
      const f = await fixture(),
        value = await createValuationService(db, f.owner).addManualValuation(f.item, {
          amountMinor: 9007199254740993n,
          currency: "JPY",
          note: "never-copy-valuation-note",
        });
      const events = (
        await f.audit.listAuditEventsForResource(f.who, {
          resourceType: "ITEM",
          resourceId: f.item,
        })
      ).events;
      expect(events).toContainEqual(
        expect.objectContaining({
          action: "ITEM_VALUATION_ADDED",
          actorId: f.owner,
          source: "USER",
          before: null,
          after: expect.objectContaining({
            id: value.id,
            amountMinor: "9007199254740993",
            currency: "JPY",
            minorUnitExponent: 0,
            basis: "PER_UNIT",
          }),
        }),
      );
      expect(JSON.stringify(events)).not.toContain("never-copy-valuation-note");
    });

    it("records private location creation and hierarchy moves without duplicating QR access tokens", async () => {
      const f = await fixture(),
        parent = await f.locations.createLocation({ name: "Audit room", type: "ROOM" }),
        child = await f.locations.createLocation({ name: "Audit shelf", type: "SHELF" });
      await f.locations.moveLocation(child.id, parent.id);
      const events = (
        await f.audit.listAuditEventsForResource(f.who, {
          resourceType: "LOCATION",
          resourceId: child.id,
        })
      ).events;
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "LOCATION_CREATED",
            before: null,
            after: { name: "Audit shelf", type: "SHELF", parentId: null },
          }),
          expect.objectContaining({
            action: "LOCATION_DETAILS_CHANGED",
            before: { name: "Audit shelf", type: "SHELF", parentId: null },
            after: { name: "Audit shelf", type: "SHELF", parentId: parent.id },
          }),
        ]),
      );
      expect(JSON.stringify(events)).not.toContain(child.qrToken);
      const count = events.length;
      await f.locations.moveLocation(child.id, parent.id);
      expect(
        (
          await f.audit.listAuditEventsForResource(f.who, {
            resourceType: "LOCATION",
            resourceId: child.id,
          })
        ).events,
      ).toHaveLength(count);
    });
    it("rolls back grading, valuations and location history together when their audit append fails", async () => {
      const f = await fixture(1),
        location = await f.locations.createLocation({ name: "Rollback shelf", type: "SHELF" }),
        grading = createGradingService(db, f.owner),
        valuations = createValuationService(db, f.owner);
      await db.$executeRawUnsafe(
        `CREATE FUNCTION owned_core_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action IN ('ITEM_GRADING_CREATED','ITEM_VALUATION_ADDED','ITEM_LOCATION_CHANGED') THEN RAISE EXCEPTION 'Owned core audit failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$`,
      );
      await db.$executeRawUnsafe(
        `CREATE TRIGGER owned_core_audit_failure BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION owned_core_audit_failure()`,
      );
      try {
        await expect(
          grading.addGrading(f.item, { provider: "Audit rollback", grade: "A" }),
        ).rejects.toThrow();
        expect(await db.grading.count({ where: { itemId: f.item } })).toBe(0);
        await expect(
          valuations.addManualValuation(f.item, { amountMinor: 12n, currency: "EUR" }),
        ).rejects.toThrow();
        expect(await db.valuation.count({ where: { itemId: f.item } })).toBe(0);
        await expect(f.locations.assignItemLocation(f.item, location.id)).rejects.toThrow();
        expect(
          (await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item } })).storageLocationId,
        ).toBeNull();
        expect(await db.itemLocationHistory.count({ where: { itemId: f.item } })).toBe(0);
      } finally {
        await db.$executeRawUnsafe(`DROP TRIGGER owned_core_audit_failure ON "AuditEvent"`);
        await db.$executeRawUnsafe(`DROP FUNCTION owned_core_audit_failure()`);
      }
    });

    it("tracks collection and node creation, rename, visibility, move and soft deletion", async () => {
      const f = await fixture(),
        collections = createCollectionService(db, f.owner),
        collection = await collections.createCollection({ name: "Audited created collection" });
      await collections.updateCollection(collection.id, {
        name: "Renamed collection",
        visibility: "PUBLIC",
      });
      const parent = await collections.createCollectionNode({
          collectionId: collection.id,
          name: "Parent",
        }),
        node = await collections.createCollectionNode({
          collectionId: collection.id,
          name: "Child",
        });
      await collections.updateCollectionNode(node.id, {
        name: "Renamed child",
        visibility: "UNLISTED",
      });
      await collections.moveCollectionNode(node.id, { parentId: parent.id });
      const nodes = (
        await f.audit.listAuditEventsForResource(f.who, {
          resourceType: "NODE",
          resourceId: node.id,
        })
      ).events;
      expect(nodes.map((e) => e.action)).toEqual(
        expect.arrayContaining(["NODE_CREATED", "NODE_DETAILS_CHANGED", "NODE_MOVED"]),
      );
      expect(nodes).toContainEqual(
        expect.objectContaining({
          action: "NODE_MOVED",
          before: expect.objectContaining({ parentId: null }),
          after: expect.objectContaining({ parentId: parent.id }),
        }),
      );
      await collections.deleteCollection(collection.id);
      const events = (
        await f.audit.listAuditEventsForResource(f.who, {
          resourceType: "COLLECTION",
          resourceId: collection.id,
        })
      ).events;
      expect(events.map((e) => e.action)).toEqual(
        expect.arrayContaining([
          "COLLECTION_CREATED",
          "COLLECTION_DETAILS_CHANGED",
          "COLLECTION_VISIBILITY_CHANGED",
          "COLLECTION_DELETED",
        ]),
      );
      expect(events.every((e) => e.actorId === f.owner)).toBe(true);
    });

    it("audits real item create, meaningful edits, split, archive and soft delete without storing private note text", async () => {
      const f = await fixture(),
        items = createItemService(db, f.owner);
      await items.updateItem(f.item, {
        title: "Changed actual title",
        privateNotes: "never-copy-item-private-note",
        visibility: "UNLISTED",
        tradeStatus: "OPEN_TO_TRADE",
      });
      const split = await items.splitQuantityItem(f.item, 1);
      expect(split.created.quantity + split.source.quantity).toBe(2);
      await items.archiveItem(split.created.id);
      await items.deleteItem(f.item);
      const source = (
          await f.audit.listAuditEventsForResource(f.who, {
            resourceType: "ITEM",
            resourceId: f.item,
          })
        ).events,
        child = (
          await f.audit.listAuditEventsForResource(f.who, {
            resourceType: "ITEM",
            resourceId: split.created.id,
          })
        ).events;
      expect(source.map((e) => e.action)).toEqual(
        expect.arrayContaining([
          "ITEM_CREATED",
          "ITEM_DETAILS_CHANGED",
          "ITEM_VISIBILITY_CHANGED",
          "ITEM_SPLIT",
          "ITEM_DELETED",
        ]),
      );
      expect(child.map((e) => e.action)).toEqual(
        expect.arrayContaining(["ITEM_CREATED", "ITEM_ARCHIVED"]),
      );
      expect(JSON.stringify([...source, ...child])).not.toContain("never-copy-item-private-note");
      expect(source).toContainEqual(
        expect.objectContaining({
          action: "ITEM_DETAILS_CHANGED",
          before: expect.objectContaining({ title: "Actually changed item", quantity: 2 }),
          after: expect.objectContaining({ title: "Changed actual title", quantity: 2 }),
        }),
      );
    });
    it("audits attached and detached tags exactly once and rolls back actual tag replacement on audit failure", async () => {
      const f = await fixture(),
        tags = createTagService(db, f.owner),
        first = await tags.setItemTags(f.item, [" First tag ", "first tag", "Keep tag"]);
      const second = await tags.setItemTags(f.item, ["Keep tag", "New tag"]);
      const events = (
        await f.audit.listAuditEventsForResource(f.who, {
          resourceType: "ITEM",
          resourceId: f.item,
          limit: 50,
        })
      ).events;
      expect(events.filter((e) => e.action === "ITEM_TAG_ATTACHED")).toHaveLength(3);
      expect(events).toContainEqual(
        expect.objectContaining({
          action: "ITEM_TAG_DETACHED",
          before: { id: first[0]!.id, name: "First tag" },
          after: null,
        }),
      );
      await tags.setItemTags(f.item, ["New tag", "Keep tag"]);
      expect(
        (
          await f.audit.listAuditEventsForResource(f.who, {
            resourceType: "ITEM",
            resourceId: f.item,
            limit: 50,
          })
        ).events,
      ).toHaveLength(events.length);
      await db.$executeRawUnsafe(
        `CREATE FUNCTION owned_tag_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='ITEM_TAG_ATTACHED' THEN RAISE EXCEPTION 'Owned tag audit failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$`,
      );
      await db.$executeRawUnsafe(
        `CREATE TRIGGER owned_tag_audit_failure BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION owned_tag_audit_failure()`,
      );
      try {
        await expect(tags.setItemTags(f.item, ["Must roll back"])).rejects.toThrow();
        expect(
          (await db.itemTag.findMany({ where: { itemId: f.item } })).map((v) => v.tagId).sort(),
        ).toEqual(second.map((t) => t.id).sort());
      } finally {
        await db.$executeRawUnsafe(`DROP TRIGGER owned_tag_audit_failure ON "AuditEvent"`);
        await db.$executeRawUnsafe(`DROP FUNCTION owned_tag_audit_failure()`);
      }
    });

    it("records typed custom-field values and clearing with exact stored decimals and private text fingerprints", async () => {
      const f = await fixture(),
        fields = createCustomFieldService(db, f.owner),
        decimal = await fields.createFieldDefinition({
          collectionId: f.collection,
          name: "Exact decimal",
          type: "DECIMAL",
        }),
        note = await fields.createFieldDefinition({
          collectionId: f.collection,
          name: "Private field",
          type: "LONG_TEXT",
        });
      await fields.setFieldValue(f.item, decimal.id, "12.34");
      await fields.setFieldValue(f.item, note.id, "never-copy-private-custom-field");
      await fields.setFieldValue(f.item, decimal.id, null);
      const events = (
        await f.audit.listAuditEventsForResource(f.who, {
          resourceType: "ITEM",
          resourceId: f.item,
          limit: 50,
        })
      ).events;
      expect(events).toContainEqual(
        expect.objectContaining({
          action: "ITEM_CUSTOM_FIELD_CHANGED",
          before: null,
          after: expect.objectContaining({
            fieldDefinitionId: decimal.id,
            type: "DECIMAL",
            decimalValue: expect.stringMatching(/^12\.340*$/),
          }),
        }),
      );
      expect(events).toContainEqual(
        expect.objectContaining({
          action: "ITEM_CUSTOM_FIELD_CHANGED",
          before: expect.objectContaining({ fieldDefinitionId: decimal.id, type: "DECIMAL" }),
          after: null,
        }),
      );
      expect(JSON.stringify(events)).not.toContain("never-copy-private-custom-field");
      expect(events).toContainEqual(
        expect.objectContaining({
          after: expect.objectContaining({
            fieldDefinitionId: note.id,
            longTextHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          }),
        }),
      );
      const definitions = (
        await f.audit.listAuditEventsForResource(f.who, {
          resourceType: "COLLECTION",
          resourceId: f.collection,
          limit: 50,
        })
      ).events;
      expect(definitions).toContainEqual(
        expect.objectContaining({
          action: "CUSTOM_FIELD_DEFINITION_CREATED",
          after: expect.objectContaining({
            id: decimal.id,
            type: "DECIMAL",
            name: "Exact decimal",
          }),
        }),
      );
    });

    it("audits actual media/document linking, reordering, metadata and unlink without copying storage keys", async () => {
      const f = await fixture(),
        objects = new Map<string, Uint8Array>(),
        storage = {
          put: async (key: string, bytes: Uint8Array) => {
            objects.set(key, bytes);
          },
          read: async (key: string) => {
            const bytes = objects.get(key);
            if (!bytes) throw new Error("Missing owned fixture bytes");
            return bytes;
          },
          delete: async (key: string) => {
            objects.delete(key);
          },
          exists: async (key: string) => objects.has(key),
        },
        media = createMediaService(db, storage),
        cleanup = createMediaCleanupService(db, { retentionHours: 24 });
      const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } })
        .png()
        .toBuffer();
      const first = await media.createImageUpload(f.owner, png, {
          fileName: "audit-first.png",
          claimedMime: "image/png",
        }),
        second = await media.createImageUpload(f.owner, png, {
          fileName: "audit-second.png",
          claimedMime: "image/png",
        });
      const a = await media.linkAsset(f.owner, {
          target: "ITEM",
          itemId: f.item,
          assetId: first.id,
          purpose: "GALLERY",
        }),
        b = await media.linkAsset(f.owner, {
          target: "ITEM",
          itemId: f.item,
          assetId: second.id,
          purpose: "GALLERY",
        });
      await media.reorderGallery(f.owner, f.item, [b.id, a.id]);
      const document = await media.createDocumentUpload(
          f.owner,
          Buffer.from("%PDF-1.7\n1 0 obj <<>> endobj\n%%EOF"),
          { fileName: "audit-proof.pdf", claimedMime: "application/pdf" },
        ),
        linked = await media.linkAsset(f.owner, {
          target: "ITEM_DOCUMENT",
          itemId: f.item,
          assetId: document.id,
          category: "OTHER_PRIVATE",
        });
      await media.updateDocument(f.owner, f.item, linked.id, {
        category: "INSURANCE",
        visibility: "PRIVATE",
      });
      await cleanup.unlinkAsset(f.owner, "ITEM", a.id, f.item);
      await cleanup.unlinkAsset(f.owner, "ITEM_DOCUMENT", linked.id, f.item);
      const events = (
        await f.audit.listAuditEventsForResource(f.who, {
          resourceType: "ITEM",
          resourceId: f.item,
          limit: 50,
        })
      ).events;
      expect(events.map((e) => e.action)).toEqual(
        expect.arrayContaining([
          "ITEM_MEDIA_LINKED",
          "ITEM_MEDIA_REORDERED",
          "ITEM_DOCUMENT_LINKED",
          "ITEM_DOCUMENT_CHANGED",
          "ITEM_MEDIA_UNLINKED",
          "ITEM_DOCUMENT_UNLINKED",
        ]),
      );
      const actualKeys = (await db.mediaAsset.findMany({ where: { ownerId: f.owner } })).map(
        (asset) => asset.storageKey,
      );
      for (const key of actualKeys) expect(JSON.stringify(events)).not.toContain(key);
      expect(events.every((e) => e.actorId === f.owner)).toBe(true);
      expect(objects.size).toBe(3);
    });

    it("audits actual V2 item authoring and exact interpreted purchase changes without exposing fact tokens or receipts", async () => {
      const f = await fixture(),
        money = createPersonalMoneyService(db, f.owner),
        created = await money.createItemV2({
          schemaVersion: 1,
          item: { collectionId: f.collection, title: "Authored purchase" },
          purchase: {
            op: "NEW",
            authoring: {
              kind: "DECIMAL",
              profileId: "legacy-money-iso-2026-09-17-v1",
              currency: "AFN",
              decimal: "1",
            },
          },
        });
      await money.updateItemV2(created.item.id, {
        schemaVersion: 1,
        item: { title: "Renamed V2 item" },
      });
      const replaced = await money.updateItemV2(created.item.id, {
        schemaVersion: 1,
        purchase: {
          op: "REPLACE",
          expectedFactToken: created.purchase.factToken,
          authoring: {
            kind: "DECIMAL",
            profileId: "legacy-money-iso-2026-09-17-v1",
            currency: "JPY",
            decimal: "2",
          },
        },
      });
      await money.updateItemV2(created.item.id, {
        schemaVersion: 1,
        purchase: { op: "CLEAR", expectedFactToken: replaced.purchase.factToken },
      });
      const events = (
        await f.audit.listAuditEventsForResource(f.who, {
          resourceType: "ITEM",
          resourceId: created.item.id,
          limit: 50,
        })
      ).events;
      expect(events.map((e) => e.action)).toEqual(
        expect.arrayContaining(["ITEM_CREATED", "ITEM_DETAILS_CHANGED", "ITEM_MONEY_CHANGED"]),
      );
      expect(events).toContainEqual(
        expect.objectContaining({
          action: "ITEM_MONEY_CHANGED",
          before: expect.objectContaining({
            raw: { amountMinor: "100", currency: "AFN" },
            interpretation: expect.objectContaining({
              kind: "INTERPRETED",
              exponent: 2,
              decimal: "1.00",
            }),
          }),
          after: expect.objectContaining({
            raw: { amountMinor: "2", currency: "JPY" },
            interpretation: expect.objectContaining({
              kind: "INTERPRETED",
              exponent: 0,
              decimal: "2",
            }),
          }),
        }),
      );
      expect(events).toContainEqual(
        expect.objectContaining({
          action: "ITEM_MONEY_CHANGED",
          after: expect.objectContaining({ raw: null, interpretation: { kind: "MISSING" } }),
        }),
      );
      expect(JSON.stringify(events)).not.toContain(created.purchase.factToken);
      expect(JSON.stringify(events)).not.toMatch(/expectedFactToken|receipt|correctionReason/);
    });

    it("retains the real membership manager, separate erasable subject and before/after roles including Viewer self-removal", async () => {
      const f = await fixture(),
        memberId = randomUUID();
      await db.user.create({
        data: {
          id: memberId,
          name: "Audit member",
          email: `${memberId}@example.invalid`,
          emailVerified: true,
        },
      });
      const members = createMembershipService(db);
      await members.addMember(f.who, {
        collectionId: f.collection,
        userId: memberId,
        role: "EDITOR",
        expectedRevision: 0,
      });
      await members.changeRole(f.who, {
        collectionId: f.collection,
        userId: memberId,
        role: "VIEWER",
        expectedRevision: 1,
      });
      await members.removeMember(
        { userId: memberId },
        { collectionId: f.collection, userId: memberId, expectedRevision: 2 },
      );
      const events = (
        await f.audit.listAuditEventsForResource(f.who, {
          resourceType: "COLLECTION",
          resourceId: f.collection,
          limit: 50,
        })
      ).events;
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "MEMBERSHIP_ADDED",
            actorId: f.owner,
            subjectUserId: memberId,
            before: { role: null },
            after: { role: "EDITOR" },
          }),
          expect.objectContaining({
            action: "MEMBERSHIP_ROLE_CHANGED",
            actorId: f.owner,
            subjectUserId: memberId,
            before: { role: "EDITOR" },
            after: { role: "VIEWER" },
          }),
          expect.objectContaining({
            action: "MEMBERSHIP_REMOVED",
            actorId: memberId,
            subjectUserId: memberId,
            before: { role: "VIEWER" },
            after: { role: null },
          }),
        ]),
      );
      await db.user.delete({ where: { id: memberId } });
      const erased = (
        await f.audit.listAuditEventsForResource(f.who, {
          resourceType: "COLLECTION",
          resourceId: f.collection,
          limit: 50,
        })
      ).events;
      expect(erased.filter((e) => e.action.startsWith("MEMBERSHIP_"))).toHaveLength(3);
      expect(erased).toContainEqual(
        expect.objectContaining({
          action: "MEMBERSHIP_REMOVED",
          actorId: null,
          subjectUserId: null,
          before: { role: "VIEWER" },
          after: { role: null },
        }),
      );
      expect(JSON.stringify(erased)).not.toContain(memberId);
    });
  },
);
