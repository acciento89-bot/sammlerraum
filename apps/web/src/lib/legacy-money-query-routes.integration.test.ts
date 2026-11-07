import { DashboardDataSchema } from "@sammlerraum/contracts/dashboard";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createPersonalMoneyService } from "@sammlerraum/domain/money/personal-money-service";
import {
  createItemSearchRouteDependencies,
  createItemSearchRouteHandlers,
} from "./item-search-routes";
import { createDashboardRouteDependencies, createDashboardRouteHandlers } from "./dashboard-routes";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1",
  origin = "https://example.invalid";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
const filter = {
  version: 1,
  root: {
    kind: "purchaseMoney",
    test: {
      op: "range",
      unit: { currency: "AFN", minorUnitExponent: 2, unitKey: "iso4217-2026-09-17:AFN" },
      minMinor: "100",
    },
  },
};
async function fixture() {
  const owner = randomUUID();
  await db.user.create({
    data: { id: owner, name: "Synthetic query owner", email: `${owner}@example.invalid` },
  });
  const c = await db.collection.create({ data: { ownerId: owner, name: "Private prices" } });
  const known = await db.collectibleItem.create({
    data: {
      ownerId: owner,
      collectionId: c.id,
      title: "Needle",
      purchaseAmountMinor: 100,
      purchaseCurrency: "AFN",
      quantity: 2,
    },
  });
  const money = createPersonalMoneyService(db, owner),
    subject = { family: "PURCHASE" as const, itemId: known.id },
    view = await money.getMoney(subject);
  await money.classifyMoney(subject, {
    expectedFactToken: view.factToken,
    exponent: 2,
    unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
    evidence: {
      category: "OWNER_ATTESTATION",
      reason: "Private synthetic receipt",
      reference: "private-query-fixture",
    },
  });
  const getSession = vi.fn(async () => ({ user: { id: owner } })),
    auth = { api: { getSession } };
  const search = createItemSearchRouteHandlers(
    createItemSearchRouteDependencies(db, auth, origin, { canonicalMoneyEnabled: true }),
  );
  const dashboard = createDashboardRouteHandlers(
    createDashboardRouteDependencies(db, auth, origin, { canonicalMoneyEnabled: true }),
  );
  return { owner, c, known, getSession, search, dashboard };
}
const request = (path: string, body: unknown) =>
  new Request(origin + path, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
describe.runIf(enabled)("real canonical-money private query transport", () => {
  beforeAll(async () => {
    isolated = await createLegacyMoneyTestSchema();
    db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
  });
  afterAll(async () => {
    await db?.$disconnect();
    await isolated?.cleanup();
  });
  it("returns only generic unavailability without rows/counts/receipts when an outer price is unknown", async () => {
    const f = await fixture();
    await db.collectibleItem.create({
      data: {
        ownerId: f.owner,
        collectionId: f.c.id,
        title: "Nonmatching",
        purchaseAmountMinor: 500,
        purchaseCurrency: "AFN",
      },
    });
    const response = await f.search.POST(
      request("/api/v1/search/items/query", {
        text: "Needle",
        f: JSON.stringify(filter),
        limit: 1,
      }),
    );
    expect(response.status).toBe(422);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ error: { code: "FILTER_UNAVAILABLE" } });
    for (const secret of [
      "unknownPaths",
      "selectedItems",
      "private-query-fixture",
      "Private synthetic receipt",
      "originId",
      "nextCursor",
      "items",
    ])
      expect(text).not.toContain(secret);
    expect(f.getSession).toHaveBeenCalledWith(
      expect.objectContaining({ query: { disableCookieCache: true, disableRefresh: true } }),
    );
  });
  it("exposes only authenticated own cost coverage and exact aggregates through real dashboard POST", async () => {
    const f = await fixture(),
      foreign = await fixture();
    await db.collectibleItem.create({
      data: {
        ownerId: foreign.owner,
        collectionId: foreign.c.id,
        title: "Foreign unresolved",
        purchaseAmountMinor: 1,
        purchaseCurrency: "AFN",
      },
    });
    const response = await f.dashboard.POST(request("/api/v1/dashboard/query", { text: "Needle" }));
    expect(response.status).toBe(200);
    const body = DashboardDataSchema.parse(await response.json());
    expect(body.purchaseTotals).toMatchObject({
      state: "COMPLETE",
      coverage: { selectedItems: 1, selectedUnits: "2", unknownPaths: 0 },
      groups: [{ totalMinor: "200" }],
    });
    const text = JSON.stringify(body);
    for (const secret of [
      foreign.owner,
      "private-query-fixture",
      "Private synthetic receipt",
      "evidenceReference",
    ])
      expect(text).not.toContain(secret);
  });
  it("rejects body-supplied owner and rollout claims instead of treating them as authority", async () => {
    const f = await fixture();
    const response = await f.search.POST(
      request("/api/v1/search/items/query", {
        f: JSON.stringify(filter),
        ownerId: f.owner,
        canonicalMoneyEnabled: true,
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(f.owner);
  });
});
