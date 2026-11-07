import { createItemSearchService } from "../search/item-search-service";
import type { SearchDatabase } from "../search/search-read";
import { aggregateMarketBatch } from "./market-aggregate";
import { searchFail } from "@sammlerraum/contracts/item-search";
import { historicalMarketSnapshots } from "./market-batch-sql";
import { CatalogSnapshotSchema } from "@sammlerraum/contracts/catalog";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { Prisma } from "@sammlerraum/db/search-sql";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { ProviderRegistry } from "@sammlerraum/market-data/provider-registry";
import { createCategoryTemplateMaintenanceService } from "../catalog/category-template-service";
import { createCatalogMaintenanceService } from "../catalog/catalog-service";
import { createItemService } from "../items/item-service";
import { candidateFrom, ownedCandidates } from "../search/search-compiler";
import { runSearchRead } from "../search/search-read";
import { createMarketDataService } from "./market-data-service";
import {
  withMarketBatch,
  marketBatchForUse,
  type PreparedMarketBatch,
  type MarketSelector,
  type MarketBatchContext,
} from "./market-batch";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
const selector: MarketSelector = {
  mode: "CURRENT_ITEM_MAPPING",
  providerId: "fixture",
  identifierNamespace: "fixture",
  identifierType: "product",
  kind: "LAST_SOLD",
  sourceMetric: "market",
  qualifiers: { graded: false },
  currency: "EUR",
  minorUnitExponent: 2,
};
const fetch = vi.fn(async () => []),
  registry = new ProviderRegistry([
    {
      provider: { id: "fixture", fetch },
      identifierNamespace: "fixture",
      identifierType: "product",
    },
  ]);
