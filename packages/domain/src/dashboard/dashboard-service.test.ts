import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createValuationService } from "../valuations/valuation-service";
import { Prisma } from "@sammlerraum/db/search-sql";
import { createItemService } from "../items/item-service";
import { createItemSearchService } from "../search/item-search-service";
import type { SearchDatabase } from "../search/search-read";
import { createDashboardService } from "./dashboard-service";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const owner = `dashboard_${randomUUID()}`,
  foreign = `dashboard_${randomUUID()}`;
let collection: string;
const actor = { userId: owner };
describe.runIf(enabled)("owned dashboard PostgreSQL", () => {
  beforeAll(async () => {
    await db!.user.createMany({
      data: [owner, foreign].map((id) => ({
        id,
        name: "Dashboard",
        email: `${id}@example.invalid`,
      })),
    });
    collection = (await db!.collection.create({ data: { ownerId: owner, name: "Selected" } })).id;
    await db!.collection.create({ data: { ownerId: owner, name: "Empty" } });
    const other = await db!.collection.create({ data: { ownerId: foreign, name: "Foreign" } });
    for (const [title, quantity, currency, amount] of [
      ["EUR", 3, "EUR", 100n],
      ["USD", 2, "USD", 250n],
      ["Missing", 4, null, null],
    ] as const) {
      const item = await db!.collectibleItem.create({
        data: { ownerId: owner, collectionId: collection, title, quantity },
      });
      if (currency)
        await createValuationService(db!, owner).addManualValuation(item.id, {
          currency,
          amountMinor: amount,
        });
    }
    const hidden = await db!.collectibleItem.create({
      data: {
        ownerId: foreign,
        collectionId: other.id,
        title: "Foreign public",
        visibility: "PUBLIC",
        quantity: 100,
      },
    });
    await createValuationService(db!, foreign).addManualValuation(hidden.id, {
      currency: "EUR",
      amountMinor: 9999n,
    });
  });
  afterAll(async () => {
    await db?.user.deleteMany({ where: { id: { in: [owner, foreign] } } });
    await db?.$disconnect();
  });
  it("weights latest own estimates without leaking foreign money and includes empty owned collections", async () => {
    const data = await createDashboardService(db!).getDashboard(actor, {});
    expect(data).toMatchObject({
      selection: { itemCount: 3, unitCount: "9", matchedCollectionCount: 1 },
      collections: { ownedLiveCount: 2 },
      manualValues: {
        state: "PARTIAL",
        missing: { itemCount: 1, unitCount: "4" },
        groups: [
          { currency: "EUR", minorUnitExponent: 2, totalMinor: "300" },
          { currency: "USD", minorUnitExponent: 2, totalMinor: "500" },
        ],
      },
    });
  });
});

