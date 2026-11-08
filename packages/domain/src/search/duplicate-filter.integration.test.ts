import { Prisma } from "@sammlerraum/db/search-sql";
import { runSearchRead, type SearchDatabase } from "./search-read";
import { createSmartCollectionService } from "./smart-collection-service";
import { createDashboardService } from "../dashboard/dashboard-service";
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
    it("reevaluates actual marks in saved searches and preserves independent dashboard pair counts", async () => {
      const f = await fixture(),
        saved = createSmartCollectionService(db),
        dashboard = createDashboardService(db);
      await f.wishes.markDuplicateRelation(f.actor, f.a.id, f.b.id);
      const definition = await saved.createSmartCollection(f.actor, {
        name: "My actual duplicates",
        definition: { version: 1, text: "", filter: filter(true), lifecycle: "ACTIVE" },
      });
      expect((await saved.resolveSmartCollectionItems(f.actor, definition.id)).total).toBe(2);
      const yes = await dashboard.getDashboard(f.actor, { filter: filter(true) }),
        no = await dashboard.getDashboard(f.actor, { filter: filter(false) });
      expect(yes.selection.itemCount).toBe(2);
      expect(yes.selection.unitCount).toBe("2");
      expect(no.selection.itemCount).toBe(1);
      expect(no.selection.unitCount).toBe("8");
      expect(yes.duplicates).toMatchObject({
        state: "AVAILABLE",
        selectionBasis: "ALL_LIVE_OWNED_PAIRS",
        count: 1,
      });
      expect(no.duplicates).toEqual(yes.duplicates);
      await f.wishes.unmarkDuplicateRelation(f.actor, f.a.id, f.b.id);
      expect((await saved.resolveSmartCollectionItems(f.actor, definition.id)).total).toBe(0);
      expect(
        (await dashboard.getDashboard(f.actor, { filter: filter(true) })).selection.itemCount,
      ).toBe(0);
      await f.wishes.markDuplicateRelation(f.actor, f.a.id, f.c.id);
      expect(
        (await saved.resolveSmartCollectionItems(f.actor, definition.id)).items
          .map((x) => x.id)
          .sort(),
      ).toEqual([f.a.id, f.c.id].sort());
    });
    it("counts overlapping explicit pairs once per item and keeps one snapshot across concurrent unmark", async () => {
      const f = await fixture();
      await f.wishes.markDuplicateRelation(f.actor, f.a.id, f.b.id);
      await f.wishes.markDuplicateRelation(f.actor, f.a.id, f.c.id);
      expect((await f.search.searchItems(f.actor, { filter: filter(true) })).total).toBe(3);
      await f.wishes.unmarkDuplicateRelation(f.actor, f.a.id, f.c.id);
      let changed = false;
      const measured: SearchDatabase = {
        $transaction: (work, options) =>
          db.$transaction(
            (tx) =>
              work({
                $queryRaw: async <T>(sql: Prisma.Sql) => {
                  const result = await tx.$queryRaw<T>(sql);
                  if (!changed && sql.text.startsWith("SELECT count(*) AS total")) {
                    changed = true;
                    await f.wishes.unmarkDuplicateRelation(f.actor, f.a.id, f.b.id);
                  }
                  return result;
                },
              }),
            options,
          ),
      };
      const page = await createItemSearchService(measured).searchItems(f.actor, {
        filter: filter(true),
      });
      expect(changed).toBe(true);
      expect(page.total).toBe(2);
      expect(page.items).toHaveLength(2);
      expect((await f.search.searchItems(f.actor, { filter: filter(true) })).total).toBe(0);
    });
    it.each([1, 50, 500])(
      "keeps duplicate query work bounded for %s owned items with native plans",
      async (n) => {
        const owner = randomUUID();
        await db.user.create({
          data: { id: owner, name: "Bounded duplicate fixture", email: `${owner}@example.invalid` },
        });
        const collection = await db.collection.create({
          data: { ownerId: owner, name: "Bounded duplicate scope" },
        });
        const ids = Array.from({ length: n }, () => randomUUID());
        await db.collectibleItem.createMany({
          data: ids.map((id) => ({
            id,
            ownerId: owner,
            collectionId: collection.id,
            title: "Native bounded duplicate specimen",
            quantity: 1,
          })),
        });
        const pairs = Array.from({ length: Math.floor(n / 2) }, (_, i) =>
          [ids[i * 2]!, ids[i * 2 + 1]!].sort(),
        );
        if (pairs.length)
          await db.duplicateRelation.createMany({
            data: pairs.map(([a, b]) => ({ ownerId: owner, itemAId: a!, itemBId: b! })),
          });
        const queries: Prisma.Sql[] = [];
        const measured: SearchDatabase = {
          $transaction: (work, options) =>
            db.$transaction(
              (tx) =>
                work({
                  $queryRaw: async <T>(sql: Prisma.Sql) => {
                    queries.push(sql);
                    return tx.$queryRaw<T>(sql);
                  },
                }),
              options,
            ),
        };
        const result = [];
        for (const value of [true, false]) {
          const before = queries.length,
            start = performance.now();
          const page = await createItemSearchService(measured).searchItems(
            { userId: owner },
            { filter: filter(value), limit: 1 },
          );
          const expected = value ? Math.floor(n / 2) * 2 : n % 2;
          expect(page.total).toBe(expected);
          expect(page.items).toHaveLength(Math.min(expected, 1));
          expect(queries.length - before).toBe(11);
          result.push({
            value,
            total: page.total,
            elapsedMs: performance.now() - start,
            rawCallsIncludingConfiguration: queries.length - before,
          });
        }
        const plans = await runSearchRead(db, async (tx) => {
          const output = [];
          for (const sql of queries.filter(
            (q) =>
              q.text.startsWith("SELECT count(*) AS total") ||
              q.text.startsWith("SELECT i.id,i.title"),
          )) {
            output.push({
              query: sql.text,
              plan: await tx.$queryRaw(Prisma.sql`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${sql}`),
            });
          }
          return output;
        });
        console.info(
          "DUPLICATE_QUERY_PROOF",
          JSON.stringify({ ownedItems: n, explicitPairs: pairs.length, results: result, plans }),
        );
      },
    );
  },
);
