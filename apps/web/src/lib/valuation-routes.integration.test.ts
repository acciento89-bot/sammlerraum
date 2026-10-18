import { randomUUID } from "node:crypto";
import * as productionDependencies from "./valuation-route-dependencies";
import { createItemQuery } from "@sammlerraum/domain/items/item-query";
import { ProviderRegistry } from "@sammlerraum/market-data/provider-registry";
import { createMarketDataService } from "@sammlerraum/domain/market-data/market-data-service";
import { createCatalogMaintenanceService } from "@sammlerraum/domain/catalog/catalog-service";
import { createCategoryTemplateMaintenanceService } from "@sammlerraum/domain/catalog/category-template-service";
import type { ValuationSummaryDto } from "@sammlerraum/contracts/valuations";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createItemService } from "@sammlerraum/domain/items/item-service";
import { createValuationRouteDependencies, createValuationRouteHandlers } from "./valuation-routes";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const ownerId = `ValuationRoute_${randomUUID()}`;
const origin = "https://sammlerraum.example";
let collectionId: string, itemId: string;
const session = vi.fn(
  async (_input: unknown): Promise<{ user: { id: string } } | null> => ({ user: { id: ownerId } }),
);
const handlers = () =>
  createValuationRouteHandlers(
    createValuationRouteDependencies(db!, { api: { getSession: session } }, origin),
  );