async function fixture(
  work: (f: {
    owner: string;
    collection: string;
    item: (title: string, quantity?: number) => Promise<{ id: string }>;
    read: (input?: object) => ReturnType<ReturnType<typeof createDashboardService>["getDashboard"]>;
  }) => Promise<void>,
) {
  const owner = `dash_case_${randomUUID()}`;
  await db!.user.create({ data: { id: owner, name: "Case", email: `${owner}@example.invalid` } });
  try {
    const collection = (await db!.collection.create({ data: { ownerId: owner, name: "Case" } })).id;
    await work({
      owner,
      collection,
      item: (title, quantity = 1) =>
        db!.collectibleItem.create({
          data: { ownerId: owner, collectionId: collection, title, quantity },
        }),
      read: (input = {}) => createDashboardService(db!).getDashboard({ userId: owner }, input),
    });
  } finally {
    await db!.collectibleItem.deleteMany({ where: { ownerId: owner } });
    await db!.mediaAsset.deleteMany({ where: { ownerId: owner } });
    await db!.user.delete({ where: { id: owner } });
  }
}
describe.runIf(enabled)("dashboard actual observations and filters", () => {
  it.each([
    ["unsupported latest currency", "v.currency,", "'ZZZ'::text AS currency,"],
    ["mismatched latest exponent", 'v."minorUnitExponent" AS exponent', "9 AS exponent"],
    [
      "unsupported immediate prior currency",
      "p.currency AS previous_currency",
      "'ZZZ'::text AS previous_currency",
    ],
    [
      "mismatched immediate prior exponent",
      'p."minorUnitExponent" AS previous_exponent',
      "9 AS previous_exponent",
    ],
  ])(
    "rejects %s before returning monetary groups or noncomparable history",
    async (_label, from, to) =>
      fixture(async (f) => {
        const item = await f.item("Chosen denomination integrity", 2);
        const service = createValuationService(db!, f.owner);
        for (const observedAt of ["2025-01-01", "2025-02-01", "2025-03-01"])
          await service.addManualValuation(item.id, {
            amountMinor: 100n,
            currency: "EUR",
            observedAt: new Date(observedAt).toISOString(),
          });
        let interceptions = 0;
        let manualRows: unknown;
        const wrapped: SearchDatabase = {
          $transaction: (work, options) =>
            db!.$transaction(
              (tx) =>
                work({
                  $queryRaw: async <T>(sql: Prisma.Sql) => {
                    if (!sql.text.includes("dashboard:manual")) return tx.$queryRaw<T>(sql);
                    // Simulate corrupt selected points only; execute the rest of the actual query natively.
                    // Native constraints remain enabled, and stored producer-written rows remain valid.
                    const strings = sql.strings.map((part) => part.replace(from!, to!));
                    expect(strings.join("")).not.toBe(sql.strings.join(""));
                    interceptions++;
                    const rows = await tx.$queryRaw<T>(Prisma.sql(strings, ...sql.values));
                    manualRows = rows;
                    return rows;
                  },
                }),
              options,
            ),
        };
        await expect(
          createDashboardService(wrapped).getDashboard({ userId: f.owner }, {}),
        ).rejects.toMatchObject({ code: "SEARCH_INVARIANT" });
        expect(interceptions).toBe(1);
        expect(manualRows).toEqual([{ denominationsValid: false, overflow: false, data: null }]);
        expect(await f.read()).toMatchObject({
          manualValues: { groups: [{ currency: "EUR", minorUnitExponent: 2, totalMinor: "200" }] },
          manualChange: { state: "COMPLETE", groups: [{ deltaMinor: "0" }] },
        });
      }),
  );

  it("selects latest before denomination and never turns absent or incomparable history into zero", async () =>
    fixture(async (f) => {
      const a = await f.item("Changed", 3),
        b = await f.item("Switched", 2),
        c = await f.item("Single"),
        d = await f.item("Absent");
      const svc = createValuationService(db!, f.owner);
      for (const [id, amount, currency, time] of [
        [a.id, 200n, "EUR", "2025-01-01"],
        [a.id, 150n, "EUR", "2025-02-01"],
        [b.id, 900n, "EUR", "2025-01-01"],
        [b.id, 0n, "USD", "2025-02-01"],
        [c.id, 0n, "EUR", "2025-02-01"],
      ] as const)
        await svc.addManualValuation(id, {
          amountMinor: amount,
          currency,
          observedAt: `${time}T00:00:00.000Z`,
        });
      const data = await f.read();
      expect(data).toMatchObject({
        manualValues: {
          state: "PARTIAL",
          missing: { itemCount: 1, unitCount: "1" },
          groups: [
            {
              currency: "EUR",
              totalMinor: "450",
              contributors: { itemCount: 2, unitCount: "4" },
              otherDenomination: { itemCount: 1, unitCount: "2" },
            },
            { currency: "USD", totalMinor: "0" },
          ],
        },
        manualChange: {
          state: "PARTIAL",
          comparable: { itemCount: 1, unitCount: "3" },
          excluded: {
            NO_ESTIMATE: { itemCount: 1, unitCount: "1" },
            INSUFFICIENT_HISTORY: { itemCount: 1, unitCount: "1" },
            NONCOMPARABLE_DENOMINATION: { itemCount: 1, unitCount: "2" },
          },
          groups: [{ currency: "EUR", deltaMinor: "-150" }],
        },
      });
      expect(data).toMatchObject({
        manualChange: { mode: "LATEST_VS_PREVIOUS_OBSERVATION", quantityBasis: "CURRENT_QUANTITY" },
      });
    }));
  it("requires distinct observation times and uses exact large current-quantity sums", async () =>
    fixture(async (f) => {
      const a = await f.item("Large", 2147483647),
        b = await f.item("Same time");
      const svc = createValuationService(db!, f.owner);
      for (const [id, amount, time] of [
        [a.id, 9007199254740991n, "2025-01-01"],
        [a.id, 9007199254740991n, "2025-02-01"],
      ] as const)
        await svc.addManualValuation(id, {
          amountMinor: amount,
          currency: "EUR",
          observedAt: `${time}T00:00:00.000Z`,
        });
      await db!.valuation.createMany({
        data: [1, 2].map((n) => ({
          itemId: b.id,
          ownerId: f.owner,
          actorUserId: f.owner,
          amountMinor: BigInt(n),
          currency: "EUR",
          minorUnitExponent: 2,
          observedAt: new Date("2025-02-01T00:00:00.000Z"),
          createdAt: new Date(`2025-02-0${n}T00:00:00.000Z`),
        })),
      });
      const data = await f.read();
      expect(data).toMatchObject({
        selection: { unitCount: "2147483648" },
        manualChange: {
          state: "PARTIAL",
          comparable: { itemCount: 1, unitCount: "2147483647" },
          groups: [{ deltaMinor: "0" }],
        },
      });
      expect(data).toMatchObject({
        manualValues: {
          groups: [{ totalMinor: (9007199254740991n * 2147483647n + 2n).toString() }],
        },
      });
    }));
  it("uses disjoint lifecycles and excludes deleted parents while keeping collection counts independent", async () =>
    fixture(async (f) => {
      const active = await f.item("Active", 3),
        archived = await f.item("Archived", 4),
        disposed = await f.item("Disposed", 5),
        deleted = await f.item("Deleted", 7);
      await db!.collectibleItem.update({
        where: { id: archived.id },
        data: { archivedAt: new Date() },
      });
      await db!.collectibleItem.update({
        where: { id: disposed.id },
        data: { archivedAt: new Date(), disposedAt: new Date() },
      });
      await db!.collectibleItem.update({
        where: { id: deleted.id },
        data: { deletedAt: new Date() },
      });
      const parent = await db!.collection.create({
        data: { ownerId: f.owner, name: "Removed", deletedAt: new Date() },
      });
      await db!.collectibleItem.create({
        data: { ownerId: f.owner, collectionId: parent.id, title: "Hidden", quantity: 99 },
      });
      for (const [lifecycle, count, units] of [
        ["ACTIVE", 1, "3"],
        ["ARCHIVED", 1, "4"],
        ["DISPOSED", 1, "5"],
        ["ALL", 3, "12"],
      ] as const)
        expect(await f.read({ lifecycle })).toMatchObject({
          selection: { itemCount: count, unitCount: units },
          collections: { ownedLiveCount: 1 },
        });
      expect(await f.read({ text: "no match" })).toMatchObject({
        selection: { itemCount: 0, unitCount: "0", matchedCollectionCount: 0 },
        collections: { ownedLiveCount: 1 },
        manualValues: { state: "EMPTY", groups: [] },
        manualChange: { state: "EMPTY", groups: [] },
      });
      expect(await f.read()).toMatchObject({
        recentAdditions: { items: [{ id: active.id }] },
        manualValues: { state: "NO_ESTIMATES", groups: null },
        manualChange: { state: "INSUFFICIENT_DATA", groups: null },
      });
    }));
  it("counts grading records separately, retains retired conditions and distinguishes usable media", async () =>
    fixture(async (f) => {
      const a = await f.item("Graded"),
        b = await f.item("Bare", 4);
      const category = await db!.categoryTemplate.create({ data: { key: `dash_${randomUUID()}` } });
      try {
        const scheme = await db!.conditionScheme.create({
          data: {
            categoryTemplateId: category.id,
            key: `dash_${randomUUID()}`,
            labelDe: "Zustand",
            labelEn: "Condition",
            active: false,
          },
        });
        const option = await db!.conditionOption.create({
          data: {
            schemeId: scheme.id,
            categoryTemplateId: category.id,
            labelKey: "old",
            labelDe: "Alt",
            labelEn: "Old",
            position: 0,
            active: false,
          },
        });
        await db!.collectibleItem.update({
          where: { id: a.id },
          data: {
            categoryTemplateId: category.id,
            conditionOptionId: option.id,
            tradeStatus: "FOR_SALE",
            purchaseAmountMinor: 0n,
            purchaseCurrency: "EUR",
          },
        });
        await db!.collectibleItem.update({
          where: { id: b.id },
          data: { tradeStatus: "RESERVED" },
        });
        for (const provider of ["PSA", "CGC"])
          await db!.grading.create({
            data: {
              itemId: a.id,
              ownerId: f.owner,
              provider,
              providerKey: provider.toLowerCase(),
              grade: "10",
            },
          });
        const asset = await db!.mediaAsset.create({
          data: {
            ownerId: f.owner,
            kind: "IMAGE",
            status: "READY",
            storageKey: `test/${randomUUID()}`,
            mimeType: "image/png",
            byteSize: 10n,
            checksumSha256: "a".repeat(64),
            originalFileName: "test.png",
          },
        });
        await db!.mediaLink.create({
          data: { itemId: a.id, ownerId: f.owner, assetId: asset.id, position: 0 },
        });
        expect(await f.read()).toMatchObject({
          grading: {
            gradedItemCount: 1,
            gradingRecordCount: 2,
            groups: [
              { providerKey: "cgc", recordCount: 1, itemCount: 1 },
              { providerKey: "psa", recordCount: 1, itemCount: 1 },
            ],
          },
          condition: {
            missing: { itemCount: 1, unitCount: "4" },
            groups: [{ conditionOptionId: option.id, itemCount: 1, unitCount: "1" }],
          },
          tradeReady: { itemCount: 1, unitCount: "1" },
          missing: {
            image: { itemCount: 1, unitCount: "4" },
            purchaseAmount: { itemCount: 1, unitCount: "4" },
          },
        });
        await db!.mediaAsset.update({
          where: { id: asset.id },
          data: { cleanupStartedAt: new Date() },
        });
        expect(await f.read()).toMatchObject({
          missing: { image: { itemCount: 2, unitCount: "5" } },
        });
      } finally {
        await db!.collectibleItem.updateMany({
          where: { ownerId: f.owner },
          data: { conditionOptionId: null, categoryTemplateId: null },
        });
        await db!.conditionOption.deleteMany({ where: { categoryTemplateId: category.id } });
        await db!.conditionScheme.deleteMany({ where: { categoryTemplateId: category.id } });
        await db!.categoryTemplate.delete({ where: { id: category.id } });
      }
    }));
  it("keeps unavailable producer metrics explicit and rejects unsupported leaves even for empty matches", async () =>
    fixture(async (f) => {
      expect(await f.read()).toMatchObject({
        purchaseTotals: { state: "UNAVAILABLE", groups: null },
        marketValues: { state: "UNAVAILABLE", groups: null },
        duplicates: { state: "UNAVAILABLE", count: null },
        wishlist: { state: "UNAVAILABLE", count: null },
      });
      await expect(
        f.read({
          text: "nothing",
          filter: { version: 1, root: { kind: "not", child: { kind: "duplicate", value: true } } },
        }),
      ).rejects.toMatchObject({ code: "FILTER_UNAVAILABLE" });
      await expect(
        f.read({
          filter: {
            version: 1,
            root: { kind: "collection", test: { op: "eq", value: randomUUID() } },
          },
        }),
      ).rejects.toMatchObject({ code: "FILTER_REFERENCE_INVALID" });
    }));
});

