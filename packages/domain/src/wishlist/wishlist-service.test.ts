import { createMembershipService } from "../collaboration/membership-service";
// Prepared while Phase09 final gates run; copied into packages only after Phase09 persistence.
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createItemService } from "../items/item-service";
import { createGradingService } from "../grading/grading-service";
import { createWishlistService } from "./wishlist-service";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "owned wishlist and distinct specimen duplicates",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    async function user() {
      const id = randomUUID();
      await db.user.create({
        data: {
          id,
          name: "Own wishlist fixture",
          email: `${id}@example.invalid`,
          emailVerified: true,
        },
      });
      return { userId: id };
    }
    it("marks canonical duplicate specimens idempotently without merging their grading or item data", async () => {
      const actor = await user(),
        c = await db.collection.create({
          data: { ownerId: actor.userId, name: "Separate graded specimens" },
        }),
        items = createItemService(db, actor.userId),
        a = await items.createItem({ collectionId: c.id, title: "Collector card" }),
        b = await items.createItem({ collectionId: c.id, title: "Collector card" });
      await createGradingService(db, actor.userId).addGrading(a.id, {
        provider: "PSA",
        grade: "9",
        certificateNo: "own-a",
      });
      await createGradingService(db, actor.userId).addGrading(b.id, {
        provider: "PSA",
        grade: "10",
        certificateNo: "own-b",
      });
      const before = await db.grading.findMany({
          where: { itemId: { in: [a.id, b.id] } },
          orderBy: { id: "asc" },
        }),
        service = createWishlistService(db);
      await service.markDuplicateRelation(actor, a.id, b.id);
      await service.markDuplicateRelation(actor, b.id, a.id);
      expect(await service.areMarkedDuplicates(actor, a.id, b.id)).toBe(true);
      expect(await db.duplicateRelation.count({ where: { ownerId: actor.userId } })).toBe(1);
      expect(
        await db.grading.findMany({
          where: { itemId: { in: [a.id, b.id] } },
          orderBy: { id: "asc" },
        }),
      ).toEqual(before);
      expect(await db.collectibleItem.count({ where: { id: { in: [a.id, b.id] } } })).toBe(2);
    });
    it("keeps wishlists private and preserves declared prospective money independently of historical amounts", async () => {
      const actor = await user(),
        foreign = await user(),
        service = createWishlistService(db);
      const wish = await service.createWishlistEntry(actor, {
        title: "Desired first edition",
        desiredCondition: "Complete",
        priority: 3,
        notes: "Own private wishlist note",
        targetPrice: { amountMinor: "12345", currency: "EUR", minorUnitExponent: 2 },
      });
      expect(wish.targetPrice).toEqual({
        amountMinor: "12345",
        currency: "EUR",
        minorUnitExponent: 2,
      });
      expect((await service.listWishlistEntries(actor, {})).entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: wish.id, notes: "Own private wishlist note" }),
        ]),
      );
      expect((await service.listWishlistEntries(foreign, {})).entries).toEqual([]);
      await expect(service.fulfillWishlistEntry(foreign, wish.id)).rejects.toMatchObject({
        code: "WISHLIST_NOT_FOUND",
      });
      const fulfilled = await service.fulfillWishlistEntry(actor, wish.id),
        retried = await service.fulfillWishlistEntry(actor, wish.id);
      expect(fulfilled.fulfilledAt).not.toBeNull();
      expect(retried.fulfilledAt).toBe(fulfilled.fulfilledAt);
      await expect(
        service.createWishlistEntry(actor, {
          title: "Wrong declared scale",
          targetPrice: { amountMinor: "12345", currency: "EUR", minorUnitExponent: 0 },
        }),
      ).rejects.toThrow();
    });
    it("refuses self-pairs, foreign specimens and trashed items without partial relation writes", async () => {
      const actor = await user(),
        foreign = await user(),
        c = await db.collection.create({
          data: { ownerId: actor.userId, name: "Owned private inventory" },
        }),
        other = await db.collection.create({
          data: { ownerId: foreign.userId, name: "Other private inventory" },
        }),
        a = await createItemService(db, actor.userId).createItem({
          collectionId: c.id,
          title: "Owned",
        }),
        b = await createItemService(db, foreign.userId).createItem({
          collectionId: other.id,
          title: "Foreign",
        }),
        service = createWishlistService(db);
      await expect(service.markDuplicateRelation(actor, a.id, a.id)).rejects.toThrow();
      await expect(service.markDuplicateRelation(actor, a.id, b.id)).rejects.toMatchObject({
        code: "WISHLIST_NOT_FOUND",
      });
      const deleted = await createItemService(db, actor.userId).createItem({
        collectionId: c.id,
        title: "Trashed",
      });
      await createItemService(db, actor.userId).deleteItem(deleted.id);
      await expect(service.markDuplicateRelation(actor, a.id, deleted.id)).rejects.toMatchObject({
        code: "WISHLIST_NOT_FOUND",
      });
      expect(await db.duplicateRelation.count({ where: { ownerId: actor.userId } })).toBe(0);
    });

    it("supports explicit unmarking and wishlist removal without foreign delete permission", async () => {
      const actor = await user(),
        foreign = await user(),
        c = await db.collection.create({
          data: { ownerId: actor.userId, name: "Reversible declarations" },
        }),
        items = createItemService(db, actor.userId),
        a = await items.createItem({ collectionId: c.id, title: "One specimen" }),
        b = await items.createItem({ collectionId: c.id, title: "Second specimen" }),
        service = createWishlistService(db),
        wish = await service.createWishlistEntry(actor, { title: "No longer wanted" });
      await expect(service.removeWishlistEntry(foreign, wish.id)).rejects.toMatchObject({
        code: "WISHLIST_NOT_FOUND",
      });
      await service.removeWishlistEntry(actor, wish.id);
      expect((await service.listWishlistEntries(actor, {})).entries).toHaveLength(0);
      await service.markDuplicateRelation(actor, a.id, b.id);
      await expect(service.unmarkDuplicateRelation(foreign, a.id, b.id)).rejects.toMatchObject({
        code: "WISHLIST_NOT_FOUND",
      });
      await service.unmarkDuplicateRelation(actor, b.id, a.id);
      await service.unmarkDuplicateRelation(actor, a.id, b.id);
      expect(await service.areMarkedDuplicates(actor, a.id, b.id)).toBe(false);
    });
    it("retires old duplicate declarations on actual ownership transfer while retaining both specimens", async () => {
      const actor = await user(),
        recipient = await user(),
        c = await db.collection.create({
          data: { ownerId: actor.userId, name: "Transferred specimen" },
        }),
        retained = await db.collection.create({
          data: { ownerId: actor.userId, name: "Retained specimen" },
        }),
        items = createItemService(db, actor.userId),
        a = await items.createItem({ collectionId: c.id, title: "Private transferred label" }),
        b = await items.createItem({ collectionId: retained.id, title: "Private retained label" }),
        service = createWishlistService(db);
      await service.markDuplicateRelation(actor, a.id, b.id);
      const members = createMembershipService(db);
      await members.addMember(actor, {
        collectionId: c.id,
        userId: recipient.userId,
        role: "VIEWER",
        expectedRevision: 0,
      });
      await members.transferOwnership(actor, {
        collectionId: c.id,
        newOwnerId: recipient.userId,
        expectedRevision: 1,
        confirmPrivateTransfer: true,
      });
      expect(await db.duplicateRelation.count({ where: { ownerId: actor.userId } })).toBe(0);
      expect(await db.collectibleItem.count({ where: { id: { in: [a.id, b.id] } } })).toBe(2);
      await expect(service.areMarkedDuplicates(actor, a.id, b.id)).rejects.toMatchObject({
        code: "WISHLIST_NOT_FOUND",
      });
      expect(
        (await service.listDuplicateCandidates(recipient, { itemId: a.id })).candidates,
      ).toEqual([]);
    });
    it("bounds private pages and suggestions and filters trashed and foreign specimens", async () => {
      const actor = await user(),
        foreign = await user(),
        c = await db.collection.create({ data: { ownerId: actor.userId, name: "Own candidates" } }),
        fc = await db.collection.create({
          data: { ownerId: foreign.userId, name: "Foreign candidates" },
        }),
        items = createItemService(db, actor.userId),
        service = createWishlistService(db),
        a = await items.createItem({ collectionId: c.id, title: "Same title" }),
        b = await items.createItem({ collectionId: c.id, title: "Explicit different title" }),
        suggested = await items.createItem({ collectionId: c.id, title: "Same title" }),
        deleted = await items.createItem({ collectionId: c.id, title: "Same title" });
      await createItemService(db, foreign.userId).createItem({
        collectionId: fc.id,
        title: "Same title",
      });
      await items.deleteItem(deleted.id);
      await service.markDuplicateRelation(actor, a.id, b.id);
      const candidates = await service.listDuplicateCandidates(actor, { itemId: a.id });
      expect(candidates.candidates.map((row) => row.id).sort()).toEqual(
        [b.id, suggested.id].sort(),
      );
      expect(candidates.candidates.find((row) => row.id === b.id)?.marked).toBe(true);
      for (let n = 0; n < 4; n++)
        await service.createWishlistEntry(actor, { title: `Wanted ${n}` });
      const first = await service.listWishlistEntries(actor, { limit: 2 });
      expect(first.entries).toHaveLength(2);
      expect(first.next).not.toBeNull();
      const second = await service.listWishlistEntries(actor, { limit: 2, afterId: first.next! });
      expect(second.entries).toHaveLength(2);
      expect(second.next).toBeNull();
      expect(new Set([...first.entries, ...second.entries].map((row) => row.id)).size).toBe(4);
      await expect(service.listWishlistEntries(actor, { limit: 51 })).rejects.toMatchObject({
        code: "WISHLIST_INVALID",
      });
    });
    it("serializes opposite-order concurrent marking into one canonical pair", async () => {
      const actor = await user(),
        c = await db.collection.create({
          data: { ownerId: actor.userId, name: "Concurrent marking" },
        }),
        items = createItemService(db, actor.userId),
        a = await items.createItem({ collectionId: c.id, title: "One" }),
        b = await items.createItem({ collectionId: c.id, title: "Two" }),
        service = createWishlistService(db),
        results = await Promise.all([
          service.markDuplicateRelation(actor, a.id, b.id),
          service.markDuplicateRelation(actor, b.id, a.id),
        ]);
      expect(results[0]!.id).toBe(results[1]!.id);
      expect(await db.duplicateRelation.count({ where: { ownerId: actor.userId } })).toBe(1);
    });

    it("keeps optional variant references coherent and preserves the desired entry when a variant is deleted", async () => {
      const actor = await user(),
        service = createWishlistService(db),
        category = await db.categoryTemplate.create({ data: { key: `wish_${randomUUID()}` } }),
        entry = await db.catalogEntry.create({
          data: { categoryTemplateId: category.id, authored: { title: "One desired entry" } },
        }),
        other = await db.catalogEntry.create({
          data: { categoryTemplateId: category.id, authored: { title: "Other desired entry" } },
        }),
        variant = await db.catalogVariant.create({
          data: { entryId: entry.id, authored: { title: "Variant" } },
        });
      await expect(
        service.createWishlistEntry(actor, {
          title: "Mismatched reference",
          catalogEntryId: other.id,
          catalogVariantId: variant.id,
        }),
      ).rejects.toMatchObject({ code: "WISHLIST_NOT_FOUND" });
      const wish = await service.createWishlistEntry(actor, {
        title: "Coherent reference",
        catalogEntryId: entry.id,
        catalogVariantId: variant.id,
      });
      await db.catalogVariant.delete({ where: { id: variant.id } });
      const listing = await service.listWishlistEntries(actor, {});
      expect(listing.entries.find((row) => row.id === wish.id)).toMatchObject({
        catalogEntryId: entry.id,
        catalogVariantId: null,
      });
    });
    it("enforces canonical distinct owner pairs in native SQL and cascades real account erasure", async () => {
      const actor = await user(),
        foreign = await user(),
        c = await db.collection.create({
          data: { ownerId: actor.userId, name: "Native duplicate guards" },
        }),
        items = createItemService(db, actor.userId),
        a = await items.createItem({ collectionId: c.id, title: "One" }),
        b = await items.createItem({ collectionId: c.id, title: "Two" }),
        [first, second] = [a.id, b.id].sort(),
        service = createWishlistService(db);
      await expect(
        db.duplicateRelation.create({
          data: { ownerId: actor.userId, itemAId: second!, itemBId: first! },
        }),
      ).rejects.toThrow();
      await expect(
        db.duplicateRelation.create({
          data: { ownerId: foreign.userId, itemAId: first!, itemBId: second! },
        }),
      ).rejects.toThrow();
      await service.markDuplicateRelation(actor, a.id, b.id);
      await service.createWishlistEntry(actor, { title: "Erased private wish" });
      await db.user.delete({ where: { id: actor.userId } });
      expect(await db.duplicateRelation.count({ where: { ownerId: actor.userId } })).toBe(0);
      expect(await db.wishlistEntry.count({ where: { ownerId: actor.userId } })).toBe(0);
    });
  },
);