const deps = {
  registry,
  displayPolicy: {
    snapshotForOwner: () => [
      {
        providerId: "fixture",
        identifierNamespace: "fixture",
        identifierType: "product",
        allowHistorical: false,
      },
    ],
  },
  queryPolicy: {
    snapshotForOwner: () => ({
      queryGrants: [{ selector, purposes: ["FILTER" as const] }],
      aggregateGrants: [],
    }),
  },
};
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "bounded exact market relation on real PostgreSQL",
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
        data: { id: owner, name: "Market batch fixture", email: `${owner}@example.invalid` },
      });
      const collection = await db.collection.create({
        data: { ownerId: owner, name: "Market batch private collection" },
      });
      const category = await createCategoryTemplateMaintenanceService(db).createCategoryTemplate({
        key: `batch_${randomUUID().replaceAll("-", "")}`,
        labels: { de: "Test", en: "Test" },
      });
      const catalog = createCatalogMaintenanceService(db),
        entry = await catalog.createCatalogEntry({
          categoryTemplateId: category.id,
          text: { language: "en", title: "Market batch target" },
        });
      const identifier = await catalog.addExternalIdentifier(entry.state.id, 1, {
        namespace: "fixture",
        type: "product",
        value: "product-1",
      });
      const service = createItemService(db, owner),
        item = await service.createItem({
          collectionId: collection.id,
          title: "Market batch item",
          quantity: 3,
        });
      await service.linkItemToCatalog(item.id, entry.state.id);
      return {
        owner,
        collection,
        category,
        catalog,
        entryId: entry.state.id,
        identifier,
        item,
        service,
      };
    }
    async function record(
      f: Awaited<ReturnType<typeof fixture>>,
      changes: object = {},
      identifierId = f.identifier.id,
      variantId: string | null = null,
    ) {
      const service = createMarketDataService(db, registry),
        request = await service.prepareFetchRequest("fixture", {
          entryId: f.entryId,
          variantId,
          identifierId,
          pollId: randomUUID(),
        });
      await service.recordObservations(
        "fixture",
        [
          {
            externalId: request.target.externalId,
            identity: { mode: "POLL" },
            sourceMetric: "market",
            kind: "LAST_SOLD",
            amountMinor: 9007199254740993n,
            currency: "EUR",
            qualifiers: { graded: false },
            time: { basis: "FETCH", precision: "MILLISECOND" },
            ...changes,
          },
        ],
        { request, fetchedAt: "2025-02-01T00:00:00.000Z" },
      );
    }
    async function rows(
      f: Awaited<ReturnType<typeof fixture>>,
      onReady?: (c: MarketBatchContext) => void,
    ) {
      return runSearchRead(db, async (tx) => {
        const context: MarketBatchContext = {
          tx,
          scope: { actorUserId: f.owner, lifecycle: "ACTIVE" },
          ownedCandidates: Prisma.sql`SELECT i.id,i.quantity,i."catalogEntryId",i."catalogVariantId" ${candidateFrom} WHERE ${ownedCandidates(f.owner, "ACTIVE")}`,
          checkBudget: tx.checkBudget,
        };
        onReady?.(context);
        return withMarketBatch(context, [selector], { purpose: "FILTER" }, deps, async (batch) =>
          tx.$queryRaw<
            {
              itemId: string;
              amountMinor: string;
              sourceMetric: string;
              currentIdentifierId: string;
              observedIdentifierId: string;
            }[]
          >(
            Prisma.sql`WITH ${batch.ctes} SELECT "itemId","amountMinor"::text,"sourceMetric","currentIdentifierId","identifierId" AS "observedIdentifierId" FROM market_latest ORDER BY "itemId"`,
          ),
        );
      });
    }
    it("selects exact latest eligible values without displacing them with a newer wrong metric, qualifier or denomination", async () => {
      const f = await fixture();
      await record(f);
      await record(f, { sourceMetric: "wrong_metric", amountMinor: 1n });
      await record(f, { qualifiers: { graded: "false" }, amountMinor: 2n });
      await record(f, { currency: "USD", amountMinor: 3n });
      expect(await rows(f)).toMatchObject([
        { itemId: f.item.id, amountMinor: "9007199254740993", sourceMetric: "market" },
      ]);
      expect(fetch).not.toHaveBeenCalled();
    });
    it("omits foreign/deleted parent and retired exact identifiers instead of exposing stale values", async () => {
      const f = await fixture();
      await record(f);
      await f.catalog.removeExternalIdentifier(f.entryId, 2, f.identifier.id);
      expect(await rows(f)).toEqual([]);
    });
    it.each([1, 50, 500])(
      "prepares with three data queries for %s owned items sharing one target",
      async (n) => {
        const f = await fixture();
        await record(f);
        await db.collectibleItem.createMany({
          data: Array.from({ length: n - 1 }, (_, n) => ({
            ownerId: f.owner,
            collectionId: f.collection.id,
            title: `Own copy ${n}`,
            catalogEntryId: f.entryId,
            categoryTemplateId: f.category.id,
            quantity: 1,
          })),
        });
        let count = 0;
        const result = await rows(f, (ctx) => {
          const raw = ctx.tx.$queryRaw.bind(ctx.tx);
          ctx.tx = {
            $queryRaw: async <T>(sql: Prisma.Sql) => {
              if (sql.text.includes("market:prepare:")) count++;
              return raw<T>(sql);
            },
          };
        });
        expect(result).toHaveLength(n);
        expect(count).toBe(3);
      },
    );
    it("keeps old observations when a current identifier is replaced by a new row with the same value", async () => {
      const f = await fixture();
      await record(f);
      await f.catalog.removeExternalIdentifier(f.entryId, 2, f.identifier.id);
      const replacement = await f.catalog.addExternalIdentifier(f.entryId, 3, {
        namespace: "fixture",
        type: "product",
        value: "product-1",
      });
      expect(await rows(f)).toMatchObject([
        {
          itemId: f.item.id,
          currentIdentifierId: replacement.id,
          observedIdentifierId: f.identifier.id,
        },
      ]);
    });
    it("rejects two qualifying semantic identities across the whole outer scope, but not an identifier lacking the requested metric", async () => {
      const f = await fixture();
      await record(f);
      const second = await f.catalog.addExternalIdentifier(f.entryId, 2, {
        namespace: "fixture",
        type: "product",
        value: "product-2",
      });
      await record(f, { sourceMetric: "other_metric" }, second.id);
      expect(await rows(f)).toHaveLength(1);
      await record(f, {}, second.id);
      await expect(rows(f)).rejects.toMatchObject({
        code: "MARKET_BATCH_UNAVAILABLE",
        reason: "MAPPING_AMBIGUOUS",
      });
    });
    it("excludes foreign ambiguity and deleted own parents from the independent owned candidate scope", async () => {
      const f = await fixture(),
        other = await fixture();
      await record(f);
      await record(other);
      const second = await other.catalog.addExternalIdentifier(other.entryId, 2, {
        namespace: "fixture",
        type: "product",
        value: "product-2",
      });
      await record(other, {}, second.id);
      expect(await rows(f)).toHaveLength(1);
      await db.collection.update({
        where: { id: f.collection.id },
        data: { deletedAt: new Date() },
      });
      expect(await rows(f)).toEqual([]);
    });
    it("never falls back from a variant-linked item to an entry-only observation", async () => {
      const f = await fixture();
      await record(f);
      const variant = await f.catalog.addCatalogVariant(f.entryId, 2, {
        text: { language: "en", title: "Exact variant" },
      });
      await f.service.linkItemToCatalog(f.item.id, f.entryId, variant.id);
      expect(await rows(f)).toEqual([]);
    });
    it("requires a live exact variant even when both snapshots still contain it", async () => {
      const f = await fixture();
      const variant = await f.catalog.addCatalogVariant(f.entryId, 2, {
        text: { language: "en", title: "Exact variant" },
      });
      const identifier = await f.catalog.addExternalIdentifier(f.entryId, 3, {
        variantId: variant.id,
        namespace: "fixture",
        type: "product",
        value: "variant-value",
      });
      await f.service.linkItemToCatalog(f.item.id, f.entryId, variant.id);
      await record(f, {}, identifier.id, variant.id);
      expect(await rows(f)).toHaveLength(1);
      await db.catalogVariant.update({ where: { id: variant.id }, data: { active: false } });
      expect(await rows(f)).toEqual([]);
    });
    it("rejects more than 200 live exact-target identifiers before snapshot intersection", async () => {
      const f = await fixture();
      await db.catalogExternalIdentifier.createMany({
        data: Array.from({ length: 200 }, (_, n) => ({
          entryId: f.entryId,
          namespace: "fixture",
          type: "product",
          value: `overflow-${n}`,
          sources: [],
        })),
      });
      await expect(rows(f)).rejects.toMatchObject({
        code: "MARKET_BATCH_UNAVAILABLE",
        reason: "COVERAGE_LIMIT",
      });
    });
    it("rejects malformed driver counts instead of interpreting a noncanonical envelope", async () => {
      const f = await fixture();
      await record(f);
      await expect(
        rows(f, (ctx) => {
          const raw = ctx.tx.$queryRaw.bind(ctx.tx);
          ctx.tx = {
            $queryRaw: async <T>(sql: Prisma.Sql) => {
              const result = await raw<T>(sql);
              return (
                sql.text.includes("market:prepare:current")
                  ? (result as unknown as object[]).map((row) => ({ ...row, count: "01" }))
                  : result
              ) as T;
            },
          };
        }),
      ).rejects.toMatchObject({ code: "MARKET_BATCH_INVARIANT" });
    });
    it("expires callback-scoped handles and rejects structurally forged or cross-context reuse", async () => {
      const f = await fixture();
      await record(f);
      let captured: PreparedMarketBatch | undefined, context: MarketBatchContext | undefined;
      await runSearchRead(db, async (tx) => {
        context = {
          tx,
          scope: { actorUserId: f.owner, lifecycle: "ACTIVE" },
          ownedCandidates: Prisma.sql`SELECT i.id,i.quantity,i."catalogEntryId",i."catalogVariantId" ${candidateFrom} WHERE ${ownedCandidates(f.owner, "ACTIVE")}`,
          checkBudget: tx.checkBudget,
        };
        await withMarketBatch(context, [selector], { purpose: "FILTER" }, deps, async (batch) => {
          captured = batch;
          expect(() => marketBatchForUse({ ...context! }, batch, { purpose: "FILTER" })).toThrow();
          expect(() =>
            marketBatchForUse(context!, {} as PreparedMarketBatch, { purpose: "FILTER" }),
          ).toThrow();
          return null;
        });
      });
      expect(() => captured!.ctes).toThrow(
        expect.objectContaining({ code: "MARKET_BATCH_INVARIANT" }),
      );
    });

    it("does not upgrade a FILTER handle when the caller mutates its purpose during preparation", async () => {
      const f = await fixture();
      await record(f);
      await runSearchRead(db, async (tx) => {
        const use = { purpose: "FILTER" as "FILTER" | "DASHBOARD_AGGREGATE" };
        const raw = tx.$queryRaw.bind(tx);
        const context: MarketBatchContext = {
          tx: {
            $queryRaw: async <T>(sql: Prisma.Sql) => {
              const data = await raw<T>(sql);
              if (sql.text.includes("market:prepare:current"))
                Object.assign(use, { purpose: "DASHBOARD_AGGREGATE", basis: "ONE_PER_ITEM" });
              return data;
            },
          },
          scope: { actorUserId: f.owner, lifecycle: "ACTIVE" },
          ownedCandidates: Prisma.sql`SELECT i.id,i.quantity,i."catalogEntryId",i."catalogVariantId" ${candidateFrom} WHERE ${ownedCandidates(f.owner, "ACTIVE")}`,
          checkBudget: tx.checkBudget,
        };
        await withMarketBatch(context, [selector], use as never, deps, async (batch) => {
          expect(() =>
            marketBatchForUse(context, batch, {
              purpose: "DASHBOARD_AGGREGATE",
              basis: "ONE_PER_ITEM",
            }),
          ).toThrow(expect.objectContaining({ code: "MARKET_BATCH_INVARIANT" }));
          return null;
        });
      });
    });
    it("rejects scope mutation during awaited preparation instead of relabeling the prepared owner's data", async () => {
      const f = await fixture();
      await record(f);
      await expect(
        rows(f, (ctx) => {
          const raw = ctx.tx.$queryRaw.bind(ctx.tx);
          ctx.tx = {
            $queryRaw: async <T>(sql: Prisma.Sql) => {
              const result = await raw<T>(sql);
              if (sql.text.includes("market:prepare:current"))
                Object.assign(ctx.scope, { actorUserId: "different-scope" });
              return result;
            },
          };
        }),
      ).rejects.toMatchObject({ code: "MARKET_BATCH_INVARIANT" });
    });
    it("fails closed on a real PostgreSQL statement timeout without disclosing database details", async () => {
      const f = await fixture();
      await record(f);
      await expect(
        rows(f, (ctx) => {
          const raw = ctx.tx.$queryRaw.bind(ctx.tx);
          ctx.tx = {
            $queryRaw: async <T>(sql: Prisma.Sql) => {
              if (sql.text.includes("market:prepare:current"))
                await raw(Prisma.sql`SELECT pg_sleep(2.5)`);
              return raw<T>(sql);
            },
          };
        }),
      ).rejects.toMatchObject({
        code: "MARKET_BATCH_DEPENDENCY",
        message: "MARKET_BATCH_DEPENDENCY",
      });
    });
    it("rejects an exhausted application budget after an awaited database read", async () => {
      const f = await fixture();
      await record(f);
      await expect(
        rows(f, (ctx) => {
          let expired = false;
          const raw = ctx.tx.$queryRaw.bind(ctx.tx);
          ctx.checkBudget = () => {
            if (expired) searchFail("SEARCH_UNAVAILABLE");
          };
          ctx.tx = {
            $queryRaw: async <T>(sql: Prisma.Sql) => {
              const result = await raw<T>(sql);
              expired = true;
              return result;
            },
          };
        }),
      ).rejects.toMatchObject({ code: "SEARCH_UNAVAILABLE" });
    });
    it("rechecks live rights after consumption and does not return a revoked result", async () => {
      const f = await fixture();
      await record(f);
      let allowed = true;
      await expect(
        runSearchRead(db, async (tx) => {
          const context: MarketBatchContext = {
            tx,
            scope: { actorUserId: f.owner, lifecycle: "ACTIVE" },
            ownedCandidates: Prisma.sql`SELECT i.id,i.quantity,i."catalogEntryId",i."catalogVariantId" ${candidateFrom} WHERE ${ownedCandidates(f.owner, "ACTIVE")}`,
            checkBudget: tx.checkBudget,
          };
          return withMarketBatch(
            context,
            [selector],
            { purpose: "FILTER" },
            {
              ...deps,
              queryPolicy: {
                snapshotForOwner: () => ({
                  queryGrants: allowed ? [{ selector, purposes: ["FILTER"] }] : [],
                  aggregateGrants: [],
                }),
              },
            },
            async (batch) => {
              await tx.$queryRaw(Prisma.sql`WITH ${batch.ctes} SELECT count(*) FROM market_latest`);
              allowed = false;
              return "must not escape";
            },
          );
        }),
      ).rejects.toMatchObject({
        code: "MARKET_BATCH_UNAVAILABLE",
        reason: "QUERY_RIGHTS_DISABLED",
      });
    });
    it("keeps one RepeatableRead snapshot across a concurrent identifier retirement", async () => {
      const f = await fixture();
      await record(f);
      let retired = false;
      expect(
        await rows(f, (ctx) => {
          const raw = ctx.tx.$queryRaw.bind(ctx.tx);
          ctx.tx = {
            $queryRaw: async <T>(sql: Prisma.Sql) => {
              const result = await raw<T>(sql);
              if (!retired && sql.text.includes("market:prepare:current")) {
                retired = true;
                await f.catalog.removeExternalIdentifier(f.entryId, 2, f.identifier.id);
              }
              return result;
            },
          };
        }),
      ).toHaveLength(1);
      expect(await rows(f)).toEqual([]);
    });
    async function bulkEntries(
      f: Awaited<ReturnType<typeof fixture>>,
      count: number,
      snapshot: unknown,
    ) {
      await db.$executeRaw`WITH created AS (INSERT INTO "CatalogEntry"(id,"categoryTemplateId",revision,authored) SELECT gen_random_uuid(),"categoryTemplateId",1,authored FROM "CatalogEntry" CROSS JOIN generate_series(1,${count}) WHERE id=${f.entryId}::uuid RETURNING id,"categoryTemplateId") INSERT INTO "CatalogRevision"("entryId",revision,snapshot) SELECT c.id,1,jsonb_set(${JSON.stringify(snapshot)}::jsonb,'{id}',to_jsonb(c.id::text)) FROM created c`;
      await db.$executeRaw`INSERT INTO "CollectibleItem"(id,"ownerId","collectionId",title,"categoryTemplateId","catalogEntryId","updatedAt") SELECT gen_random_uuid(),${f.owner},${f.collection.id}::uuid,'Owned cap fixture',"categoryTemplateId",id,now() FROM "CatalogEntry" WHERE "categoryTemplateId"=${f.category.id}::uuid AND id<>${f.entryId}::uuid`;
    }
    it("refuses 1025 distinct current revisions before transferring their JSON snapshots", async () => {
      const f = await fixture();
      await record(f);
      const original = await db.catalogRevision.findUniqueOrThrow({
        where: { entryId_revision: { entryId: f.entryId, revision: 2 } },
      });
      await bulkEntries(f, 1024, original.snapshot);
      let observed: { count: string; snapshots: unknown[] } | undefined;
      await expect(
        rows(f, (ctx) => {
          const raw = ctx.tx.$queryRaw.bind(ctx.tx);
          ctx.tx = {
            $queryRaw: async <T>(sql: Prisma.Sql) => {
              const result = await raw<T>(sql);
              if (sql.text.includes("market:prepare:current"))
                observed = (result as never as (typeof observed)[])![0];
              return result;
            },
          };
        }),
      ).rejects.toMatchObject({ code: "MARKET_BATCH_UNAVAILABLE", reason: "COVERAGE_LIMIT" });
      expect(observed).toMatchObject({ count: "1025", snapshots: [] });
    });
    it("refuses an actual over-8MiB set of valid current snapshots before JSON transfer", async () => {
      const f = await fixture();
      await record(f);
      const original = await db.catalogRevision.findUniqueOrThrow({
        where: { entryId_revision: { entryId: f.entryId, revision: 2 } },
      });
      const snapshot = CatalogSnapshotSchema.parse({
        ...(original.snapshot as object),
        identifiers: Array.from({ length: 200 }, (_, n) => ({
          id: randomUUID(),
          namespace: "fixture",
          type: "product",
          value: "界".repeat(490) + n,
          sources: [],
        })),
      });
      await bulkEntries(f, 32, snapshot);
      let observed: { bytes: string; snapshots: unknown[] } | undefined;
      await expect(
        rows(f, (ctx) => {
          const raw = ctx.tx.$queryRaw.bind(ctx.tx);
          ctx.tx = {
            $queryRaw: async <T>(sql: Prisma.Sql) => {
              const result = await raw<T>(sql);
              if (sql.text.includes("market:prepare:current"))
                observed = (result as never as (typeof observed)[])![0];
              return result;
            },
          };
        }),
      ).rejects.toMatchObject({ code: "MARKET_BATCH_UNAVAILABLE", reason: "COVERAGE_LIMIT" });
      expect(BigInt(observed!.bytes)).toBeGreaterThan(8388608n);
      expect(observed!.snapshots).toEqual([]);
    });
    it("enforces the combined current and historical revision cap in PostgreSQL before returning JSON", async () => {
      const f = await fixture();
      const original = await db.catalogRevision.findUniqueOrThrow({
        where: { entryId_revision: { entryId: f.entryId, revision: 2 } },
      });
      await db.catalogRevision.createMany({
        data: Array.from({ length: 1024 }, (_, n) => ({
          entryId: f.entryId,
          revision: n + 3,
          snapshot: original.snapshot!,
        })),
      });
      await runSearchRead(db, async (tx) => {
        const observed = Prisma.sql`market_current AS (SELECT ${f.entryId}::uuid AS "entryId",2 AS revision),market_observed AS (SELECT "entryId",revision AS "catalogRevision",${f.category.id}::uuid AS "categoryTemplateId" FROM "CatalogRevision" WHERE "entryId"=${f.entryId}::uuid AND revision>=3)`;
        const [result] = await tx.$queryRaw<{ count: string; snapshots: unknown[] }[]>(
          historicalMarketSnapshots(observed, 1, 100),
        );
        expect(result).toMatchObject({ count: "1024", snapshots: [] });
      });
    });
    it.each([
      "duplicateVariants",
      "duplicateIdentifiers",
      "duplicateTuple",
      "wrongCategory",
      "orphanVariant",
    ])("rejects complete current-snapshot corruption: %s", async (kind) => {
      const f = await fixture();
      await record(f);
      await expect(
        rows(f, (ctx) => {
          const raw = ctx.tx.$queryRaw.bind(ctx.tx);
          ctx.tx = {
            $queryRaw: async <T>(sql: Prisma.Sql) => {
              const result = await raw<T>(sql);
              if (sql.text.includes("market:prepare:current"))
                for (const env of result as unknown as {
                  snapshots: { snapshot: Record<string, unknown> }[];
                }[])
                  for (const row of env.snapshots) {
                    const s = row.snapshot;
                    const ids = s.identifiers as Record<string, unknown>[];
                    if (kind === "duplicateIdentifiers") s.identifiers = [ids[0], ids[0]];
                    if (kind === "duplicateTuple")
                      s.identifiers = [ids[0], { ...ids[0], id: randomUUID() }];
                    if (kind === "wrongCategory") s.categoryTemplateId = randomUUID();
                    if (kind === "orphanVariant")
                      s.identifiers = [{ ...ids[0], variantId: randomUUID() }];
                    if (kind === "duplicateVariants") {
                      const v = {
                        id: randomUUID(),
                        text: { language: "en", title: "Duplicate variant" },
                        attributes: [],
                        sources: [],
                      };
                      s.variants = [v, v];
                    }
                  }
              return result;
            },
          };
        }),
      ).rejects.toMatchObject({ code: "MARKET_BATCH_INVARIANT" });
    });
    it.each(
      [1, 50, 500].flatMap((n) => [
        { n, distinct: false },
        { n, distinct: true },
      ]),
    )(
      "measures actual search/aggregate plans and configuration calls for $n rows, distinct=$distinct",
      async ({ n, distinct }) => {
        const f = await fixture();
        await record(f);
        if (distinct && n > 1) {
          const original = await db.catalogRevision.findUniqueOrThrow({
            where: { entryId_revision: { entryId: f.entryId, revision: 2 } },
          });
          await db.$executeRaw`INSERT INTO "CatalogEntry"(id,"categoryTemplateId",revision,authored) SELECT gen_random_uuid(),"categoryTemplateId",1,authored FROM "CatalogEntry" CROSS JOIN generate_series(1,${n - 1}) WHERE id=${f.entryId}::uuid`;
          await db.$executeRaw`INSERT INTO "CatalogExternalIdentifier"(id,"entryId",namespace,type,value,sources) SELECT gen_random_uuid(),id,'fixture','product','product-'||id::text,'[]'::jsonb FROM "CatalogEntry" WHERE "categoryTemplateId"=${f.category.id}::uuid AND id<>${f.entryId}::uuid`;
          await db.$executeRaw`INSERT INTO "CatalogRevision"("entryId",revision,snapshot) SELECT e.id,1,jsonb_set(jsonb_set(${JSON.stringify(original.snapshot)}::jsonb,'{id}',to_jsonb(e.id::text)),'{identifiers}',jsonb_build_array(jsonb_build_object('id',x.id,'namespace',x.namespace,'type',x.type,'value',x.value,'sources','[]'::jsonb))) FROM "CatalogEntry" e JOIN "CatalogExternalIdentifier" x ON x."entryId"=e.id WHERE e."categoryTemplateId"=${f.category.id}::uuid AND e.id<>${f.entryId}::uuid`;
          await db.$executeRaw`INSERT INTO "CollectibleItem"(id,"ownerId","collectionId",title,"categoryTemplateId","catalogEntryId","updatedAt") SELECT gen_random_uuid(),${f.owner},${f.collection.id}::uuid,'Distinct owned market fixture',"categoryTemplateId",id,now() FROM "CatalogEntry" WHERE "categoryTemplateId"=${f.category.id}::uuid AND id<>${f.entryId}::uuid`;
          await db.$executeRaw`INSERT INTO "MarketObservation" SELECT (jsonb_populate_record(NULL::"MarketObservation",to_jsonb(o)||jsonb_build_object('id',gen_random_uuid(),'pollId',gen_random_uuid(),'entryId',x."entryId",'catalogRevision',1,'identifierId',x.id,'externalId',x.value))).* FROM "MarketObservation" o CROSS JOIN "CatalogExternalIdentifier" x JOIN "CatalogEntry" e ON e.id=x."entryId" WHERE o."entryId"=${f.entryId}::uuid AND e."categoryTemplateId"=${f.category.id}::uuid AND e.id<>${f.entryId}::uuid`;
        } else if (n > 1) {
          await db.collectibleItem.createMany({
            data: Array.from({ length: n - 1 }, (_, i) => ({
              ownerId: f.owner,
              collectionId: f.collection.id,
              title: `Shared market ${i}`,
              categoryTemplateId: f.category.id,
              catalogEntryId: f.entryId,
              quantity: 1,
            })),
          });
        }
        // Guarded native insertion retains all immutable identity and catalog-binding checks.
        await db.$executeRaw`INSERT INTO "MarketObservation" SELECT (jsonb_populate_record(NULL::"MarketObservation",to_jsonb(o)||jsonb_build_object('id',gen_random_uuid(),'pollId',gen_random_uuid(),'sourceMetric',CASE WHEN g.n%3=0 THEN 'market' ELSE 'irrelevant' END,'qualifiers',CASE WHEN g.n%2=0 THEN '{"graded":false}'::jsonb ELSE '{"graded":true}'::jsonb END))).* FROM "MarketObservation" o JOIN "CatalogEntry" e ON e.id=o."entryId" CROSS JOIN generate_series(1,12) AS g(n) WHERE e."categoryTemplateId"=${f.category.id}::uuid`;
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
        const start = performance.now();
        const page = await createItemSearchService(measured, { market: deps }).searchItems(
          { userId: f.owner },
          {
            limit: 1,
            filter: {
              version: 1,
              root: { kind: "marketMoney", selector, test: { op: "present" } },
            },
          },
        );
        expect(page.total).toBe(n);
        expect(page.items).toHaveLength(1);
        const searchCalls = queries.length,
          searchMs = performance.now() - start;
        expect(queries.filter((q) => q.text.includes("market:prepare:")).length).toBe(3);
        const aggregateDeps = {
          ...deps,
          queryPolicy: {
            snapshotForOwner: () => ({
              queryGrants: [],
              aggregateGrants: [
                {
                  selector,
                  semantics: "ADDITIVE_PER_UNIT_REFERENCE_VALUE" as const,
                  bases: ["CURRENT_QUANTITY" as const],
                },
              ],
            }),
          },
        };
        const aggregateStart = performance.now();
        const totals = await runSearchRead(measured, async (tx) => {
          const context = {
            tx,
            scope: { actorUserId: f.owner, lifecycle: "ACTIVE" as const },
            ownedCandidates: Prisma.sql`SELECT i.id,i.quantity,i."catalogEntryId",i."catalogVariantId" ${candidateFrom} WHERE ${ownedCandidates(f.owner, "ACTIVE")}`,
            checkBudget: tx.checkBudget,
          };
          return withMarketBatch(
            context,
            [selector],
            { purpose: "DASHBOARD_AGGREGATE", basis: "CURRENT_QUANTITY" },
            aggregateDeps,
            (batch) => aggregateMarketBatch(context, batch, [selector], "CURRENT_QUANTITY"),
          );
        });
        expect(totals[0]!.candidateItemCount).toBe(String(n));
        const aggregateMs = performance.now() - aggregateStart,
          aggregateCalls = queries.length - searchCalls;
        expect(searchCalls).toBe(17);
        expect(aggregateCalls).toBe(9);
        const selected = queries.filter(
          (q) =>
            !q.text.includes("set_config(") &&
            (q.text.includes("market:prepare:") ||
              q.text.includes("SELECT count(*) AS total") ||
              q.text.includes("SELECT i.id,i.title") ||
              q.text.includes("market:aggregate")),
        );
        const unique = [...new Map(selected.map((q) => [q.text, q])).values()];
        const plans = await runSearchRead(db, async (tx) => {
          const result = [];
          for (const sql of unique) {
            const plan = await tx.$queryRaw(
              Prisma.sql`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${sql}`,
            );
            result.push({ query: sql.text, plan });
          }
          return result;
        });
        console.info(
          "MARKET_BATCH_QUERY_PROOF",
          JSON.stringify({
            ownedItems: n,
            distinctTargets: distinct ? n : 1,
            observations: 13 * (distinct ? n : 1),
            searchCallsIncludingConfiguration: searchCalls,
            aggregateCallsIncludingConfiguration: aggregateCalls,
            searchMs,
            aggregateMs,
            plans,
          }),
        );
        expect(fetch).not.toHaveBeenCalled();
      },
    );
    it("treats malformed historical snapshots as ineligible and malformed current snapshots as invariant", async () => {
      const f = await fixture();
      await record(f);
      await f.catalog.updateCatalogEntry(f.entryId, 2, {
        text: { language: "en", title: "Current revision" },
      });
      expect(await rows(f)).toHaveLength(1);
      function corrupt(which: "current" | "history") {
        return (ctx: MarketBatchContext) => {
          const raw = ctx.tx.$queryRaw.bind(ctx.tx);
          ctx.tx = {
            $queryRaw: async <T>(sql: Prisma.Sql) => {
              const result = await raw<T>(sql);
              if (sql.text.includes(`market:prepare:${which}`))
                for (const envelope of result as unknown as {
                  snapshots: { snapshot: unknown }[];
                }[])
                  for (const row of envelope.snapshots)
                    row.snapshot = { schemaVersion: 1, id: f.entryId, identifiers: [] };
              return result;
            },
          };
        };
      }
      expect(await rows(f, corrupt("history"))).toEqual([]);
      await expect(rows(f, corrupt("current"))).rejects.toMatchObject({
        code: "MARKET_BATCH_INVARIANT",
      });
    });
  },
);
