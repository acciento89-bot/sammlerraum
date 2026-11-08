import { expect, test, type Page } from "@playwright/test";
import { createItemService } from "@sammlerraum/domain/items/item-service";
import { createPersonalMoneyService } from "@sammlerraum/domain/money/personal-money-service";
import de from "../messages/de.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import { searchFixture, cleanupSearchFixture, db, enabled, origin } from "./support/search-fixture";
const active =
  enabled &&
  process.env.RUN_MONEY_CONSUMERS_E2E === "1" &&
  process.env.MONEY_CANONICAL_CONSUMERS_ENABLED === "true";
if (
  active &&
  !/^sammlerraum_m4_browser_[0-9]+_test$/u.test(
    new URL(process.env.DATABASE_URL ?? "").pathname.slice(1),
  )
)
  throw Error("Owned monetary browser DB required");
test.afterAll(async () => {
  await db?.$disconnect();
});
async function setup(page: Page, raw: number, exponent: number) {
  const f = await searchFixture();
  try {
    await createItemService(db!, f.ownerId).updateItem(f.itemId, {
      purchaseAmountMinor: raw,
      purchaseCurrency: "AFN",
    });
    const money = createPersonalMoneyService(db!, f.ownerId),
      subject = { family: "PURCHASE" as const, itemId: f.itemId };
    const before = await money.getMoney(subject);
    await money.classifyMoney(subject, {
      expectedFactToken: before.factToken,
      exponent,
      unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
      evidence: { category: "OWNER_ATTESTATION", reason: "Synthetic stored scale" },
    });
    await createItemService(db!, f.ownerId).createItem({
      collectionId: f.collectionId,
      title: "Missing price synthetic",
      quantity: 2,
    });
    expect(
      (
        await page.request.post("/api/auth/sign-in/email", {
          headers: { origin, "x-forwarded-for": f.ip },
          data: { email: f.email, password: f.password },
        })
      ).status(),
    ).toBe(200);
    const capabilities = await page.request.get("/api/v1/money/capabilities");
    expect(capabilities.status()).toBe(200);
    expect(await capabilities.json()).toMatchObject({ canonicalConsumers: true });
    return f;
  } catch (error) {
    await cleanupSearchFixture(f);
    throw error;
  }
}
async function panel(page: Page, locale: "de" | "en") {
  const button = page.getByRole("button", {
    name: locale === "de" ? "Filter öffnen" : "Open filters",
    exact: true,
  });
  if ((page.viewportSize()?.width ?? 1440) <= 704) {
    await expect(button).toBeVisible();
    await button.click();
  }
}
for (const locale of ["de", "en"] as const) {
  const messages = locale === "de" ? de : en,
    t = messages.Search,
    d = messages.Dashboard;
  test(`${locale}: exact quantity subtotal and usable purchase range retain historical scale`, async ({
    page,
  }) => {
    test.skip(!active, "Requires explicit consumer rollout in owned test DB");
    const f = await setup(page, 100, 0);
    try {
      await page.goto(`/${locale}/dashboard`);
      const costs = page.getByTestId("dashboard-purchase-costs");
      await expect(costs).toBeVisible();
      await expect(costs.getByTestId("purchase-cost-state")).toHaveText(d.purchaseStates.PARTIAL);
      await expect(costs).toContainText("300 AFN");
      await expect(costs).toContainText(d.purchasePartialHelp);
      await expect(costs).not.toContainText(d.purchaseStates.COMPLETE);
      await page.goto(`/${locale}/search`);
      await panel(page, locale);
      await page.getByRole("button", { name: t.addCondition, exact: true }).click();
      await page.getByLabel(t.family, { exact: true }).selectOption("purchaseMoney");
      await page.getByLabel(t.operator, { exact: true }).selectOption("range");
      await page.getByLabel(t.currency, { exact: true }).selectOption("AFN");
      await page.getByLabel(t.minimum, { exact: true }).fill("100");
      await page.getByLabel(t.maximum, { exact: true }).fill("100");
      const result = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/v1/search/items" && r.request().method() === "POST",
      );
      await page.getByRole("button", { name: t.apply, exact: true }).click();
      const response = await result;
      expect(response.status()).toBe(200);
      expect((await response.json()).total).toBe(1);
      await expect(
        page.getByRole("link", { name: "Synthetic untagged card", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Missing price synthetic", exact: true }),
      ).toHaveCount(0);
      await db!
        .$queryRaw`UPDATE "CollectibleItem" SET "purchaseAmountMinor"="purchaseAmountMinor" WHERE id=${f.itemId}::uuid RETURNING id`;
      await panel(page, locale);
      const refused = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/v1/search/items" && r.request().method() === "POST",
      );
      await page.getByRole("button", { name: t.apply, exact: true }).click();
      const unavailable = await refused;
      expect(unavailable.status()).toBe(422);
      const text = await unavailable.text();
      expect(JSON.parse(text)).toMatchObject({ error: { code: "FILTER_UNAVAILABLE" } });
      expect(text).not.toContain("unknownPaths");
    } finally {
      await cleanupSearchFixture(f);
    }
  });
  test(`${locale}: known zero is shown as an evidenced subtotal instead of missing or complete`, async ({
    page,
  }) => {
    test.skip(!active, "Requires explicit consumer rollout in owned test DB");
    const f = await setup(page, 0, 2);
    try {
      await page.goto(`/${locale}/dashboard`);
      const costs = page.getByTestId("dashboard-purchase-costs");
      await expect(costs).toBeVisible();
      await expect(costs.getByTestId("purchase-cost-state")).toHaveText(d.purchaseStates.PARTIAL);
      await expect(costs).toContainText(locale === "de" ? "0,00 AFN" : "0.00 AFN");
      await expect(costs).not.toContainText(d.purchaseStates.NO_PRICES);
      await expect(costs).not.toContainText(d.purchaseStates.COMPLETE);
    } finally {
      await cleanupSearchFixture(f);
    }
  });
}
