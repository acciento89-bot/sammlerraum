import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createItemService } from "../items/item-service";
import { createWishlistService } from "../wishlist/wishlist-service";
import { createMembershipService } from "../collaboration/membership-service";
import { createItemSearchService } from "./item-search-service";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
const filter = (value: boolean) => ({ version: 1, root: { kind: "duplicate", value } });
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual private duplicate-filter semantics",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    async function fixture() {
      const owner = randomUUID();
      await db.user.create({
        data: {
          id: owner,
          name: "Duplicate fixture",
          email: `${owner}@example.invalid`,
          emailVerified: true,
        },
      });
      const collection = await db.collection.create({
          data: { ownerId: owner, name: "Private duplicates" },
        }),
        other = await db.collection.create({
          data: { ownerId: owner, name: "Other private parent" },
        }),
        items = createItemService(db, owner);
      const a = await items.createItem({
          collectionId: collection.id,
          title: "Same title",
          quantity: 1,
        }),
        b = await items.createItem({
          collectionId: other.id,
          title: "Different specimen",
          quantity: 1,
        }),
        c = await items.createItem({
          collectionId: collection.id,
          title: "Same title",
          quantity: 8,
        });
      return {
        owner,
        actor: { userId: owner },
        collection,
        other,
        items,
        a,
        b,
        c,
        wishes: createWishlistService(db),
        search: createItemSearchService(db),
      };
    }
    it("matches both explicit endpoints and complements false without title or quantity inference", async () => {
      const f = await fixture();
      await f.wishes.markDuplicateRelation(f.actor, f.a.id, f.b.id);
      const yes = await f.search.searchItems(f.actor, { filter: filter(true) }),
        no = await f.search.searchItems(f.actor, { filter: filter(false) });
      expect(yes.total).toBe(2);
      expect(yes.items.map((x) => x.id).sort()).toEqual([f.a.id, f.b.id].sort());
      expect(no.items.map((x) => x.id)).toEqual([f.c.id]);
      expect(JSON.stringify(yes)).not.toContain("itemAId");
      expect(JSON.stringify(yes)).not.toContain("itemBId");
    });
    it("supports mixed NOT/OR over current facts and returns no false match for missing declarations", async () => {
      const f = await fixture();
      await f.wishes.markDuplicateRelation(f.actor, f.a.id, f.b.id);
      const query = {
        version: 1,
        root: { kind: "not", child: { kind: "duplicate", value: false } },
      };
      expect((await f.search.searchItems(f.actor, { filter: query })).total).toBe(2);
      expect(
        (
          await f.search.searchItems(f.actor, {
            filter: {
              version: 1,
              root: {
                kind: "or",
                children: [
                  { kind: "duplicate", value: true },
                  { kind: "collection", test: { op: "eq", value: f.collection.id } },
                ],
              },
            },
          })
        ).total,
      ).toBe(3);
      expect(
        (await f.search.searchItems(f.actor, { text: "no matching title", filter: filter(true) }))
          .total,
      ).toBe(0);
    });
    it("retains explicit relations across ordinary partner lifecycle changes while applying candidate lifecycle", async () => {
      const f = await fixture();
      await f.wishes.markDuplicateRelation(f.actor, f.a.id, f.b.id);
      await f.items.archiveItem(f.b.id);
      expect(
        (
          await f.search.searchItems(f.actor, { filter: filter(true), lifecycle: "ACTIVE" })
        ).items.map((x) => x.id),
      ).toEqual([f.a.id]);
      expect(
        (
          await f.search.searchItems(f.actor, { filter: filter(true), lifecycle: "ARCHIVED" })
        ).items.map((x) => x.id),
      ).toEqual([f.b.id]);
      await db.collectibleItem.update({ where: { id: f.b.id }, data: { disposedAt: new Date() } });
      expect(
        (
          await f.search.searchItems(f.actor, { filter: filter(true), lifecycle: "DISPOSED" })
        ).items.map((x) => x.id),
      ).toEqual([f.b.id]);
    });
    it.each(["item", "parent"])(
      "excludes a deleted partner %s instead of retaining a stale flag",
      async (kind) => {
        const f = await fixture();
        await f.wishes.markDuplicateRelation(f.actor, f.a.id, f.b.id);
        if (kind === "item") await f.items.deleteItem(f.b.id);
        else
          await db.collection.update({
            where: { id: f.other.id },
            data: { deletedAt: new Date() },
          });
        expect((await f.search.searchItems(f.actor, { filter: filter(true) })).total).toBe(0);
        expect(
          (await f.search.searchItems(f.actor, { filter: filter(false) })).items
            .map((x) => x.id)
            .sort(),
        ).toEqual([f.a.id, f.c.id].sort());
      },
    );
    it("rechecks real mark/unmark and pre-cursor totals on an exhausted page", async () => {
      const f = await fixture();
      await f.wishes.markDuplicateRelation(f.actor, f.a.id, f.b.id);
      const input = { filter: filter(true), limit: 1 },
        first = await f.search.searchItems(f.actor, input);
      expect(first.nextCursor).not.toBeNull();
      expect(
        (await f.search.searchItems(f.actor, { ...input, cursor: first.nextCursor })).total,
      ).toBe(2);
      await f.wishes.unmarkDuplicateRelation(f.actor, f.b.id, f.a.id);
      const empty = await f.search.searchItems(f.actor, { ...input, cursor: first.nextCursor });
      expect(empty.total).toBe(0);
      expect(empty.items).toEqual([]);
    });
    it("does not grant private duplicate inference to a collection member and retires pairs on actual transfer", async () => {
      const f = await fixture(),
        recipient = await fixture(),
        members = createMembershipService(db);
      await f.wishes.markDuplicateRelation(f.actor, f.a.id, f.b.id);
      await members.addMember(f.actor, {
        collectionId: f.other.id,
        userId: recipient.owner,
        role: "VIEWER",
        expectedRevision: 0,
      });
      expect(
        (await recipient.search.searchItems(recipient.actor, { filter: filter(true) })).total,
      ).toBe(0);
      await members.transferOwnership(f.actor, {
        collectionId: f.other.id,
        newOwnerId: recipient.owner,
        expectedRevision: 1,
        confirmPrivateTransfer: true,
      });
      expect((await f.search.searchItems(f.actor, { filter: filter(true) })).total).toBe(0);
      expect(
        (await recipient.search.searchItems(recipient.actor, { filter: filter(true) })).total,
      ).toBe(0);
      expect(await db.duplicateRelation.count({ where: { ownerId: f.owner } })).toBe(0);
    });
  },
);
