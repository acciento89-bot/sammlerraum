import { randomUUID } from "node:crypto";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createItemQuery } from "../items/item-query";
import { createItemService } from "../items/item-service";
import {
  createCollectionService,
  type CollectionDatabase,
} from "../collections/collection-service";
import { createValuationService, type ValuationDatabase } from "./valuation-service";

const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const ownerId = `ValuationOwner_${randomUUID()}`;
const foreignId = `ForeignValuationOwner_${randomUUID()}`;
let collectionId: string;
const service = () => createValuationService(db!, ownerId);
const item = (quantity = 1) =>
  createItemService(db!, ownerId).createItem({
    collectionId,
    title: "Valuation fixture",
    quantity,
  });

describe.runIf(enabled)("private manual valuation PostgreSQL", () => {
  beforeAll(async () => {
    for (const id of [ownerId, foreignId])
      await db!.user.create({
        data: { id, name: "Valuation fixture", email: `${id}@example.invalid` },
      });
    collectionId = (await db!.collection.create({ data: { ownerId, name: "Valuations" } })).id;
  });
  afterAll(async () => {
    if (db) {
      await db.user.deleteMany({ where: { id: { in: [ownerId, foreignId] } } });
      await db.$disconnect();
    }
  });
  it("appends exact per-unit amounts without overwriting and preserves case-sensitive authors", async () => {
    const target = await item(3);
    expect(await service().latestManualValuation(target.id)).toBeNull();
    const first = await service().addManualValuation(target.id.toUpperCase(), {
      amountMinor: 9007199254740993n,
      currency: "EUR",
      note: "  Private estimate  ",
    });
    const second = await service().addManualValuation(target.id, {
      amountMinor: 0n,
      currency: "JPY",
    });
    expect(first).toMatchObject({
      itemId: target.id,
      ownerId,
      actorUserId: ownerId,
      amountMinor: 9007199254740993n,
      currency: "EUR",
      minorUnitExponent: 2,
      basis: "PER_UNIT",
      type: "MANUAL",
      note: "Private estimate",
    });
    expect(first.observedAt).toEqual(first.createdAt);
    expect(second).toMatchObject({
      amountMinor: 0n,
      currency: "JPY",
      minorUnitExponent: 0,
      note: null,
    });
    const history = await service().listManualValuations(target.id);
    expect(history.records).toHaveLength(2);
    expect(history.records).toContainEqual(first);
    expect(second.id).not.toBe(first.id);
    await expect(
      createValuationService(db!, ownerId.toLowerCase()).latestManualValuation(target.id),
    ).rejects.toMatchObject({ code: "ITEM_NOT_FOUND" });
  });
  it("orders latest by observed time and resolves equal-millisecond ties with createdAt then UUID", async () => {
    const target = await item();
    const newer = await service().addManualValuation(target.id, {
      amountMinor: 200n,
      currency: "EUR",
      observedAt: "2025-01-02T00:00:00.000Z",
    });
    await service().addManualValuation(target.id, {
      amountMinor: 100n,
      currency: "EUR",
      observedAt: "2025-01-01T00:00:00.000Z",
    });
    expect((await service().latestManualValuation(target.id))!.id).toBe(newer.id);
    const createdAt = new Date("2025-02-01T00:00:00.000Z");
    const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"];
    for (const id of ids)
      await db!
        .$queryRaw`INSERT INTO "Valuation" (id,"itemId","ownerId","actorUserId","amountMinor",currency,"minorUnitExponent","observedAt","createdAt") VALUES (${id}::uuid,${target.id}::uuid,${ownerId},${ownerId},300,'EUR',2,${createdAt.toISOString()}::timestamptz,${createdAt.toISOString()}::timestamptz) RETURNING id`;
    const latest = await service().latestManualValuation(target.id);
    expect(latest!.id).toBe(ids[1]);
    expect(latest!.observedAt.toISOString()).toBe("2025-02-01T00:00:00.000Z");
    const first = await service().listManualValuations(target.id, { limit: 1 });
    expect(first.records.map((r: { id: string }) => r.id)).toEqual([ids[1]]);
    const second = await service().listManualValuations(target.id, {
      limit: 1,
      cursor: first.nextCursor,
    });
    expect(second.records.map((r: { id: string }) => r.id)).toEqual([ids[0]]);
    const rest = await service().listManualValuations(target.id, {
      limit: 2,
      cursor: second.nextCursor,
    });
    expect(rest.records.map((r: { amountMinor: bigint }) => r.amountMinor)).toEqual([200n, 100n]);
    expect(rest.nextCursor).toBeNull();
  });
  it("bounds pages and validates strict cursor/time/input without caller-authored identity", async () => {
    const target = await item();
    const base = { amountMinor: 1n, currency: "EUR" };
    for (const patch of [
      { amountMinor: -1n },
      { amountMinor: 9223372036854775808n },
      { amountMinor: 1 },
      { amountMinor: "1" },
      { currency: "eur" },
      { currency: "XAU" },
      { currency: "ZZZ" },
      { minorUnitExponent: 4 },
      { actorUserId: foreignId },
      { ownerId: foreignId },
      { type: "MANUAL" },
      { basis: "PER_UNIT" },
      { observedAt: "9999-12-31T23:59:59.999Z" },
      { observedAt: "2025-02-30T00:00:00.000Z" },
      { observedAt: "2025-01-01T00:00:00Z" },
      { observedAt: "2025-01-01T01:00:00.000+01:00" },
      { observedAt: "0000-01-01T00:00:00.000Z" },
      { observedAt: new Date() },
      { note: "a\0b" },
      { note: "a".repeat(2001) },
      { note: 4 },
    ])
      await expect(
        service().addManualValuation(target.id, { ...base, ...patch }),
      ).rejects.toMatchObject({ code: "VALUATION_INVALID" });
    for (const options of [
      { limit: 0 },
      { limit: 101 },
      { limit: 1.5 },
      { x: 1 },
      { cursor: { id: "bad", observedAt: "bad", createdAt: "bad" } },
    ])
      await expect(service().listManualValuations(target.id, options)).rejects.toMatchObject({
        code: "VALUATION_INVALID",
      });
    await expect(service().addManualValuation("not-uuid", base)).rejects.toMatchObject({
      code: "VALUATION_INVALID",
    });
    const max = await service().addManualValuation(target.id, {
      amountMinor: 9223372036854775807n,
      currency: "CLF",
      note: "a".repeat(2000),
      observedAt: "0001-01-01T00:00:00.000Z",
    });
    expect(max.observedAt.toISOString()).toBe("0001-01-01T00:00:00.000Z");
    expect(max).toMatchObject({ amountMinor: 9223372036854775807n, minorUnitExponent: 4 });
    expect(
      (await service().addManualValuation(target.id, { ...base, note: "   " })).note,
    ).toBeNull();
    for (let i = 0; i < 100; i++) await service().addManualValuation(target.id, base);
    expect((await service().listManualValuations(target.id)).records).toHaveLength(50);
    expect((await service().listManualValuations(target.id, { limit: 100 })).records).toHaveLength(
      100,
    );
  });
  it("hides foreign/deleted rows but permits inactive reads and retains soft-deleted history", async () => {
    for (const lifecycle of ["archived", "disposed", "deleted"] as const) {
      const target = await item();
      const row = await service().addManualValuation(target.id, {
        amountMinor: 1n,
        currency: "EUR",
      });
      await expect(
        createValuationService(db!, foreignId).listManualValuations(target.id),
      ).rejects.toMatchObject({ code: "ITEM_NOT_FOUND" });
      await expect(
        createValuationService(db!, foreignId).addManualValuation(target.id, {
          amountMinor: 1n,
          currency: "EUR",
        }),
      ).rejects.toMatchObject({ code: "ITEM_NOT_FOUND" });
      if (lifecycle === "archived") await createItemService(db!, ownerId).archiveItem(target.id);
      if (lifecycle === "disposed")
        await createItemService(db!, ownerId).updateItem(target.id, {
          disposedAt: new Date().toISOString(),
        });
      if (lifecycle === "deleted") await createItemService(db!, ownerId).deleteItem(target.id);
      await expect(
        service().addManualValuation(target.id, { amountMinor: 1n, currency: "EUR" }),
      ).rejects.toMatchObject({
        code: lifecycle === "deleted" ? "ITEM_NOT_FOUND" : "ITEM_INACTIVE",
      });
      if (lifecycle === "deleted")
        await expect(service().latestManualValuation(target.id)).rejects.toMatchObject({
          code: "ITEM_NOT_FOUND",
        });
      else expect((await service().latestManualValuation(target.id))!.id).toBe(row.id);
      expect(await db!.valuation.count({ where: { itemId: target.id } })).toBe(1);
      await db!.collectibleItem.delete({ where: { id: target.id } });
      expect(await db!.valuation.count({ where: { itemId: target.id } })).toBe(0);
    }
    const parent = await db!.collection.create({
      data: { ownerId, name: "Deleted valuation parent" },
    });
    const target = await createItemService(db!, ownerId).createItem({
      collectionId: parent.id,
      title: "Hidden",
    });
    await service().addManualValuation(target.id, { amountMinor: 1n, currency: "EUR" });
    await createCollectionService(db!, ownerId).deleteCollection(parent.id);
    await expect(service().listManualValuations(target.id)).rejects.toMatchObject({
      code: "ITEM_NOT_FOUND",
    });
    await expect(
      service().addManualValuation(target.id, { amountMinor: 1n, currency: "EUR" }),
    ).rejects.toMatchObject({ code: "ITEM_NOT_FOUND" });
    expect(await db!.valuation.count({ where: { itemId: target.id } })).toBe(1);
  });
  it("keeps per-unit history through actual quantity changes and leaves a split unauthored", async () => {
    const target = await item(3);
    const row = await service().addManualValuation(target.id, {
      amountMinor: 12345n,
      currency: "EUR",
    });
    await createItemService(db!, ownerId).updateItem(target.id, { quantity: 5 });
    const split = await createItemService(db!, ownerId).splitQuantityItem(target.id, 2);
    expect(split.source.quantity).toBe(3);
    expect(split.created.quantity).toBe(2);
    expect(await service().latestManualValuation(split.source.id)).toEqual(row);
    expect(await service().latestManualValuation(split.created.id)).toBeNull();
  });
  it("enforces native ownership, actor, basis, amount, scale, note and finite timestamp guards", async () => {
    const target = await item();
    const base = {
      itemId: target.id,
      ownerId,
      actorUserId: ownerId,
      amountMinor: 1n,
      currency: "EUR",
      minorUnitExponent: 2,
      observedAt: new Date("2025-01-01T00:00:00.000Z"),
    };
    for (const patch of [
      { ownerId: foreignId },
      { actorUserId: foreignId },
      { amountMinor: -1n },
      { currency: "eur" },
      { currency: "XXX" },
      { minorUnitExponent: 3 },
      { basis: "TOTAL" },
      { note: " untrimmed " },
      { note: "a".repeat(2001) },
      { observedAt: new Date("2025-01-02T00:00:00.000Z"), createdAt: base.observedAt },
    ])
      await expect(db!.valuation.create({ data: { ...base, ...patch } })).rejects.toThrow();
    for (const timestamp of [
      "infinity",
      "-infinity",
      "10000-01-01 00:00:00+00",
      "0001-01-01 00:00:00 BC",
    ])
      await expect(
        db!
          .$queryRaw`INSERT INTO "Valuation" (id,"itemId","ownerId","actorUserId","amountMinor",currency,"minorUnitExponent","observedAt","createdAt") VALUES (${randomUUID()}::uuid,${target.id}::uuid,${ownerId},${ownerId},1,'EUR',2,${timestamp}::timestamptz,${timestamp}::timestamptz) RETURNING id`,
      ).rejects.toThrow();
    const row = await db!.valuation.create({ data: base });
    await expect(
      db!.valuation.update({ where: { id: row.id }, data: { amountMinor: 2n } }),
    ).rejects.toThrow();
    await expect(
      db!.valuation.update({ where: { id: row.id }, data: { amountMinor: 1n } }),
    ).rejects.toThrow();
    await db!.valuation.delete({ where: { id: row.id } });
    expect(await db!.valuation.count({ where: { itemId: target.id } })).toBe(0);
  });
  it("serializes the append quota and rejects the 10001st estimate without pruning", async () => {
    const target = await item();
    await db!
      .$executeRaw`INSERT INTO "Valuation" (id,"itemId","ownerId","actorUserId","amountMinor",currency,"minorUnitExponent","observedAt","createdAt") SELECT gen_random_uuid(),${target.id}::uuid,${ownerId},${ownerId},1,'EUR',2,'2025-01-01T00:00:00Z'::timestamptz,'2025-01-01T00:00:00Z'::timestamptz FROM generate_series(1,9999)`;
    const results = await Promise.allSettled([
      service().addManualValuation(target.id, { amountMinor: 2n, currency: "EUR" }),
      service().addManualValuation(target.id, { amountMinor: 3n, currency: "EUR" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "VALUATION_LIMIT_EXCEEDED" },
    });
    expect(await db!.valuation.count({ where: { itemId: target.id } })).toBe(10000);
  });
  it("uses UTC only inside its transaction and preserves canonical instants in non-UTC sessions", async () => {
    const target = await item();
    const zoned: ValuationDatabase = {
      $transaction: (work, options) =>
        db!.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT set_config('TimeZone','Europe/Berlin',true)`;
          const result = await work(tx);
          const [during] = await tx.$queryRaw<
            Array<{ zone: string }>
          >`SELECT current_setting('TimeZone') AS zone`;
          expect(during!.zone).toBe("UTC");
          return result;
        }, options),
    };
    const [before] = await db!.$queryRaw<
      Array<{ zone: string; pid: number }>
    >`SELECT current_setting('TimeZone') AS zone, pg_backend_pid() AS pid`;
    const row = await createValuationService(zoned, ownerId).addManualValuation(target.id, {
      amountMinor: 1n,
      currency: "EUR",
      observedAt: "0001-01-01T00:00:00.000Z",
    });
    expect(row.observedAt.toISOString()).toBe("0001-01-01T00:00:00.000Z");
    const [outside] = await db!.$queryRaw<
      Array<{ zone: string; pid: number }>
    >`SELECT current_setting('TimeZone') AS zone, pg_backend_pid() AS pid`;
    expect(outside).toEqual(before);
    expect(
      (await createValuationService(zoned, ownerId).latestManualValuation(
        target.id,
      ))!.observedAt.toISOString(),
    ).toBe("0001-01-01T00:00:00.000Z");
  });
  it.each(["quantity", "split", "archive", "dispose", "delete", "collection-delete"] as const)(
    "serializes actual %s mutation behind an append and captures clock after waiting",
    async (mutation) => {
      const parent = await db!.collection.create({
        data: { ownerId, name: "Valuation lock fixture" },
      });
      const target = await createItemService(db!, ownerId).createItem({
        collectionId: parent.id,
        title: "Race",
        quantity: 3,
      });
      const gate = pausedValuations("FOR UPDATE OF item");
      const append = createValuationService(gate.database, ownerId).addManualValuation(target.id, {
        amountMinor: 123n,
        currency: "EUR",
      });
      await gate.reached;
      const items = createItemService(db!, ownerId);
      const operation =
        mutation === "quantity"
          ? items.updateItem(target.id, { quantity: 4 })
          : mutation === "split"
            ? items.splitQuantityItem(target.id, 1)
            : mutation === "archive"
              ? items.archiveItem(target.id)
              : mutation === "dispose"
                ? items.updateItem(target.id, { disposedAt: new Date().toISOString() })
                : mutation === "delete"
                  ? items.deleteItem(target.id)
                  : createCollectionService(db!, ownerId).deleteCollection(parent.id);
      const settled = operation.then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      let earliest: number;
      try {
        await expectDatabaseWait(
          mutation === "collection-delete" ? "Collection" : "CollectibleItem",
        );
        earliest = Date.now();
      } finally {
        gate.release();
      }
      const row = await append;
      expect(row.createdAt.getTime()).toBeGreaterThanOrEqual(earliest!);
      expect(row.observedAt).toEqual(row.createdAt);
      expect(await settled).not.toHaveProperty("error");
      expect(await db!.valuation.count({ where: { itemId: target.id } })).toBe(1);
      if (mutation === "quantity")
        expect(
          (await db!.collectibleItem.findUniqueOrThrow({ where: { id: target.id } })).quantity,
        ).toBe(4);
      if (mutation === "split") {
        const result = (await operation) as { created: { id: string } };
        expect(await service().latestManualValuation(result.created.id)).toBeNull();
      }
    },
  );
  it("revalidates the live parent after actual collection deletion wins the parent lock", async () => {
    const parent = await db!.collection.create({ data: { ownerId, name: "Parent deletion wins" } });
    const target = await createItemService(db!, ownerId).createItem({
      collectionId: parent.id,
      title: "Parent race",
    });
    let release!: () => void;
    let reached!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const wrapped: CollectionDatabase = {
      collection: db!.collection,
      $queryRaw: db!.$queryRaw.bind(db!),
      $transaction: (work, options) =>
        db!.$transaction(
          (tx) =>
            work({
              collectionNode: tx.collectionNode,
              async $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T> {
                const result = await tx.$queryRaw<T>(query, ...values);
                if (query.join("").includes('UPDATE "Collection"')) {
                  reached();
                  await held;
                }
                return result;
              },
            }),
          options,
        ),
    };
    const deletion = createCollectionService(wrapped, ownerId).deleteCollection(parent.id);
    await locked;
    const append = service()
      .addManualValuation(target.id, { amountMinor: 1n, currency: "EUR" })
      .then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
    try {
      await expectDatabaseWait("Collection");
    } finally {
      release();
    }
    await deletion;
    expect(await append).toMatchObject({ error: { code: "ITEM_NOT_FOUND" } });
    expect(await db!.valuation.count({ where: { itemId: target.id } })).toBe(0);
  });
  it("revalidates item lifecycle after a committed archive wins the item lock", async () => {
    const target = await item();
    let release!: () => void;
    let reached!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const archive = db!.$transaction(async (tx) => {
      await tx.collectibleItem.update({
        where: { id: target.id },
        data: { archivedAt: new Date() },
      });
      reached();
      await held;
    });
    await locked;
    const append = service()
      .addManualValuation(target.id, { amountMinor: 1n, currency: "EUR" })
      .then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
    try {
      await expectDatabaseWait("CollectibleItem");
    } finally {
      release();
    }
    await archive;
    expect(await append).toMatchObject({ error: { code: "ITEM_INACTIVE" } });
  });

  it("omits private valuation facts from the actual public item projection", async () => {
    const parent = await db!.collection.create({
      data: { ownerId, name: "Public valuation fixture", visibility: "PUBLIC" },
    });
    const target = await createItemService(db!, ownerId).createItem({
      collectionId: parent.id,
      title: "Public item",
      visibility: "PUBLIC",
    });
    await service().addManualValuation(target.id, {
      amountMinor: 9007199254740993n,
      currency: "EUR",
      note: "Private valuation",
    });
    expect(await createItemQuery(db!).getPublicItem(target.id)).toEqual({
      id: target.id,
      title: "Public item",
      publicDescription: null,
      quantity: 1,
      tradeStatus: "NOT_FOR_TRADE",
    });
  });
});

function pausedValuations(match: string) {
  let release!: () => void;
  let reached!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const locked = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const database: ValuationDatabase = {
    $transaction: (work, options) =>
      db!.$transaction(
        (tx) =>
          work({
            async $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T> {
              const result = await tx.$queryRaw<T>(query, ...values);
              if (query.join("").includes(match)) {
                reached();
                await held;
              }
              return result;
            },
          }),
        options,
      ),
  };
  return { database, reached: locked, release: () => release() };
}
async function expectDatabaseWait(table: string) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const [row] = await db!.$queryRaw<
      Array<{ waiting: boolean }>
    >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE ${`%${table}%`}) AS waiting`;
    if (row!.waiting) return;
  }
  throw new Error("Expected PostgreSQL to observe a blocked lock");
}
