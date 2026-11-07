import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { Prisma } from "@sammlerraum/db/search-sql";
import { SmartCollectionError } from "@sammlerraum/contracts/smart-collections";
import { createSmartCollectionService } from "./smart-collection-service";
import { createItemSearchService, type SearchDatabase } from "./item-search-service";
import { encodeSearchCursor } from "./search-cursor";
import { createHash } from "node:crypto";
import { createTagService } from "../items/tag-service";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const owner = `smart_${randomUUID()}`;
let item: string, collection: string;
const actor = { userId: owner };
const definition = { version: 1 as const, text: "", filter: null, lifecycle: "ACTIVE" as const };
const service = () => createSmartCollectionService(db!);
const create = (name = "Saved", query: object = {}) =>
  service().createSmartCollection(actor, { name, definition: { ...definition, ...query } });
describe.runIf(enabled)("owned dynamic saved queries PostgreSQL", () => {
  beforeAll(async () => {
    await db!.user.create({
      data: { id: owner, name: "Saved", email: `${owner}@example.invalid` },
    });
    const c = await db!.collection.create({ data: { ownerId: owner, name: "Saved" } });
    collection = c.id;
    item = (
      await db!.collectibleItem.create({
        data: { ownerId: owner, collectionId: collection, title: "Signed watch" },
      })
    ).id;
  });
  afterAll(async () => {
    await db?.user.deleteMany({ where: { id: owner } });
    await db?.$disconnect();
  });
  it("reflects actual tag-service edits without storing membership rows", async () => {
    const path = "./smart-collection-service";
    const module = await import(path);
    expect(module?.createSmartCollectionService, "saved query service must exist").toBeTypeOf(
      "function",
    );
    const service = module!.createSmartCollectionService(db!);
    const actor = { userId: owner };
    const smart = await service.createSmartCollection(actor, {
      name: "Signed",
      definition: {
        version: 1,
        text: "watch",
        lifecycle: "ACTIVE",
        filter: { version: 1, root: { kind: "tags", test: { op: "hasAll", values: ["signed"] } } },
      },
    });
    expect((await service.resolveSmartCollectionItems(actor, smart.id, {})).items).toHaveLength(0);
    await createTagService(db!, owner).setItemTags(item, ["signed"]);
    expect(
      (await service.resolveSmartCollectionItems(actor, smart.id, {})).items.map(
        (x: { id: string }) => x.id,
      ),
    ).toEqual([item]);
    await createTagService(db!, owner).setItemTags(item, []);
    expect((await service.resolveSmartCollectionItems(actor, smart.id, {})).total).toBe(0);
  });
  it("persists the whole normalized query and no result membership relation", async () => {
    const saved = await create(" Ｓaved ", { text: " Ｗatch ", lifecycle: "ALL" });
    expect(saved.name).toBe("Saved");
    expect(saved.definition).toEqual({ ...definition, text: "Watch", lifecycle: "ALL" });
    const row = await db!.smartCollection.findUniqueOrThrow({ where: { id: saved.id } });
    expect(row.definition).toEqual(saved.definition);
    expect(row.filterVersion).toBe(1);
    const tables = await db!.$queryRaw<
      { name: string }[]
    >`SELECT conrelid::regclass::text AS name FROM pg_constraint WHERE confrelid='"SmartCollection"'::regclass AND contype='f'`;
    expect(tables).toEqual([]);
  });
  it("hides foreign/missing/deleted saved IDs and inventory in rows/count", async () => {
    const foreign = `foreign_${randomUUID()}`;
    await db!.user.create({
      data: { id: foreign, name: "Other", email: `${foreign}@example.invalid` },
    });
    try {
      const c = await db!.collection.create({ data: { ownerId: foreign, name: "Other" } });
      await db!.collectibleItem.create({
        data: { ownerId: foreign, collectionId: c.id, title: "Hidden", visibility: "PUBLIC" },
      });
      const saved = await create();
      const svc = service();
      const own = await svc.resolveSmartCollectionItems(actor, saved.id, {});
      expect(own.total).toBe(
        await db!.collectibleItem.count({
          where: { ownerId: owner, deletedAt: null, archivedAt: null, disposedAt: null },
        }),
      );
      expect(own.items.every((x) => x.collectionId === collection)).toBe(true);
      for (const id of [saved.id, randomUUID()]) {
        await expect(svc.getSmartCollection({ userId: foreign }, id)).rejects.toMatchObject({
          code: "SMART_COLLECTION_NOT_FOUND",
        });
        await expect(
          svc.resolveSmartCollectionItems({ userId: foreign }, id, {}),
        ).rejects.toMatchObject({ code: "SMART_COLLECTION_NOT_FOUND" });
        await expect(
          svc.updateSmartCollection({ userId: foreign }, id, {
            name: "Other",
            definition,
            expectedRevision: 1,
          }),
        ).rejects.toMatchObject({ code: "SMART_COLLECTION_NOT_FOUND" });
        await expect(
          svc.deleteSmartCollection({ userId: foreign }, id, { expectedRevision: 1 }),
        ).rejects.toMatchObject({ code: "SMART_COLLECTION_NOT_FOUND" });
      }
      expect((await svc.listSmartCollections({ userId: foreign }, {})).total).toBe(0);
      await svc.deleteSmartCollection(actor, saved.id, { expectedRevision: 1 });
      await expect(svc.getSmartCollection(actor, saved.id)).rejects.toMatchObject({
        code: "SMART_COLLECTION_NOT_FOUND",
      });
    } finally {
      await db!.user.delete({ where: { id: foreign } });
    }
  });
  it("paginates summaries/count before cursor and rejects owner/limit/operation replay", async () => {
    await create();
    await create();
    const svc = service(),
      first = await svc.listSmartCollections(actor, { limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).not.toHaveProperty("definition");
    expect(first.nextCursor).toBeTruthy();
    const second = await svc.listSmartCollections(actor, { limit: 1, cursor: first.nextCursor! });
    expect(second.total).toBe(first.total);
    expect(second.items[0]!.id).not.toBe(first.items[0]!.id);
    let page = first;
    const seen = new Set<string>();
    do {
      for (const x of page.items) {
        expect(seen.has(x.id)).toBe(false);
        seen.add(x.id);
      }
      if (!page.nextCursor) break;
      page = await svc.listSmartCollections(actor, { limit: 1, cursor: page.nextCursor });
    } while (true);
    expect(seen.size).toBe(first.total);
    for (const [a, input] of [
      [actor, { limit: 2, cursor: first.nextCursor }],
      [{ userId: "other" }, { limit: 1, cursor: first.nextCursor }],
    ] as const)
      await expect(svc.listSmartCollections(a, input)).rejects.toMatchObject({
        code: "SEARCH_INVALID",
      });
    const saved = await create();
    await expect(
      svc.resolveSmartCollectionItems(actor, saved.id, { limit: 1, cursor: first.nextCursor }),
    ).rejects.toMatchObject({ code: "SEARCH_INVALID" });
    await expect(svc.listSmartCollections(actor, { limit: 51 })).rejects.toMatchObject({
      code: "SMART_COLLECTION_INVALID",
    });
  });
  it("binds item cursors to saved id/revision/query/limit and rejects overrides", async () => {
    const extra = await db!.collectibleItem.create({
      data: { ownerId: owner, collectionId: collection, title: "Extra" },
    });
    try {
      const a = await create(),
        b = await create(),
        svc = service(),
        first = await svc.resolveSmartCollectionItems(actor, a.id, { limit: 1 });
      expect(first.nextCursor).toBeTruthy();
      for (const [id, input] of [
        [b.id, { limit: 1, cursor: first.nextCursor }],
        [a.id, { limit: 2, cursor: first.nextCursor }],
        [a.id, { text: "override" }],
        [a.id, { scope: "SHARED" }],
        [a.id, { context: { revision: 1 } }],
      ] as const)
        await expect(svc.resolveSmartCollectionItems(actor, id, input)).rejects.toBeDefined();
      const direct = await createItemSearchService(db!).searchItems(actor, { limit: 1 });
      await expect(
        svc.resolveSmartCollectionItems(actor, a.id, { limit: 1, cursor: direct.nextCursor }),
      ).rejects.toMatchObject({ code: "SEARCH_INVALID" });
      await expect(
        createItemSearchService(db!).searchItems(actor, { limit: 1, cursor: first.nextCursor }),
      ).rejects.toMatchObject({ code: "SEARCH_INVALID" });
      await svc.updateSmartCollection(actor, a.id, {
        name: a.name,
        definition: a.definition,
        expectedRevision: 1,
      });
      await expect(
        svc.resolveSmartCollectionItems(actor, a.id, { limit: 1, cursor: first.nextCursor }),
      ).rejects.toMatchObject({ code: "SEARCH_INVALID" });
      const changed = await svc.updateSmartCollection(actor, a.id, {
        name: "Changed",
        definition: { ...definition, text: "impossible" },
        expectedRevision: 2,
      });
      expect(changed.revision).toBe(3);
      expect((await svc.resolveSmartCollectionItems(actor, a.id, {})).total).toBe(0);
    } finally {
      await db!.collectibleItem.delete({ where: { id: extra.id } });
    }
  });
  it("uses atomic CAS for concurrent replacements and delete/update races", async () => {
    const saved = await create(),
      svc = service();
    const mutations = await Promise.allSettled(
      [1, 2].map((n) =>
        svc.updateSmartCollection(actor, saved.id, {
          name: `Changed ${n}`,
          definition,
          expectedRevision: 1,
        }),
      ),
    );
    expect(mutations.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(mutations.filter((x) => x.status === "rejected").map((x) => x.reason.code)).toEqual([
      "SMART_COLLECTION_CONFLICT",
    ]);
    const race = await Promise.allSettled([
      svc.updateSmartCollection(actor, saved.id, {
        name: "Replacement",
        definition,
        expectedRevision: 2,
      }),
      svc.deleteSmartCollection(actor, saved.id, { expectedRevision: 2 }),
    ]);
    expect(race.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(race.filter((x) => x.status === "rejected").map((x) => x.reason.code)).toEqual([
      expect.stringMatching(/^SMART_COLLECTION_(CONFLICT|NOT_FOUND)$/u),
    ]);
  });
  it("closes revision overflow before any write", async () => {
    const saved = await create();
    await db!.smartCollection.update({ where: { id: saved.id }, data: { revision: 2147483647 } });
    await expect(
      service().updateSmartCollection(actor, saved.id, {
        name: "Overflow",
        definition,
        expectedRevision: 2147483647,
      }),
    ).rejects.toMatchObject({ code: "SMART_COLLECTION_CONFLICT" });
    await expect(
      service().deleteSmartCollection(actor, saved.id, { expectedRevision: 2147483647 }),
    ).rejects.toMatchObject({ code: "SMART_COLLECTION_CONFLICT" });
    expect(
      (await db!.smartCollection.findUniqueOrThrow({ where: { id: saved.id } })).deletedAt,
    ).toBeNull();
  });
  it("revalidates references under NOT/OR and with empty candidates", async () => {
    for (const root of [
      { kind: "not", child: { kind: "collection", test: { op: "eq", value: randomUUID() } } },
      {
        kind: "or",
        children: [
          { kind: "tags", test: { op: "present" } },
          { kind: "collection", test: { op: "eq", value: randomUUID() } },
        ],
      },
    ])
      await expect(
        create("Invalid", { text: "no candidates", filter: { version: 1, root } }),
      ).rejects.toMatchObject({ code: "FILTER_REFERENCE_INVALID" });
    for (const root of [
      { kind: "not", child: { kind: "duplicate", value: true } },
      {
        kind: "or",
        children: [
          { kind: "tags", test: { op: "present" } },
          { kind: "duplicate", value: true },
        ],
      },
    ])
      await expect(
        create("Unsupported", { text: "no candidates", filter: { version: 1, root } }),
      ).rejects.toMatchObject({ code: "FILTER_UNAVAILABLE" });
  });
  it("retains structurally valid unavailable definitions for editing but closes malformed data", async () => {
    const saved = await create();
    const unsupported = {
      ...definition,
      filter: { version: 1, root: { kind: "duplicate", value: true } },
    };
    await db!.smartCollection.update({
      where: { id: saved.id },
      data: { definition: unsupported },
    });
    expect((await service().getSmartCollection(actor, saved.id)).definition).toEqual(unsupported);
    await expect(service().resolveSmartCollectionItems(actor, saved.id, {})).rejects.toMatchObject({
      code: "SMART_COLLECTION_UNRESOLVABLE",
    });
    await expect(
      service().resolveSmartCollectionItems(actor, saved.id, { cursor: "bad" }),
    ).rejects.toMatchObject({ code: "SEARCH_INVALID" });
    await db!.smartCollection.update({
      where: { id: saved.id },
      data: { definition: { ...definition, filter: { bad: "secret malformed" } } },
    });
    await expect(service().getSmartCollection(actor, saved.id)).rejects.toMatchObject({
      code: "SMART_COLLECTION_UNRESOLVABLE",
    });
    await expect(service().resolveSmartCollectionItems(actor, saved.id, {})).rejects.toMatchObject({
      code: "SMART_COLLECTION_UNRESOLVABLE",
    });
    expect(
      (
        await service().updateSmartCollection(actor, saved.id, {
          name: "Repaired",
          definition,
          expectedRevision: 1,
        })
      ).revision,
    ).toBe(2);
  });
  it("revalidates deleted referenced collections and live parent/lifecycle state", async () => {
    const c = await db!.collection.create({ data: { ownerId: owner, name: "Temporary" } });
    const i = await db!.collectibleItem.create({
      data: { ownerId: owner, collectionId: c.id, title: "Lifecycle" },
    });
    try {
      const saved = await create("Lifecycle", {
        text: "Lifecycle",
        lifecycle: "ALL",
        filter: { version: 1, root: { kind: "collection", test: { op: "eq", value: c.id } } },
      });
      expect((await service().resolveSmartCollectionItems(actor, saved.id, {})).total).toBe(1);
      await db!.collectibleItem.update({ where: { id: i.id }, data: { archivedAt: new Date() } });
      expect((await service().resolveSmartCollectionItems(actor, saved.id, {})).total).toBe(1);
      const active = await create("Active", { text: "Lifecycle" });
      expect((await service().resolveSmartCollectionItems(actor, active.id, {})).total).toBe(0);
      await db!.collection.update({ where: { id: c.id }, data: { deletedAt: new Date() } });
      await expect(
        service().resolveSmartCollectionItems(actor, saved.id, {}),
      ).rejects.toMatchObject({ code: "SMART_COLLECTION_UNRESOLVABLE" });
      expect((await service().getSmartCollection(actor, saved.id)).definition.filter).toBeTruthy();
      expect((await service().resolveSmartCollectionItems(actor, active.id, {})).total).toBe(0);
    } finally {
      await db!.collectibleItem.delete({ where: { id: i.id } });
      await db!.collection.delete({ where: { id: c.id } });
    }
  });
  it("loads saved definition/count/rows in one snapshot then sees subsequent live changes", async () => {
    const i = await db!.collectibleItem.create({
        data: { ownerId: owner, collectionId: collection, title: "Snapshot before" },
      }),
      saved = await create("Snapshot", { text: "Snapshot before" });
    let changed = false;
    const database: SearchDatabase = {
      $transaction: (work, options) =>
        db!.$transaction(
          (tx) =>
            work({
              $queryRaw: async <T>(sql: Prisma.Sql) => {
                const rows = await tx.$queryRaw<T>(sql);
                if (!changed && sql.sql.includes('FROM "SmartCollection"')) {
                  changed = true;
                  await db!.smartCollection.update({
                    where: { id: saved.id },
                    data: { definition: { ...definition, text: "Snapshot after" }, revision: 2 },
                  });
                  await db!.collectibleItem.update({
                    where: { id: i.id },
                    data: { title: "Snapshot after" },
                  });
                }
                return rows;
              },
            }),
          options,
        ),
    };
    try {
      const page = await createSmartCollectionService(database).resolveSmartCollectionItems(
        actor,
        saved.id,
        {},
      );
      expect(changed).toBe(true);
      expect(page.total).toBe(1);
      expect(page.items.map((x) => x.title)).toEqual(["Snapshot before"]);
      const live = await service().resolveSmartCollectionItems(actor, saved.id, {});
      expect(live.items.map((x) => x.title)).toEqual(["Snapshot after"]);
    } finally {
      await db!.collectibleItem.delete({ where: { id: i.id } });
    }
  });
  it("rolls back create/update/delete when a recognized domain error follows the real write", async () => {
    const saved = await create("Rollback original");
    const database: SearchDatabase = {
      $transaction: (work, options) =>
        db!.$transaction(
          (tx) =>
            work({
              $queryRaw: async <T>(sql: Prisma.Sql) => {
                const rows = await tx.$queryRaw<T>(sql);
                if (/^(?:INSERT INTO|UPDATE) "SmartCollection"/u.test(sql.sql))
                  throw new SmartCollectionError("SMART_COLLECTION_CONFLICT");
                return rows;
              },
            }),
          options,
        ),
    };
    const svc = createSmartCollectionService(database);
    await expect(
      svc.createSmartCollection(actor, { name: "Rollback create", definition }),
    ).rejects.toMatchObject({ code: "SMART_COLLECTION_CONFLICT" });
    expect(
      await db!.smartCollection.count({ where: { ownerId: owner, name: "Rollback create" } }),
    ).toBe(0);
    await expect(
      svc.updateSmartCollection(actor, saved.id, {
        name: "Rollback update",
        definition,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "SMART_COLLECTION_CONFLICT" });
    await expect(
      svc.deleteSmartCollection(actor, saved.id, { expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: "SMART_COLLECTION_CONFLICT" });
    const unchanged = await db!.smartCollection.findUniqueOrThrow({ where: { id: saved.id } });
    expect(unchanged.name).toBe("Rollback original");
    expect(unchanged.revision).toBe(1);
    expect(unchanged.deletedAt).toBeNull();
  });
  it("rolls back actual PostgreSQL failure after insert without converting it into definition conflict", async () => {
    const database: SearchDatabase = {
      $transaction: (work, options) =>
        db!.$transaction(
          (tx) =>
            work({
              $queryRaw: async <T>(sql: Prisma.Sql) => {
                const rows = await tx.$queryRaw<T>(sql);
                if (sql.sql.startsWith('INSERT INTO "SmartCollection"'))
                  await tx.$queryRaw(Prisma.sql`SELECT 1/0`);
                return rows;
              },
            }),
          options,
        ),
    };
    await expect(
      createSmartCollectionService(database).createSmartCollection(actor, {
        name: "Native failed create",
        definition,
      }),
    ).rejects.toMatchObject({ code: "SEARCH_INVARIANT" });
    expect(
      await db!.smartCollection.count({ where: { ownerId: owner, name: "Native failed create" } }),
    ).toBe(0);
  });
  it("enforces native envelope/version/revision/size constraints", async () => {
    const saved = await create();
    for (const sql of [
      Prisma.sql`UPDATE "SmartCollection" SET "filterVersion"=2 WHERE id=${saved.id}::uuid`,
      Prisma.sql`UPDATE "SmartCollection" SET revision=0 WHERE id=${saved.id}::uuid`,
      Prisma.sql`UPDATE "SmartCollection" SET definition='{}'::jsonb WHERE id=${saved.id}::uuid`,
      Prisma.sql`UPDATE "SmartCollection" SET definition=${JSON.stringify({ ...definition, text: "x".repeat(33000) })}::jsonb WHERE id=${saved.id}::uuid`,
    ])
      await expect(db!.$executeRaw(sql)).rejects.toBeDefined();
  });
  it("returns exact totals for empty/exhausted lists and rejects impossible count before page SQL", async () => {
    const svc = service();
    const hash = createHash("sha256")
      .update(JSON.stringify(["smart-collection-list", 1, owner, 20, "CREATED_DESC_ID_DESC"]))
      .digest("hex");
    const cursor = encodeSearchCursor({
      v: 1,
      contextHash: hash,
      after: { createdAt: "0001-01-01T00:00:00.000Z", id: "00000000-0000-4000-8000-000000000000" },
    });
    const exhausted = await svc.listSmartCollections(actor, { cursor });
    expect(exhausted.items).toEqual([]);
    expect(exhausted.total).toBe(
      await db!.smartCollection.count({ where: { ownerId: owner, deletedAt: null } }),
    );
    const empty = await svc.listSmartCollections({ userId: `empty_${randomUUID()}` }, {});
    expect(empty).toEqual({ items: [], total: 0, nextCursor: null });
    let pageRead = false;
    const database: SearchDatabase = {
      $transaction: (work, options) =>
        db!.$transaction(
          (tx) =>
            work({
              $queryRaw: async <T>(sql: Prisma.Sql) => {
                const rows = await tx.$queryRaw<T>(sql);
                if (sql.sql.startsWith('SELECT count(*) AS total FROM "SmartCollection"'))
                  return [{ total: 9007199254740992n }] as T;
                if (sql.sql.startsWith('SELECT id,name,revision,"createdAt"')) pageRead = true;
                return rows;
              },
            }),
          options,
        ),
    };
    await expect(
      createSmartCollectionService(database).listSmartCollections(actor, { cursor }),
    ).rejects.toMatchObject({ code: "SEARCH_INVARIANT" });
    expect(pageRead).toBe(false);
  });
  it("retries recognized native serialization only and leaves one mutation", async () => {
    let attempts = 0;
    const database: SearchDatabase = {
      $transaction: (work, options) => {
        attempts++;
        return db!.$transaction(
          (tx) =>
            work({
              $queryRaw: async <T>(sql: Prisma.Sql) => {
                const rows = await tx.$queryRaw<T>(sql);
                if (attempts === 1 && sql.sql.startsWith('INSERT INTO "SmartCollection"'))
                  await tx.$queryRaw(
                    Prisma.sql`DO $$ BEGIN RAISE EXCEPTION 'saved test serialization' USING ERRCODE='40001'; END $$`,
                  );
                return rows;
              },
            }),
          options,
        );
      },
    };
    const saved = await createSmartCollectionService(database).createSmartCollection(actor, {
      name: "Retry once",
      definition,
    });
    expect(attempts).toBe(2);
    expect(saved.revision).toBe(1);
    expect(await db!.smartCollection.count({ where: { ownerId: owner, name: "Retry once" } })).toBe(
      1,
    );
  });
  it("rolls back timed-out mutation and retains dependency503 outside definition conflicts", async () => {
    const saved = await create("Timeout original");
    const database: SearchDatabase = {
      $transaction: (work, options) =>
        db!.$transaction(
          (tx) =>
            work({
              $queryRaw: async <T>(sql: Prisma.Sql) => {
                const rows = await tx.$queryRaw<T>(sql);
                if (sql.sql.startsWith('UPDATE "SmartCollection"'))
                  await tx.$queryRaw(Prisma.sql`SELECT pg_sleep(3)`);
                return rows;
              },
            }),
          options,
        ),
    };
    await expect(
      createSmartCollectionService(database).updateSmartCollection(actor, saved.id, {
        name: "Timeout replacement",
        definition,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ code: "SEARCH_UNAVAILABLE" });
    const row = await db!.smartCollection.findUniqueOrThrow({ where: { id: saved.id } });
    expect(row.name).toBe("Timeout original");
    expect(row.revision).toBe(1);
    const unavailable: SearchDatabase = {
      $transaction: async () => {
        throw { code: "ECONNREFUSED" };
      },
    };
    await expect(
      createSmartCollectionService(unavailable).resolveSmartCollectionItems(actor, saved.id, {}),
    ).rejects.toMatchObject({ code: "SEARCH_UNAVAILABLE" });
  }, 7000);
  it("requires actor on every service operation", async () => {
    const svc = service(),
      bad = { userId: "" },
      id = randomUUID();
    for (const work of [
      () => svc.createSmartCollection(bad, { name: "x", definition }),
      () => svc.getSmartCollection(bad, id),
      () => svc.listSmartCollections(bad, {}),
      () => svc.resolveSmartCollectionItems(bad, id, {}),
      () => svc.updateSmartCollection(bad, id, { name: "x", definition, expectedRevision: 1 }),
      () => svc.deleteSmartCollection(bad, id, { expectedRevision: 1 }),
    ])
      await expect(work()).rejects.toMatchObject({ code: "SMART_COLLECTION_INVALID" });
  });
});