describe.runIf(enabled)("dashboard bounded sets and consistency", () => {
  it("matches actual search selection and does not use a limited page as inventory", async () =>
    fixture(async (f) => {
      await db!.collectibleItem.createMany({
        data: Array.from({ length: 21 }, (_, n) => ({
          ownerId: f.owner,
          collectionId: f.collection,
          title: n % 2 ? "Watch" : "Coin",
          quantity: n + 1,
        })),
      });
      const query = {
        text: "Watch",
        filter: {
          version: 1,
          root: {
            kind: "not",
            child: { kind: "tradeStatus", test: { op: "eq", value: "FOR_SALE" } },
          },
        },
      };
      const search = await createItemSearchService(db!).searchItems(
        { userId: f.owner },
        { ...query, limit: 1 },
      );
      const dashboard = await f.read(query);
      expect(search.total).toBe(10);
      expect(dashboard.selection.itemCount).toBe(search.total);
      expect(dashboard.selection.unitCount).toBe("110");
    }));
  it("caps per-denomination value rankings and recency with stable ties", async () =>
    fixture(async (f) => {
      const instant = new Date("2025-01-01T00:00:00.000Z");
      const ids = Array.from({ length: 12 }, () => randomUUID()).sort();
      await db!.collectibleItem.createMany({
        data: ids.map((id) => ({
          id,
          ownerId: f.owner,
          collectionId: f.collection,
          title: "Tied",
          createdAt: instant,
        })),
      });
      await db!.valuation.createMany({
        data: ids.map((id) => ({
          itemId: id,
          ownerId: f.owner,
          actorUserId: f.owner,
          amountMinor: 10n,
          currency: "EUR",
          minorUnitExponent: 2,
          observedAt: instant,
          createdAt: instant,
        })),
      });
      const result = await f.read();
      expect(result.manualValues.groups![0]!.topItems).toMatchObject({
        eligibleCount: 12,
        hasMore: true,
        limit: 10,
      });
      expect(result.manualValues.groups![0]!.topItems.items.map((x) => x.id)).toEqual(
        ids.toReversed().slice(0, 10),
      );
      expect(result.recentAdditions.items.map((x) => x.id)).toEqual(ids.toReversed().slice(0, 10));
      expect(result.recentAdditions).toMatchObject({ eligibleCount: 12, hasMore: true });
    }));
  it("uses createdAt then id to resolve equal observed times and does not copy history on a real split", async () =>
    fixture(async (f) => {
      const item = await f.item("Split", 4),
        instant = new Date("2025-01-01T00:00:00.000Z");
      const ids = [randomUUID(), randomUUID()].sort();
      await db!.valuation.createMany({
        data: ids.map((id, n) => ({
          id,
          itemId: item.id,
          ownerId: f.owner,
          actorUserId: f.owner,
          amountMinor: BigInt(n + 1),
          currency: "EUR",
          minorUnitExponent: 2,
          observedAt: instant,
          createdAt: instant,
        })),
      });
      expect(await f.read()).toMatchObject({
        manualValues: { groups: [{ totalMinor: "8" }] },
        manualChange: { state: "INSUFFICIENT_DATA" },
      });
      await createItemService(db!, f.owner).splitQuantityItem(item.id, 1);
      expect(await f.read()).toMatchObject({
        selection: { itemCount: 2, unitCount: "4" },
        manualValues: {
          state: "PARTIAL",
          missing: { itemCount: 1, unitCount: "1" },
          groups: [{ totalMinor: "6" }],
        },
      });
    }));
  it("holds one snapshot through summary, values and rankings and next read sees changes", async () =>
    fixture(async (f) => {
      const item = await f.item("Snapshot", 2);
      await createValuationService(db!, f.owner).addManualValuation(item.id, {
        amountMinor: 100n,
        currency: "EUR",
      });
      let changed = false;
      const wrapped: SearchDatabase = {
        $transaction: (work, options) =>
          db!.$transaction(
            (tx) =>
              work({
                $queryRaw: async <T>(sql: Prisma.Sql) => {
                  const rows = await tx.$queryRaw<T>(sql);
                  if (sql.text.includes("dashboard:summary") && !changed) {
                    changed = true;
                    await db!.collectibleItem.update({
                      where: { id: item.id },
                      data: { quantity: 3 },
                    });
                    await createValuationService(db!, f.owner).addManualValuation(item.id, {
                      amountMinor: 200n,
                      currency: "EUR",
                    });
                    await db!.collection.update({
                      where: { id: f.collection },
                      data: { name: "Renamed" },
                    });
                  }
                  return rows;
                },
              }),
            options,
          ),
      };
      expect(
        await createDashboardService(wrapped).getDashboard({ userId: f.owner }, {}),
      ).toMatchObject({
        selection: { unitCount: "2" },
        manualValues: { groups: [{ totalMinor: "200" }] },
        topCollections: { items: [{ name: "Case", unitCount: "2" }] },
      });
      expect(await f.read()).toMatchObject({
        selection: { unitCount: "3" },
        manualValues: { groups: [{ totalMinor: "600" }] },
        topCollections: { items: [{ name: "Renamed" }] },
      });
    }));
  it("returns all 128 grading groups and rejects 129 instead of truncating", async () =>
    fixture(async (f) => {
      const item = await f.item("Many grades");
      await db!.grading.createMany({
        data: Array.from({ length: 128 }, (_, n) => ({
          itemId: item.id,
          ownerId: f.owner,
          provider: `P${n}`,
          providerKey: `p${n}`,
          grade: "10",
        })),
      });
      const data = await f.read();
      expect(data.grading.groups).toHaveLength(128);
      expect(data.grading.gradedItemCount).toBe(1);
      expect(data.grading.gradingRecordCount).toBe(128);
      await db!.grading.create({
        data: {
          itemId: item.id,
          ownerId: f.owner,
          provider: "extra",
          providerKey: "extra",
          grade: "10",
        },
      });
      let transferred: unknown;
      const wrapped: SearchDatabase = {
        $transaction: (work, options) =>
          db!.$transaction(
            (tx) =>
              work({
                $queryRaw: async <T>(sql: Prisma.Sql) => {
                  const rows = await tx.$queryRaw<T>(sql);
                  if (sql.text.includes("dashboard:distributions")) transferred = rows;
                  return rows;
                },
              }),
            options,
          ),
      };
      await expect(
        createDashboardService(wrapped).getDashboard({ userId: f.owner }, {}),
      ).rejects.toMatchObject({ code: "SEARCH_UNAVAILABLE" });
      expect(transferred).toEqual([{ overflow: true, data: null }]);
    }));
  it("returns all 128 condition groups and rejects 129 before group transfer", async () =>
    fixture(async (f) => {
      const categories = await Promise.all(
        [0, 1].map((n) =>
          db!.categoryTemplate.create({ data: { key: `dash_cap_${n}_${randomUUID()}` } }),
        ),
      );
      try {
        const schemes = await Promise.all(
          categories.map((c) =>
            db!.conditionScheme.create({
              data: {
                categoryTemplateId: c.id,
                key: `dash_cap_${randomUUID()}`,
                labelDe: "Z",
                labelEn: "C",
              },
            }),
          ),
        );
        const options = Array.from({ length: 129 }, (_, n) => ({
          id: randomUUID(),
          schemeId: schemes[n % 2]!.id,
          categoryTemplateId: categories[n % 2]!.id,
          labelKey: `p${n}`,
          labelDe: `Z${n}`,
          labelEn: `C${n}`,
          position: Math.floor(n / 2),
        }));
        await db!.conditionOption.createMany({ data: options });
        await db!.collectibleItem.createMany({
          data: options.slice(0, 128).map((o) => ({
            ownerId: f.owner,
            collectionId: f.collection,
            title: "Condition",
            categoryTemplateId: o.categoryTemplateId,
            conditionOptionId: o.id,
          })),
        });
        expect((await f.read()).condition.groups).toHaveLength(128);
        await db!.collectibleItem.create({
          data: {
            ownerId: f.owner,
            collectionId: f.collection,
            title: "Overflow",
            categoryTemplateId: options[128]!.categoryTemplateId,
            conditionOptionId: options[128]!.id,
          },
        });
        await expect(f.read()).rejects.toMatchObject({ code: "SEARCH_UNAVAILABLE" });
      } finally {
        await db!.collectibleItem.deleteMany({ where: { ownerId: f.owner } });
        const ids = categories.map((c) => c.id);
        await db!.conditionOption.deleteMany({ where: { categoryTemplateId: { in: ids } } });
        await db!.conditionScheme.deleteMany({ where: { categoryTemplateId: { in: ids } } });
        await db!.categoryTemplate.deleteMany({ where: { id: { in: ids } } });
      }
    }));
  it(
    "settles a real dashboard SQL timeout with closed installed-driver mapping",
    async () =>
      fixture(async (f) => {
        let captured: unknown;
        const wrapped: SearchDatabase = {
          $transaction: (work, options) =>
            db!.$transaction(
              (tx) =>
                work({
                  $queryRaw: async <T>(sql: Prisma.Sql) => {
                    try {
                      return await tx.$queryRaw<T>(
                        sql.text.includes("dashboard:manual")
                          ? Prisma.sql`SELECT pg_sleep(3)`
                          : sql,
                      );
                    } catch (error) {
                      captured = error;
                      throw error;
                    }
                  },
                }),
              options,
            ),
        };
        const started = performance.now();
        await expect(
          createDashboardService(wrapped).getDashboard({ userId: f.owner }, {}),
        ).rejects.toMatchObject({ code: "SEARCH_UNAVAILABLE" });
        expect(performance.now() - started).toBeLessThan(5000);
        const { errorCode } = await import("../api/read-dependency-errors");
        expect(errorCode(captured)).toBe("57014");
      }),
    7000,
  );
});

