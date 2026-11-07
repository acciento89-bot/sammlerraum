import { MarketReferenceTotalSchema } from "@sammlerraum/contracts/dashboard";
import type { SearchDatabase } from "../search/search-read";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { Prisma } from "@sammlerraum/db/search-sql";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { ProviderRegistry } from "@sammlerraum/market-data/provider-registry";
import { createCategoryTemplateMaintenanceService } from "../catalog/category-template-service";
import { createCatalogMaintenanceService } from "../catalog/catalog-service";
import { createItemService } from "../items/item-service";
import { createMarketDataService } from "./market-data-service";
import { candidateFrom, ownedCandidates } from "../search/search-compiler";
import { runSearchRead } from "../search/search-read";
import {
  withMarketBatch,
  type MarketSelector,
  type MarketAggregateBasis,
  type MarketBatchDependencies,
} from "./market-batch";
import { aggregateMarketBatch } from "./market-aggregate";
import { createDashboardService } from "../dashboard/dashboard-service";
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
function deps(
  selectors: MarketSelector[] = [selector],
  bases: MarketAggregateBasis[] = ["ONE_PER_ITEM", "CURRENT_QUANTITY"],
): MarketBatchDependencies {
  return {
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
        queryGrants: [],
        aggregateGrants: selectors.map((selector) => ({
          selector,
          semantics: "ADDITIVE_PER_UNIT_REFERENCE_VALUE",
          bases,
        })),
      }),
    },
  };
}
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "explicit market reference totals in PostgreSQL and dashboard",
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
        data: { id: owner, name: "Aggregate fixture", email: `${owner}@example.invalid` },
      });
      const collection = await db.collection.create({
        data: { ownerId: owner, name: "Private aggregate" },
      });
      const category = await createCategoryTemplateMaintenanceService(db).createCategoryTemplate({
        key: `aggregate_${owner.replaceAll("-", "")}`,
        labels: { de: "Test", en: "Test" },
      });
      const catalog = createCatalogMaintenanceService(db),
        entry = await catalog.createCatalogEntry({
          categoryTemplateId: category.id,
          text: { language: "en", title: "Aggregate target" },
        });
      const identifier = await catalog.addExternalIdentifier(entry.state.id, 1, {
        namespace: "fixture",
        type: "product",
        value: "aggregate-product",
      });
      const items = createItemService(db, owner),
        item = await items.createItem({
          collectionId: collection.id,
          title: "Aggregate item",
          quantity: 3,
        });
      await items.linkItemToCatalog(item.id, entry.state.id);
      const market = createMarketDataService(db, registry);
      async function record(amountMinor = 5n, changes: object = {}) {
        const request = await market.prepareFetchRequest("fixture", {
          entryId: entry.state.id,
          variantId: null,
          identifierId: identifier.id,
          pollId: randomUUID(),
        });
        const value = {
          externalId: request.target.externalId,
          identity: { mode: "POLL" },
          sourceMetric: "market",
          kind: "LAST_SOLD",
          amountMinor,
          currency: "EUR",
          qualifiers: { graded: false },
          time: { basis: "FETCH", precision: "MILLISECOND" },
          ...changes,
        };
        if (value.kind === "PRICE_RANGE") delete (value as { amountMinor?: bigint }).amountMinor;
        await market.recordObservations("fixture", [value], {
          request,
          fetchedAt: "2025-03-01T00:00:00.000Z",
        });
      }
      return {
        owner,
        actor: { userId: owner },
        collection,
        items,
        item,
        entryId: entry.state.id,
        record,
      };
    }
    async function totals(
      f: Awaited<ReturnType<typeof fixture>>,
      basis: MarketAggregateBasis = "ONE_PER_ITEM",
      selectors: MarketSelector[] = [selector],
      market = deps(selectors),
    ) {
      return runSearchRead(db, async (tx) => {
        const context = {
          tx,
          scope: { actorUserId: f.owner, lifecycle: "ACTIVE" as const },
          ownedCandidates: Prisma.sql`SELECT i.id,i.quantity,i."catalogEntryId",i."catalogVariantId" ${candidateFrom} WHERE ${ownedCandidates(f.owner, "ACTIVE")}`,
          checkBudget: tx.checkBudget,
        };
        return withMarketBatch(
          context,
          selectors,
          { purpose: "DASHBOARD_AGGREGATE", basis },
          market,
          (batch) => aggregateMarketBatch(context, batch, selectors, basis),
        );
      });
    }
    it("uses exact numeric multiplication and sums above int64, counting actual quantities once", async () => {
      const f = await fixture();
      await f.record(9223372036854775807n);
      const second = await f.items.createItem({
        collectionId: f.collection.id,
        title: "Second owned row",
        quantity: 2,
      });
      await f.items.linkItemToCatalog(second.id, f.entryId);
      expect(await totals(f)).toMatchObject([
        {
          coverage: "COMPLETE",
          candidateItemCount: "2",
          contributingItemCount: "2",
          missingItemCount: "0",
          contributedQuantity: "5",
          total: { type: "POINT", amountMinor: "18446744073709551614" },
        },
      ]);
      expect(await totals(f, "CURRENT_QUANTITY")).toMatchObject([
        { total: { type: "POINT", amountMinor: "46116860184273879035" } },
      ]);
      expect(fetch).not.toHaveBeenCalled();
    });
    it("distinguishes zero contributions, partial subtotals, all missing and empty candidates", async () => {
      const f = await fixture();
      expect(await totals(f)).toMatchObject([
        {
          coverage: "EMPTY",
          candidateItemCount: "1",
          contributingItemCount: "0",
          missingItemCount: "1",
          total: null,
        },
      ]);
      await f.record(0n);
      expect(await totals(f)).toMatchObject([
        { coverage: "COMPLETE", total: { type: "POINT", amountMinor: "0" } },
      ]);
      await f.items.createItem({ collectionId: f.collection.id, title: "Missing value" });
      expect(await totals(f)).toMatchObject([
        {
          coverage: "PARTIAL",
          candidateItemCount: "2",
          missingItemCount: "1",
          total: { type: "POINT", amountMinor: "0" },
        },
      ]);
      await db.collection.update({
        where: { id: f.collection.id },
        data: { deletedAt: new Date() },
      });
      expect(await totals(f)).toMatchObject([
        { coverage: "EMPTY", candidateItemCount: "0", missingItemCount: "0", total: null },
      ]);
    });
    it("keeps interval endpoints and complete metric/qualifier groups separate", async () => {
      const f = await fixture(),
        range = { ...selector, kind: "PRICE_RANGE" as const },
        other = { ...selector, sourceMetric: "other", qualifiers: { graded: "false" } };
      await f.record(10n);
      await f.record(20n, { sourceMetric: "other", qualifiers: { graded: "false" } });
      await f.record(0n, { kind: "PRICE_RANGE", lowMinor: 4n, highMinor: 9n });
      const result = await totals(f, "CURRENT_QUANTITY", [selector, range, other]);
      expect(result).toHaveLength(3);
      expect(result.map((x) => x.total)).toEqual([
        { type: "POINT", amountMinor: "30" },
        { type: "RANGE", lowMinor: "12", highMinor: "27" },
        { type: "POINT", amountMinor: "60" },
      ]);
    });
    it("requires an independent exact additive grant and matching basis, even for empty candidates", async () => {
      const f = await fixture();
      await expect(
        totals(f, "CURRENT_QUANTITY", [selector], deps([selector], ["ONE_PER_ITEM"])),
      ).rejects.toMatchObject({
        code: "MARKET_BATCH_UNAVAILABLE",
        reason: "AGGREGATE_UNSUPPORTED",
      });
      await expect(totals(f, "ONE_PER_ITEM", [selector], deps([]))).rejects.toMatchObject({
        code: "MARKET_BATCH_UNAVAILABLE",
        reason: "AGGREGATE_UNSUPPORTED",
      });
    });
    it("keeps currencies and stored scales separate and reports the actual observation span", async () => {
      const f = await fixture(),
        other = await fixture();
      await f.record(5n);
      await other.record(7n, { time: { basis: "SOURCE", precision: "DAY", value: "2024-01-02" } });
      const item = await f.items.createItem({
        collectionId: f.collection.id,
        title: "Other source date",
        quantity: 1,
      });
      await f.items.linkItemToCatalog(item.id, other.entryId);
      const usd = { ...selector, currency: "USD" },
        jpy = { ...selector, currency: "JPY", minorUnitExponent: 0 };
      await f.record(8n, { currency: "USD" });
      await f.record(9n, { currency: "JPY" });
      expect(await totals(f, "ONE_PER_ITEM", [selector, usd, jpy])).toMatchObject([
        {
          coverage: "COMPLETE",
          observedAtFrom: "2024-01-02T00:00:00.000Z",
          observedAtTo: "2025-03-01T00:00:00.000Z",
          total: { type: "POINT", amountMinor: "12" },
        },
        {
          coverage: "PARTIAL",
          selector: { currency: "USD", minorUnitExponent: 2 },
          total: { type: "POINT", amountMinor: "8" },
        },
        {
          coverage: "PARTIAL",
          selector: { currency: "JPY", minorUnitExponent: 0 },
          total: { type: "POINT", amountMinor: "9" },
        },
      ]);
    });
    it("rejects malformed or inconsistent totals without throwing parser internals", () => {
      const valid = {
        selector,
        semantics: "ADDITIVE_PER_UNIT_REFERENCE_VALUE",
        basis: "ONE_PER_ITEM",
        coverage: "COMPLETE",
        candidateItemCount: "1",
        contributingItemCount: "1",
        missingItemCount: "0",
        contributedQuantity: "1",
        observedAtFrom: "2025-01-01T00:00:00.000Z",
        observedAtTo: "2025-01-01T00:00:00.000Z",
        total: { type: "POINT", amountMinor: "0" },
      };
      expect(MarketReferenceTotalSchema.safeParse(valid).success).toBe(true);
      for (const patch of [
        { candidateItemCount: "invalid" },
        { candidateItemCount: "01" },
        { contributingItemCount: "2" },
        { contributedQuantity: "0" },
        { coverage: "PARTIAL" },
        { total: { type: "POINT", amountMinor: "9".repeat(79) } },
        { total: null },
        { observedAtTo: null },
      ])
        expect(MarketReferenceTotalSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
    });
    it("holds aggregate rights through the entire dashboard result, including later awaited reads", async () => {
      const f = await fixture();
      await f.record();
      let enabled = true;
      const market = {
        ...deps(),
        queryPolicy: {
          snapshotForOwner: () => ({
            queryGrants: [],
            aggregateGrants: enabled
              ? [
                  {
                    selector,
                    semantics: "ADDITIVE_PER_UNIT_REFERENCE_VALUE" as const,
                    bases: ["ONE_PER_ITEM" as const],
                  },
                ]
              : [],
          }),
        },
      };
      const measured: SearchDatabase = {
        $transaction: (work, options) =>
          db.$transaction(
            (tx) =>
              work({
                $queryRaw: async <T>(sql: Prisma.Sql) => {
                  const result = await tx.$queryRaw<T>(sql);
                  if (sql.text.includes("dashboard:summary")) enabled = false;
                  return result;
                },
              }),
            options,
          ),
      };
      expect(
        (
          await createDashboardService(measured, {
            market,
            marketReference: { selectors: [selector], basis: "ONE_PER_ITEM" },
          }).getDashboard(f.actor, {})
        ).marketValues,
      ).toMatchObject({ state: "UNAVAILABLE", groups: null });
    });
    it("runs market-filtered dashboard reads and keeps reference totals explicitly on their full outer scope", async () => {
      const f = await fixture();
      await f.record(7n);
      const market = {
        ...deps(),
        queryPolicy: {
          snapshotForOwner: () => ({
            queryGrants: [{ selector, purposes: ["FILTER" as const] }],
            aggregateGrants: [
              {
                selector,
                semantics: "ADDITIVE_PER_UNIT_REFERENCE_VALUE" as const,
                bases: ["ONE_PER_ITEM" as const],
              },
            ],
          }),
        },
      };
      const data = await createDashboardService(db, {
        canonicalMoneyEnabled: true,
        market,
        marketReference: { selectors: [selector], basis: "ONE_PER_ITEM" },
      }).getDashboard(f.actor, {
        filter: {
          version: 1,
          root: { kind: "marketMoney", selector, test: { op: "range", minMinor: "100" } },
        },
      });
      expect(data.selection.itemCount).toBe(0);
      expect(data.marketValues).toMatchObject({
        state: "AVAILABLE",
        selectionBasis: "ALL_LIFECYCLE_OWNED",
        groups: [{ candidateItemCount: "1", total: { type: "POINT", amountMinor: "7" } }],
      });
    });
    it("connects real dashboard totals with an explicit outer-scope basis while production stays unavailable", async () => {
      const f = await fixture();
      await f.record(7n);
      const data = await createDashboardService(db, {
        market: deps(),
        marketReference: { selectors: [selector], basis: "CURRENT_QUANTITY" },
      }).getDashboard(f.actor, {});
      expect(data.marketValues).toMatchObject({
        state: "AVAILABLE",
        selectionBasis: "ALL_LIFECYCLE_OWNED",
        groups: [{ coverage: "COMPLETE", total: { type: "POINT", amountMinor: "21" } }],
      });
      expect(
        (await createDashboardService(db).getDashboard(f.actor, {})).marketValues,
      ).toMatchObject({ state: "UNAVAILABLE", groups: null });
    });
  },
);
