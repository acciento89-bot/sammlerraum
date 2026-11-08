import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { ProviderRegistry } from "@sammlerraum/market-data/provider-registry";
import { createCategoryTemplateMaintenanceService } from "../catalog/category-template-service";
import { createCatalogMaintenanceService } from "../catalog/catalog-service";
import { createItemService } from "../items/item-service";
import { createMarketDataService } from "../market-data/market-data-service";
import { createItemSearchService } from "./item-search-service";
import { createSmartCollectionService } from "./smart-collection-service";
import type { MarketBatchDependencies, MarketSelector } from "../market-data/market-batch";
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
function deps(selectors: MarketSelector[] = [selector]): MarketBatchDependencies {
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
        queryGrants: selectors.map((selector) => ({ selector, purposes: ["FILTER"] })),
        aggregateGrants: [],
      }),
    },
  };
}
const leaf = (test: object = { op: "present" }, selected = selector) => ({
  kind: "marketMoney",
  selector: structuredClone(selected),
  test,
});
const filter = (root: unknown) => ({ version: 1, root });
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "market filters through real owned and saved searches",
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
        data: { id: owner, name: "Market search test", email: `${owner}@example.invalid` },
      });
      const collection = await db.collection.create({
        data: { ownerId: owner, name: "Private search" },
      });
      const category = await createCategoryTemplateMaintenanceService(db).createCategoryTemplate({
        key: `filter_${owner.replaceAll("-", "")}`,
        labels: { de: "Test", en: "Test" },
      });
      const catalog = createCatalogMaintenanceService(db),
        entry = await catalog.createCatalogEntry({
          categoryTemplateId: category.id,
          text: { language: "en", title: "Search target" },
        });
      const identifier = await catalog.addExternalIdentifier(entry.state.id, 1, {
        namespace: "fixture",
        type: "product",
        value: "literal-'%_\\-product",
      });
      const items = createItemService(db, owner),
        item = await items.createItem({
          collectionId: collection.id,
          title: "Find this item",
          quantity: 3,
        });
      await items.linkItemToCatalog(item.id, entry.state.id);
      const market = createMarketDataService(db, registry);
      async function record(amountMinor = 0n, id = identifier.id, changes: object = {}) {
        const request = await market.prepareFetchRequest("fixture", {
          entryId: entry.state.id,
          variantId: null,
          identifierId: id,
          pollId: randomUUID(),
        });
        const observation = {
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
        if (observation.kind === "PRICE_RANGE")
          delete (observation as { amountMinor?: bigint }).amountMinor;
        await market.recordObservations("fixture", [observation], {
          request,
          fetchedAt: "2025-03-01T00:00:00.000Z",
        });
      }
      return {
        owner,
        actor: { userId: owner },
        collection,
        catalog,
        entryId: entry.state.id,
        identifier,
        item,
        items,
        record,
      };
    }
    function service(market = deps()) {
      return createItemSearchService(db, { market });
    }
    it("evaluates point zero, huge exact integers, missing and NOT without coercion or quantity multiplication", async () => {
      const f = await fixture();
      await f.record();
      expect(
        (
          await service().searchItems(f.actor, {
            filter: filter(leaf({ op: "range", minMinor: "0", maxMinor: "0" })),
          })
        ).items.map((x) => x.id),
      ).toEqual([f.item.id]);
      await f.record(9007199254740993n);
      expect(
        (
          await service().searchItems(f.actor, {
            filter: filter(
              leaf({ op: "range", minMinor: "9007199254740993", maxMinor: "9007199254740993" }),
            ),
          })
        ).total,
      ).toBe(1);
      expect(
        (
          await service().searchItems(f.actor, {
            filter: filter(leaf({ op: "range", maxMinor: "0" })),
          })
        ).total,
      ).toBe(0);
      const missing = await f.items.createItem({
        collectionId: f.collection.id,
        title: "No mapping",
      });
      expect(
        (
          await service().searchItems(f.actor, { filter: filter(leaf({ op: "missing" })) })
        ).items.map((x) => x.id),
      ).toEqual([missing.id]);
      expect(
        (
          await service().searchItems(f.actor, { filter: filter({ kind: "not", child: leaf() }) })
        ).items.map((x) => x.id),
      ).toEqual([missing.id]);
      expect(fetch).not.toHaveBeenCalled();
    });
    it.each(["text", "and", "not", "or"])(
      "rejects whole-scope ambiguity even outside the matching %s branch",
      async (mode) => {
        const f = await fixture();
        await f.record(10n);
        const second = await f.catalog.addExternalIdentifier(f.entryId, 2, {
          namespace: "fixture",
          type: "product",
          value: "ambiguous",
        });
        await f.record(10n, second.id);
        const excluded = await db.collection.create({
          data: { ownerId: f.owner, name: "No matching inventory" },
        });
        const root =
          mode === "not"
            ? { kind: "not", child: leaf() }
            : mode === "and"
              ? {
                  kind: "and",
                  children: [
                    { kind: "collection", test: { op: "eq", value: excluded.id } },
                    leaf(),
                  ],
                }
              : mode === "or"
                ? {
                    kind: "or",
                    children: [
                      { kind: "collection", test: { op: "eq", value: f.collection.id } },
                      leaf(),
                    ],
                  }
                : leaf();
        await expect(
          service().searchItems(f.actor, {
            filter: filter(root),
            ...(mode === "text" ? { text: "no such text matches" } : {}),
          }),
        ).rejects.toMatchObject({ code: "FILTER_UNAVAILABLE", reason: "MARKET_MAPPING_AMBIGUOUS" });
      },
    );
    it("denies empty inventories with no independent rights and never treats denial as missing", async () => {
      const f = await fixture();
      await f.items.deleteItem(f.item.id);
      await expect(
        service(deps([])).searchItems(f.actor, { filter: filter(leaf({ op: "missing" })) }),
      ).rejects.toMatchObject({
        code: "FILTER_UNAVAILABLE",
        reason: "MARKET_QUERY_RIGHTS_DISABLED",
      });
      await expect(
        createItemSearchService(db).searchItems(f.actor, { filter: filter(leaf()) }),
      ).rejects.toMatchObject({ code: "FILTER_UNAVAILABLE" });
    });
    it("keeps complete qualifier types and stored exponent exact, without letting newer mismatches displace the latest eligible row", async () => {
      const f = await fixture();
      await f.record(31n);
      await f.record(91n, f.identifier.id, { qualifiers: { graded: "false" } });
      await f.record(92n, f.identifier.id, { qualifiers: { graded: false, extra: true } });
      await f.record(93n, f.identifier.id, { sourceMetric: "other" });
      expect(
        (
          await service().searchItems(f.actor, {
            filter: filter(leaf({ op: "range", minMinor: "31", maxMinor: "31" })),
          })
        ).total,
      ).toBe(1);
      const exponent = { ...selector, minorUnitExponent: 1 };
      expect(
        (
          await service(deps([exponent])).searchItems(f.actor, {
            filter: filter(leaf({ op: "missing" }, exponent)),
          })
        ).total,
      ).toBe(1);
    });
    it("evaluates interval endpoints on the latest range with inclusive overlap and containment", async () => {
      const f = await fixture(),
        range = { ...selector, kind: "PRICE_RANGE" as const };
      await f.record(0n, f.identifier.id, {
        kind: "PRICE_RANGE",
        amountMinor: undefined,
        lowMinor: 100n,
        highMinor: 200n,
      });
      const search = (test: object) =>
        service(deps([range])).searchItems(f.actor, { filter: filter(leaf(test, range)) });
      expect((await search({ op: "overlaps", minMinor: "200", maxMinor: "300" })).total).toBe(1);
      expect((await search({ op: "overlaps", minMinor: "201", maxMinor: "300" })).total).toBe(0);
      expect((await search({ op: "containedBy", minMinor: "100", maxMinor: "200" })).total).toBe(1);
      expect((await search({ op: "containedBy", minMinor: "101", maxMinor: "200" })).total).toBe(0);
    });
    it("prepares before page boundaries and rejects ambiguity even when the next page would be empty", async () => {
      const f = await fixture();
      await f.record(10n);
      const secondItem = await f.items.createItem({
        collectionId: f.collection.id,
        title: "Other mapped item",
      });
      await f.items.linkItemToCatalog(secondItem.id, f.entryId);
      const input = { filter: filter(leaf()), limit: 1 };
      const page = await service().searchItems(f.actor, input);
      expect(page.nextCursor).not.toBeNull();
      const older = [f.item.id, secondItem.id].find((id) => id !== page.items[0]!.id)!;
      await f.items.deleteItem(older);
      const second = await f.catalog.addExternalIdentifier(f.entryId, 2, {
        namespace: "fixture",
        type: "product",
        value: "second qualifying identity",
      });
      await f.record(10n, second.id);
      await expect(
        service().searchItems(f.actor, { ...input, cursor: page.nextCursor }),
      ).rejects.toMatchObject({ code: "FILTER_UNAVAILABLE", reason: "MARKET_MAPPING_AMBIGUOUS" });
    });
    it("deduplicates selectors and ignores foreign or lifecycle-excluded ambiguous candidates", async () => {
      const f = await fixture(),
        foreign = await fixture();
      await f.record(5n);
      await foreign.record(5n);
      const second = await foreign.catalog.addExternalIdentifier(foreign.entryId, 2, {
        namespace: "fixture",
        type: "product",
        value: "foreign ambiguous",
      });
      await foreign.record(5n, second.id);
      expect(
        (
          await service().searchItems(f.actor, {
            filter: filter({
              kind: "or",
              children: [leaf(), { kind: "not", child: leaf({ op: "missing" }) }],
            }),
          })
        ).total,
      ).toBe(1);
      await db.collectibleItem.update({
        where: { id: foreign.item.id },
        data: { archivedAt: new Date() },
      });
      expect(
        (
          await service().searchItems(foreign.actor, {
            lifecycle: "ACTIVE",
            filter: filter(leaf()),
          })
        ).total,
      ).toBe(0);
      await expect(
        service().searchItems(foreign.actor, { lifecycle: "ALL", filter: filter(leaf()) }),
      ).rejects.toMatchObject({ code: "FILTER_UNAVAILABLE", reason: "MARKET_MAPPING_AMBIGUOUS" });
    });
    it("rechecks saved searches against current rights rather than persisting a permission", async () => {
      const f = await fixture();
      await f.record(42n);
      let enabled = true;
      const market = {
        ...deps(),
        queryPolicy: {
          snapshotForOwner: () => ({
            queryGrants: enabled ? [{ selector, purposes: ["FILTER" as const] }] : [],
            aggregateGrants: [],
          }),
        },
      };
      const saved = createSmartCollectionService(db, { market });
      const created = await saved.createSmartCollection(f.actor, {
        name: "Exact market",
        definition: { version: 1, text: "", filter: filter(leaf()), lifecycle: "ACTIVE" },
      });
      expect((await saved.resolveSmartCollectionItems(f.actor, created.id)).total).toBe(1);
      enabled = false;
      await expect(saved.resolveSmartCollectionItems(f.actor, created.id)).rejects.toMatchObject({
        code: "SMART_COLLECTION_UNRESOLVABLE",
      });
    });
  },
);