describe.runIf(enabled)("dashboard actual cost evidence", () => {
  it.each([1, 50, 500])(
    "keeps fixed query count and records real plans for %i owned rows",
    async (n) =>
      fixture(async (f) => {
        const ids = Array.from({ length: n }, () => randomUUID());
        await db!.collectibleItem.createMany({
          data: ids.map((id, index) => ({
            id,
            ownerId: f.owner,
            collectionId: f.collection,
            title: index % 10 ? "Other" : "Needle",
            quantity: index + 1,
          })),
        });
        const instant = new Date("2025-01-01T00:00:00.000Z");
        await db!.valuation.createMany({
          data: ids.map((id) => ({
            itemId: id,
            ownerId: f.owner,
            actorUserId: f.owner,
            amountMinor: 100n,
            currency: "EUR",
            minorUnitExponent: 2,
            observedAt: instant,
            createdAt: instant,
          })),
        });
        if (n === 500)
          await db!.valuation.createMany({
            data: Array.from({ length: 1000 }, (_, index) => ({
              itemId: ids[0]!,
              ownerId: f.owner,
              actorUserId: f.owner,
              amountMinor: BigInt(index),
              currency: "EUR",
              minorUnitExponent: 2,
              observedAt: new Date(instant.getTime() + index + 1),
              createdAt: new Date("2025-02-01T00:00:00.000Z"),
            })),
          });
        await db!.$executeRaw`ANALYZE "CollectibleItem"`;
        await db!.$executeRaw`ANALYZE "Valuation"`;
        let calls = 0;
        const queries: Prisma.Sql[] = [];
        const wrapped: SearchDatabase = {
          $transaction: (work, options) =>
            db!.$transaction(
              (tx) =>
                work({
                  $queryRaw: async <T>(sql: Prisma.Sql) => {
                    calls++;
                    if (sql.text.includes("dashboard:")) queries.push(sql);
                    return tx.$queryRaw<T>(sql);
                  },
                }),
              options,
            ),
        };
        const started = performance.now();
        const result = await createDashboardService(wrapped).getDashboard(
          { userId: f.owner },
          { text: "Needle" },
        );
        expect(result.selection.itemCount).toBe(Math.ceil(n / 10));
        expect(calls).toBe(15);
        expect(queries).toHaveLength(4);
        console.info(
          "dashboard measured query count",
          JSON.stringify({
            ownedRows: n,
            historyRows: n + (n === 500 ? 1000 : 0),
            selectedRows: result.selection.itemCount,
            queryCallsIncludingConfiguration: calls,
            elapsedMs: performance.now() - started,
          }),
        );
        for (const sql of queries) {
          const plan = await db!.$queryRaw(
            Prisma.sql`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${sql}`,
          );
          console.info(
            "dashboard actual plan",
            JSON.stringify({ ownedRows: n, query: sql.text.match(/dashboard:\w+/u)?.[0], plan }),
          );
        }
      }),
    20000,
  );
  it("uses the same bounded URL manifest and independent retained-fact guard", async () =>
    fixture(async (f) => {
      const a = await f.item("Match"),
        b = await f.item("Excluded");
      const definition = await db!.customFieldDefinition.create({
        data: {
          collectionId: f.collection,
          name: "URL",
          normalizedName: "url",
          type: "URL",
        },
      });
      for (const id of [a.id, b.id])
        await db!.customFieldValue.create({
          data: {
            itemId: id,
            collectionId: f.collection,
            fieldDefinitionId: definition.id,
            fieldType: "URL",
            urlValue: "https://example.invalid/path@ok",
          },
        });
      const filter = {
        version: 1,
        root: {
          kind: "customField",
          selector: { source: "CUSTOM", collectionId: f.collection, definitionId: definition.id },
          predicate: { valueType: "URL", test: { op: "present" } },
        },
      };
      let calls = 0;
      const wrapped: SearchDatabase = {
        $transaction: (work, options) =>
          db!.$transaction(
            (tx) =>
              work({
                $queryRaw: async <T>(sql: Prisma.Sql) => {
                  calls++;
                  return tx.$queryRaw<T>(sql);
                },
              }),
            options,
          ),
      };
      expect(
        (
          await createDashboardService(wrapped).getDashboard(
            { userId: f.owner },
            { text: "Match", filter },
          )
        ).selection.itemCount,
      ).toBe(1);
      expect(calls).toBe(17);
      await db!.customFieldValue.updateMany({
        where: { itemId: b.id },
        data: { urlValue: "https://user:password@example.invalid/" },
      });
      await expect(f.read({ text: "Match", filter })).rejects.toMatchObject({
        code: "SEARCH_INVARIANT",
      });
    }));
});

