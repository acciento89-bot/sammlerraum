import { ItemMoneyResultSchema } from "@sammlerraum/contracts/personal-money";
import { MoneyViewSchema } from "@sammlerraum/contracts/legacy-money";
import { expect, test } from "@playwright/test";
import {
  PersonalMilestoneDtoSchema,
  PersonalMilestonePageSchema,
} from "@sammlerraum/contracts/personal-milestones";
import { searchFixture, cleanupSearchFixture, db, enabled, origin } from "./support/search-fixture";
test.afterAll(async () => {
  await db?.$disconnect();
});
test("actual Next milestone HTTP routes enforce private cookie-authenticated CRUD", async ({
  page,
  context,
}) => {
  test.skip(!enabled, "Requires guarded auth database");
  const f = await searchFixture();
  try {
    const signed = await page.request.post("/api/auth/sign-in/email", {
      headers: { origin, "x-forwarded-for": f.ip },
      data: { email: f.email, password: f.password },
    });
    expect(signed.status()).toBe(200);
    await db!.personalMilestone.create({
      data: {
        ownerId: f.foreignId,
        title: "Foreign private milestone sentinel",
        milestoneDate: new Date("2026-11-05T00:00:00.000Z"),
      },
    });
    const created = await page.request.post("/api/v1/dashboard/milestones", {
      headers: { origin },
      data: { title: "  HTTP Café  ", milestoneDate: "0001-01-01" },
    });
    expect(created.status()).toBe(201);
    expect(created.headers()["cache-control"]).toBe("no-store");
    expect(created.headers()["x-request-id"]).toBeTruthy();
    const saved = PersonalMilestoneDtoSchema.parse(await created.json());
    expect(saved).toMatchObject({
      title: "HTTP Café",
      milestoneDate: "0001-01-01",
      revision: 1,
      dateBasis: "OWNER_ENTERED",
    });
    const listed = await page.request.post("/api/v1/dashboard/milestones/query", {
      headers: { origin },
      data: { limit: 5 },
    });
    expect(listed.status()).toBe(200);
    const actual = PersonalMilestonePageSchema.parse(await listed.json());
    expect(actual.total).toBe(1);
    expect(actual.items).toEqual([saved]);
    const foreign = await db!.personalMilestone.findFirstOrThrow({
      where: { ownerId: f.foreignId },
    });
    const denied = await page.request.patch(`/api/v1/dashboard/milestones/${foreign.id}`, {
      headers: { origin },
      data: { title: "Must not replace", milestoneDate: "2026-11-05", expectedRevision: 1 },
    });
    expect(denied.status()).toBe(404);
    expect(await denied.text()).not.toContain(foreign.title);
    const updated = await page.request.patch(`/api/v1/dashboard/milestones/${saved.id}`, {
      headers: { origin },
      data: {
        title: "Edited through actual HTTP",
        milestoneDate: "9999-12-31",
        expectedRevision: 1,
      },
    });
    expect(updated.status()).toBe(200);
    expect(PersonalMilestoneDtoSchema.parse(await updated.json())).toMatchObject({
      id: saved.id,
      title: "Edited through actual HTTP",
      milestoneDate: "9999-12-31",
      revision: 2,
    });
    const stale = await page.request.patch(`/api/v1/dashboard/milestones/${saved.id}`, {
      headers: { origin },
      data: { title: "Stale write", milestoneDate: "2026-11-05", expectedRevision: 1 },
    });
    expect(stale.status()).toBe(409);
    expect((await page.request.get("/api/v1/dashboard/milestones")).status()).toBe(405);
    const removed = await page.request.delete(`/api/v1/dashboard/milestones/${saved.id}`, {
      headers: { origin },
      data: { expectedRevision: 2 },
    });
    expect(removed.status()).toBe(200);
    expect(await db!.personalMilestone.findUnique({ where: { id: saved.id } })).toBeNull();
    const empty = await page.request.post("/api/v1/dashboard/milestones/query", {
      headers: { origin },
      data: {},
    });
    expect(PersonalMilestonePageSchema.parse(await empty.json()).total).toBe(0);
    const wrongOrigin = await page.request.post("/api/v1/dashboard/milestones/query", {
      headers: { origin: "https://foreign.invalid" },
      data: {},
    });
    expect(wrongOrigin.status()).toBe(403);
    await context.clearCookies();
    const loggedOut = await page.request.post("/api/v1/dashboard/milestones/query", {
      headers: { origin },
      data: {},
    });
    expect(loggedOut.status()).toBe(401);
    expect(await loggedOut.text()).not.toContain(saved.title);
  } finally {
    await cleanupSearchFixture(f);
  }
});