const request = (
  method = "GET",
  body?: unknown,
  query = "",
  requestOrigin: string | null = origin,
) =>
  new Request(`${origin}/api/v1/items/${itemId}/valuations${query}`, {
    method,
    headers: {
      ...(requestOrigin ? { origin: requestOrigin } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
describe.runIf(enabled)("valuation HTTP routes PostgreSQL", () => {
  beforeAll(async () => {
    await db!.user.create({
      data: { id: ownerId, name: "Valuation route", email: `${ownerId}@example.invalid` },
    });
    collectionId = (
      await db!.collection.create({ data: { ownerId, name: "Valuations", visibility: "PUBLIC" } })
    ).id;
  });
  beforeEach(async () => {
    session.mockReset();
    session.mockResolvedValue({ user: { id: ownerId } });
    itemId = (
      await createItemService(db!, ownerId).createItem({
        collectionId,
        title: "Valued item",
        visibility: "PUBLIC",
      })
    ).id;
  });
  afterAll(async () => {
    if (db) {
      await db.user.deleteMany({ where: { id: ownerId } });
      await db.$disconnect();
    }
  });
  it("appends exact private manual values and reads the real owner query with no-store responses", async () => {
    const api = handlers();
    const response = await api.POST(
      request("POST", {
        amountMinor: "9223372036854775807",
        currency: "KWD",
        note: "  private 😀  ",
        observedAt: "0001-01-01T00:00:00.000Z",
      }),
      itemId.toUpperCase(),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      valuation: {
        amountMinor: "9223372036854775807",
        currency: "KWD",
        minorUnitExponent: 3,
        note: "private 😀",
        observedAt: "0001-01-01T00:00:00.000Z",
      },
    });
    const get = await api.GET(request(), itemId);
    expect(get.status).toBe(200);
    const data = (await get.json()) as { summary: ValuationSummaryDto };
    expect(data.summary.manual.latest).toMatchObject({ amountMinor: "9223372036854775807" });
    expect(data.summary.aggregate).toBeNull();
    expect(JSON.stringify(data)).not.toContain("ownerId");
    expect(JSON.stringify(data)).not.toContain("actorUserId");
    expect(session).toHaveBeenLastCalledWith({
      headers: expect.any(Headers),
      query: { disableCookieCache: true, disableRefresh: true },
    });
  });
  it("rejects unknown, duplicate, malformed and excessive query inputs before domain reading", async () => {
    for (const q of [
      "?manualLimit=1&manualLimit=2",
      "?manualLimit=1.0",
      "?groupLimit=9",
      "?actorUserId=foreign",
      "?view=source-history",
      "?manualCursor=abc=",
      "?x=" + "a".repeat(8192),
    ]) {
      const r = await handlers().GET(request("GET", undefined, q), itemId);
      expect(r.status, q).toBe(400);
      expect(r.headers.get("cache-control")).toBe("no-store");
    }
  });
  it("requires authentication, correct origin, owner scope and active writes", async () => {
    session.mockResolvedValue(null);
    expect((await handlers().GET(request(), itemId)).status).toBe(401);
    session.mockResolvedValue({ user: { id: "foreign" } });
    expect((await handlers().GET(request(), itemId)).status).toBe(404);
    session.mockResolvedValue({ user: { id: ownerId } });
    expect((await handlers().GET(request(), "invalid")).status).toBe(404);
    expect(
      (
        await handlers().POST(
          request("POST", { amountMinor: "1", currency: "EUR" }, "", null),
          itemId,
        )
      ).status,
    ).toBe(403);
    await createItemService(db!, ownerId).archiveItem(itemId);
    expect((await handlers().GET(request(), itemId)).status).toBe(200);
    expect(
      (await handlers().POST(request("POST", { amountMinor: "1", currency: "EUR" }), itemId))
        .status,
    ).toBe(409);
  });
  it("rejects unsafe money, injected authors, unsupported new currencies and malformed Unicode", async () => {
    for (const body of [
      { amountMinor: 1, currency: "EUR" },
      { amountMinor: "9223372036854775808", currency: "EUR" },
      { amountMinor: "1", currency: "XXX" },
      { amountMinor: "1", currency: "EUR", actorUserId: ownerId },
      { amountMinor: "1", currency: "EUR", note: "\ud800" },
      { amountMinor: "1", currency: "EUR", observedAt: "9999-01-01T00:00:00.000Z" },
    ])
      expect((await handlers().POST(request("POST", body), itemId)).status).toBe(400);
    expect(
      (
        await handlers().POST(
          request("POST", { amountMinor: "1", currency: "EUR" }, "?view=summary"),
          itemId,
        )
      ).status,
    ).toBe(400);
  });
  it("uses thin route exports with actual dependencies and preserves the anonymous public projection", async () => {
    const spy = vi
      .spyOn(productionDependencies, "valuationRouteHandlers")
      .mockResolvedValue(handlers());
    try {
      const route = await import("../app/api/v1/items/[itemId]/valuations/route");
      const context = { params: Promise.resolve({ itemId }) };
      expect(
        (
          await route.POST(
            request("POST", {
              amountMinor: "9007199254740993",
              currency: "EUR",
              note: "Private estimate",
            }),
            context,
          )
        ).status,
      ).toBe(201);
      expect(await (await route.GET(request(), context)).json()).toMatchObject({
        summary: {
          manual: { latest: { amountMinor: "9007199254740993", note: "Private estimate" } },
        },
      });
      expect(await createItemQuery(db!).getPublicItem(itemId)).toEqual({
        id: itemId,
        title: "Valued item",
        publicDescription: null,
        quantity: 1,
        tradeStatus: "NOT_FOR_TRADE",
      });
    } finally {
      spy.mockRestore();
    }
  });
  it("rejects streamed over-limit and invalid UTF8 bodies, while allowing 2000 astral codepoints", async () => {
    expect(
      (
        await handlers().POST(
          request("POST", { amountMinor: "0", currency: "JPY", note: "😀".repeat(2000) }),
          itemId,
        )
      ).status,
    ).toBe(201);
    const raw = (bytes: Uint8Array) =>
      new Request(`${origin}/api/v1/items/${itemId}/valuations`, {
        method: "POST",
        headers: { origin, "content-type": "application/json", "content-length": "1" },
        body: new Uint8Array(bytes).buffer,
      });
    for (const bytes of [
      new Uint8Array([0xc3, 0x28]),
      new TextEncoder().encode(
        JSON.stringify({ amountMinor: "1", currency: "EUR", note: "x".repeat(17000) }),
      ),
    ])
      expect((await handlers().POST(raw(bytes), itemId)).status).toBe(400);
    expect(
      (
        await handlers().POST(
          request("POST", { amountMinor: "1", currency: "EUR", note: "😀".repeat(2001) }),
          itemId,
        )
      ).status,
    ).toBe(400);
  });
  it("returns real ingested external facts and continuation, with disabled production display independently empty", async () => {
    let entryId: string | undefined,
      categoryId: string | undefined,
      fetches = 0;
    const registry = new ProviderRegistry([
      {
        provider: {
          id: "route_fixture",
          fetch: async () => {
            fetches++;
            return [];
          },
        },
        identifierNamespace: "route_fixture",
        identifierType: "product",
      },
    ]);
    const policy = {
      snapshotForOwner: () => [
        {
          providerId: "route_fixture",
          identifierNamespace: "route_fixture",
          identifierType: "product",
          allowHistorical: true,
        },
      ],
    };
    try {
      categoryId = (
        await createCategoryTemplateMaintenanceService(db!).createCategoryTemplate({
          key: `route_${randomUUID().replaceAll("-", "")}`,
          labels: { en: "Route", de: "Route" },
        })
      ).id;
      const catalog = createCatalogMaintenanceService(db!);
      entryId = (
        await catalog.createCatalogEntry({
          categoryTemplateId: categoryId,
          text: { language: "en", title: "Market route" },
        })
      ).state.id;
      const identifier = await catalog.addExternalIdentifier(entryId, 1, {
        namespace: "route_fixture",
        type: "product",
        value: "route-1",
      });
      await createItemService(db!, ownerId).linkItemToCatalog(itemId, entryId);
      const market = createMarketDataService(db!, registry);
      for (let n = 0; n < 6; n++) {
        const request = await market.prepareFetchRequest("route_fixture", {
          entryId,
          variantId: null,
          identifierId: identifier.id,
          pollId: randomUUID(),
        });
        await market.recordObservations(
          "route_fixture",
          [
            {
              externalId: "route-1",
              identity: { mode: "POLL" },
              sourceMetric: "sold",
              kind: "LAST_SOLD",
              currency: "EUR",
              amountMinor: 9007199254740993n,
              qualifiers: { flag: false },
              confidence: { sampleSize: 0 },
              sourceReference: "Original fact",
              time: { basis: "SOURCE", precision: "DAY", value: "2025-01-01" },
            },
          ],
          { request, fetchedAt: "2025-02-01T00:00:00.000Z" },
        );
      }
      const api = createValuationRouteHandlers(
        createValuationRouteDependencies(db!, { api: { getSession: session } }, origin, {
          policy,
          registry,
        }),
      );
      const read = await api.GET(request(), itemId);
      expect(read.status).toBe(200);
      const { summary } = (await read.json()) as { summary: ValuationSummaryDto };
      const group = summary.external.groups[0]!;
      expect(group.history.records).toHaveLength(5);
      expect(group.history.records[0]).toMatchObject({
        price: { amountMinor: "9007199254740993" },
        confidence: { sampleSize: 0 },
        observedPrecision: "DAY",
        sourceReference: "Original fact",
      });
      const tail = await api.GET(
        request(
          "GET",
          undefined,
          `?view=source-history&source=${group.source}&cursor=${group.history.nextCursor}`,
        ),
        itemId,
      );
      expect(tail.status).toBe(200);
      expect(await tail.json()).toMatchObject({
        sourceHistory: {
          history: {
            records: [expect.objectContaining({ sourceReference: "Original fact" })],
            nextCursor: null,
          },
        },
      });
      expect(await (await handlers().GET(request(), itemId)).json()).toMatchObject({
        summary: { external: { availability: "DISPLAY_DISABLED", groups: [] } },
      });
      expect(
        (
          await handlers().GET(
            request("GET", undefined, `?view=source-history&source=${group.source}`),
            itemId,
          )
        ).status,
      ).toBe(404);
      expect(fetches).toBe(0);
    } finally {
      await db!.collectibleItem.delete({ where: { id: itemId } });
      if (entryId) {
        await db!.$executeRaw`DELETE FROM "MarketObservation" WHERE "entryId"=${entryId}::uuid`;
        await db!.catalogExternalIdentifier.deleteMany({ where: { entryId } });
        await db!.catalogRevision.deleteMany({ where: { entryId } });
        await db!.catalogEntry.delete({ where: { id: entryId } });
      }
      if (categoryId) await db!.categoryTemplate.delete({ where: { id: categoryId } });
    }
  });
  it("maps the native manual quota and dependency failures without leaking database details", async () => {
    await db!
      .$executeRaw`INSERT INTO "Valuation" (id,"itemId","ownerId","actorUserId","amountMinor",currency,"minorUnitExponent","observedAt","createdAt") SELECT gen_random_uuid(),${itemId}::uuid,${ownerId},${ownerId},1,'EUR',2,'2025-01-01T00:00:00Z'::timestamptz,'2025-01-01T00:00:00Z'::timestamptz FROM generate_series(1,10000)`;
    const capped = await handlers().POST(
      request("POST", { amountMinor: "1", currency: "EUR" }),
      itemId,
    );
    expect(capped.status).toBe(409);
    expect(await capped.json()).toMatchObject({ error: { code: "VALUATION_LIMIT_EXCEEDED" } });
    let calls = 0;
    const failure = {
      $transaction: async () => {
        calls++;
        throw {
          code: "P2010",
          meta: { code: "57014" },
          message: "secret SQL credential and provider URL",
        };
      },
    };
    const unavailable = createValuationRouteHandlers(
      createValuationRouteDependencies(failure, { api: { getSession: session } }, origin),
    );
    const result = await unavailable.GET(request(), itemId);
    expect(result.status).toBe(503);
    expect(result.headers.get("cache-control")).toBe("no-store");
    const text = await result.text();
    expect(text).toContain("VALUATION_UNAVAILABLE");
    expect(text).not.toContain("secret");
    expect(calls).toBe(1);
  });
});