describe.runIf(enabled)("dashboard complete selected facts", () => {
  it.each(["IMAGE", "DOCUMENT"] as const)(
    "requires usable %s assets instead of a link or pending/failed asset",
    async (kind) =>
      fixture(async (f) => {
        const item = await f.item("Media", 2);
        const asset = await db!.mediaAsset.create({
          data: {
            ownerId: f.owner,
            kind,
            status: "READY",
            storageKey: `test/${randomUUID()}`,
            mimeType: kind === "IMAGE" ? "image/png" : "application/pdf",
            byteSize: 10n,
            checksumSha256: "a".repeat(64),
            originalFileName: "fixture",
          },
        });
        if (kind === "IMAGE")
          await db!.mediaLink.create({
            data: { itemId: item.id, ownerId: f.owner, assetId: asset.id, position: 0 },
          });
        else
          await db!.documentLink.create({
            data: { itemId: item.id, ownerId: f.owner, assetId: asset.id, position: 0 },
          });
        const key = kind === "IMAGE" ? "image" : "document";
        expect((await f.read()).missing[key]).toEqual({ itemCount: 0, unitCount: "0" });
        for (const status of ["PENDING", "FAILED"] as const) {
          await db!.mediaAsset.update({ where: { id: asset.id }, data: { status } });
          expect((await f.read()).missing[key]).toEqual({ itemCount: 1, unitCount: "2" });
        }
        await db!.mediaAsset.update({
          where: { id: asset.id },
          data: { status: "READY", cleanupStartedAt: new Date() },
        });
        expect((await f.read()).missing[key]).toEqual({ itemCount: 1, unitCount: "2" });
      }),
  );
  it("ranks largest selected collections by units then rows, retaining all live collection count", async () =>
    fixture(async (f) => {
      const second = await db!.collection.create({ data: { ownerId: f.owner, name: "More rows" } }),
        third = await db!.collection.create({ data: { ownerId: f.owner, name: "Largest" } });
      await db!.collection.create({ data: { ownerId: f.owner, name: "Empty" } });
      await f.item("Selected", 4);
      await db!.collectibleItem.createMany({
        data: [
          { ownerId: f.owner, collectionId: second.id, title: "Selected", quantity: 2 },
          { ownerId: f.owner, collectionId: second.id, title: "Selected", quantity: 2 },
          { ownerId: f.owner, collectionId: third.id, title: "Selected", quantity: 8 },
          { ownerId: f.owner, collectionId: f.collection, title: "Excluded", quantity: 100 },
        ],
      });
      const data = await f.read({ text: "Selected" });
      expect(data.collections.ownedLiveCount).toBe(4);
      expect(data.topCollections.items.map((x) => x.id)).toEqual([
        third.id,
        second.id,
        f.collection,
      ]);
      expect(data.selection).toEqual({ itemCount: 4, unitCount: "16", matchedCollectionCount: 3 });
    }));
  it("retains native currency scales and separates all authored trade statuses", async () =>
    fixture(async (f) => {
      const statuses = ["NOT_FOR_TRADE", "OPEN_TO_TRADE", "FOR_SALE", "RESERVED"] as const;
      for (let n = 0; n < 4; n++) {
        const item = await f.item("Status", n + 1);
        await db!.collectibleItem.update({
          where: { id: item.id },
          data: { tradeStatus: statuses[n]! },
        });
        if (n < 2)
          await createValuationService(db!, f.owner).addManualValuation(item.id, {
            currency: n === 0 ? "JPY" : "KWD",
            amountMinor: 100n,
          });
      }
      const data = await f.read();
      expect(data.tradeReady).toEqual({ itemCount: 2, unitCount: "5" });
      for (let n = 0; n < 4; n++)
        expect(data.trade.find((x) => x.tradeStatus === statuses[n])).toMatchObject({
          itemCount: 1,
          unitCount: String(n + 1),
        });
      expect(data.manualValues.groups).toMatchObject([
        { currency: "JPY", minorUnitExponent: 0, totalMinor: "100" },
        { currency: "KWD", minorUnitExponent: 3, totalMinor: "200" },
      ]);
    }));
});