test("actual Next money paths enforce authoring custom classifications and historical revocation", async ({
  page,
  context,
}) => {
  test.skip(!enabled, "Requires guarded auth database");
  const f = await searchFixture();
  const authoring = (decimal: string, currency = "AFN") => ({
    kind: "DECIMAL",
    profileId: "legacy-money-iso-2026-09-17-v1",
    currency,
    decimal,
  });
  try {
    expect(
      (
        await page.request.post("/api/auth/sign-in/email", {
          headers: { origin, "x-forwarded-for": f.ip },
          data: { email: f.email, password: f.password },
        })
      ).status(),
    ).toBe(200);
    const created = await page.request.post("/api/v1/money/items", {
      headers: { origin },
      data: {
        schemaVersion: 1,
        item: { collectionId: f.collectionId, title: "Native HTTP money" },
        purchase: { op: "NEW", authoring: authoring("1") },
      },
    });
    expect(created.status()).toBe(201);
    expect(created.headers()["cache-control"]).toBe("no-store");
    const item = ItemMoneyResultSchema.parse(await created.json()),
      id = item.item.id;
    expect((await page.request.get(`/api/v1/money/items/${id}`)).status()).toBe(200);
    const classified = await page.request.post(
      `/api/v1/items/${id}/money/purchase/classifications`,
      {
        headers: { origin },
        data: {
          expectedFactToken: item.purchase.factToken,
          exponent: 0,
          unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
          evidence: { category: "OWNER_ATTESTATION", reason: "Observed HTTP units" },
        },
      },
    );
    expect(classified.status()).toBe(201);
    const old = MoneyViewSchema.parse((await classified.json()).money);
    const replaced = await page.request.patch(`/api/v1/money/items/${id}`, {
      headers: { origin },
      data: {
        schemaVersion: 1,
        purchase: {
          op: "REPLACE",
          expectedFactToken: old.factToken,
          authoring: authoring("2"),
          correctionReason: "Native HTTP correction",
        },
      },
    });
    expect(replaced.status()).toBe(200);
    const purchaseHistory = await page.request.get(
      `/api/v1/items/${id}/money/purchase/classifications`,
    );
    expect(purchaseHistory.status()).toBe(200);
    const history = await purchaseHistory.json();
    expect(history.events[0].reason).toBe("Native HTTP correction");
    const older = history.events.find((e: { operation: string }) => e.operation === "CLASSIFY");
    expect(
      (
        await page.request.post(`/api/v1/items/${id}/money/purchase/revocations`, {
          headers: { origin },
          data: {
            assertionId: older.id,
            expectedAssertionToken: older.expectedAssertionToken,
            reason: "Revoke older HTTP decision",
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      ItemMoneyResultSchema.parse(
        await (await page.request.get(`/api/v1/money/items/${id}`)).json(),
      ).purchase.interpretation,
    ).toMatchObject({ kind: "INTERPRETED", exponent: 2, decimal: "2.00" });
    const definition = await db!.customFieldDefinition.create({
      data: {
        collectionId: f.collectionId,
        name: "HTTP money field",
        normalizedName: "http money field",
        type: "MONEY",
      },
    });
    const bulk = await page.request.get(`/api/v1/items/${id}/money?fields=${definition.id}`);
    expect(bulk.status()).toBe(200);
    const absent = MoneyViewSchema.parse((await bulk.json()).custom[0]);
    const custom = await page.request.put(
      `/api/v1/money/items/${id}/custom-fields/${definition.id}`,
      {
        headers: { origin },
        data: {
          schemaVersion: 1,
          intent: {
            op: "REPLACE",
            expectedFactToken: absent.factToken,
            authoring: authoring("1.25", "EUR"),
          },
        },
      },
    );
    expect(custom.status()).toBe(200);
    const current = MoneyViewSchema.parse((await custom.json()).money);
    expect(
      (
        await page.request.post(
          `/api/v1/items/${id}/money/custom/${definition.id}/classifications`,
          {
            headers: { origin },
            data: {
              expectedFactToken: current.factToken,
              exponent: 2,
              unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:EUR" },
              evidence: { category: "OWNER_ATTESTATION", reason: "Custom HTTP decision" },
            },
          },
        )
      ).status(),
    ).toBe(201);
    const customHistory = await page.request.get(
      `/api/v1/items/${id}/money/custom/${definition.id}/classifications`,
    );
    expect(customHistory.status()).toBe(200);
    const decision = (await customHistory.json()).events[0];
    expect(
      (
        await page.request.post(`/api/v1/items/${id}/money/custom/${definition.id}/revocations`, {
          headers: { origin },
          data: {
            assertionId: decision.id,
            expectedAssertionToken: decision.expectedAssertionToken,
            reason: "Revoke custom HTTP decision",
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await (await page.request.get(`/api/v1/items/${id}/money?fields=${definition.id}`)).json())
        .custom[0].interpretation,
    ).toEqual({ kind: "UNKNOWN", reason: "REVOKED" });
    await context.clearCookies();
    expect((await page.request.get(`/api/v1/money/items/${id}`)).status()).toBe(401);
  } finally {
    await cleanupSearchFixture(f);
  }
});
