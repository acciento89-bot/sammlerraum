import { expect, test, type Page } from "@playwright/test";
import { createItemService } from "@sammlerraum/domain/items/item-service";
import { createPersonalMoneyService } from "@sammlerraum/domain/money/personal-money-service";
import de from "../messages/de.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import { searchFixture, cleanupSearchFixture, db, enabled, origin } from "./support/search-fixture";
const active = enabled && process.env.RUN_MONEY_UI_E2E === "1";
if (
  active &&
  !/^sammlerraum_m4_browser_[0-9]+_test$/u.test(
    new URL(process.env.DATABASE_URL ?? "").pathname.slice(1),
  )
)
  throw Error("Owned monetary UI browser database required");
test.afterAll(async () => {
  await db?.$disconnect();
});
for (const locale of ["de", "en"] as const)
  for (const known of [false, true]) {
    test(`${locale}: title-only save preserves ${known ? "known historical scale" : "unknown raw money"}`, async ({
      page,
    }) => {
      test.skip(!active, "Requires owned monetary UI test database");
      const f = await searchFixture();
      try {
        const subject = { family: "PURCHASE" as const, itemId: f.itemId };
        await createItemService(db!, f.ownerId).updateItem(f.itemId, {
          purchaseAmountMinor: 100,
          purchaseCurrency: "AFN",
        });
        const money = createPersonalMoneyService(db!, f.ownerId);
        if (known) {
          const unclassified = await money.getMoney(subject);
          await money.classifyMoney(subject, {
            expectedFactToken: unclassified.factToken,
            exponent: 0,
            unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
            evidence: {
              category: "OWNER_ATTESTATION",
              reason: "Synthetic historical record uses whole units",
            },
          });
        }
        const before = await money.getMoney(subject);
        expect(
          (
            await page.request.post("/api/auth/sign-in/email", {
              headers: { origin, "x-forwarded-for": f.ip },
              data: { email: f.email, password: f.password },
            })
          ).status(),
        ).toBe(200);
        await page.goto(`/${locale}/items/${f.itemId}`);
        const t = (locale === "de" ? de : en).ItemForm;
        const title = page.getByLabel(t.title, { exact: true });
        await expect(title).toBeVisible();
        await title.fill("Only the title changed");
        const save = page.getByRole("button", { name: t.save, exact: true });
        await expect(save).toBeEnabled();
        const response = page.waitForResponse(
          (r) =>
            r.request().method() === "PATCH" &&
            new URL(r.url()).pathname.endsWith(`/items/${f.itemId}`),
        );
        await save.click();
        expect((await response).status()).toBe(200);
        await expect(save).toBeEnabled();
        const after = await money.getMoney(subject);
        expect(after.raw).toEqual(before.raw);
        expect(after.interpretation).toEqual(before.interpretation);
        expect(after.factToken).toBe(before.factToken);
        expect(
          (await db!.collectibleItem.findUniqueOrThrow({ where: { id: f.itemId } })).title,
        ).toBe("Only the title changed");
      } finally {
        await cleanupSearchFixture(f);
      }
    });
  }

async function openHistoricalPrice(page: Page, locale: "de" | "en") {
  const f = await searchFixture();
  try {
    const subject = { family: "PURCHASE" as const, itemId: f.itemId },
      money = createPersonalMoneyService(db!, f.ownerId);
    await createItemService(db!, f.ownerId).updateItem(f.itemId, {
      purchaseAmountMinor: 100,
      purchaseCurrency: "AFN",
    });
    const raw = await money.getMoney(subject);
    await money.classifyMoney(subject, {
      expectedFactToken: raw.factToken,
      exponent: 0,
      unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
      evidence: { category: "OWNER_ATTESTATION", reason: "Synthetic historical record" },
    });
    const before = await money.getMoney(subject);
    expect(
      (
        await page.request.post("/api/auth/sign-in/email", {
          headers: { origin, "x-forwarded-for": f.ip },
          data: { email: f.email, password: f.password },
        })
      ).status(),
    ).toBe(200);
    await page.goto(`/${locale}/items/${f.itemId}`);
    const t = (locale === "de" ? de : en).ItemForm,
      m = (locale === "de" ? de : en).LegacyMoney;
    await expect(page.getByRole("button", { name: t.save, exact: true })).toBeEnabled();
    const region = page.getByRole("region", { name: t.unitPrice, exact: true });
    await region.getByRole("button", { name: m.replace, exact: true }).click();
    return { f, subject, money, before, t, m, region };
  } catch (error) {
    await cleanupSearchFixture(f);
    throw error;
  }
}
for (const locale of ["de", "en"] as const) {
  test(`${locale}: deliberate AFN correction requires confirmation and stores its own receipt`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI test database");
    const h = await openHistoricalPrice(page, locale);
    try {
      let patches = 0;
      page.on("request", (r) => {
        if (r.method() === "PATCH" && new URL(r.url()).pathname.endsWith(`/items/${h.f.itemId}`))
          patches++;
      });
      await h.region.getByLabel(h.m.newAmount, { exact: true }).fill("2");
      await h.region.getByRole("textbox", { name: h.m.reason, exact: true }).fill("Use the new acquisition record");
      await page.getByRole("button", { name: h.t.save, exact: true }).click();
      await expect(page.locator("p.error[role=alert]")).toContainText(
        locale === "de"
          ? "Bitte die Korrektur ausdrücklich bestätigen."
          : "Explicitly confirm this correction.",
      );
      expect(patches).toBe(0);
      await h.region.getByLabel(h.m.replacementAck, { exact: true }).check();
      const response = page.waitForResponse(
        (r) =>
          r.request().method() === "PATCH" &&
          new URL(r.url()).pathname.endsWith(`/items/${h.f.itemId}`),
      );
      await page.getByRole("button", { name: h.t.save, exact: true }).click();
      expect((await response).status()).toBe(200);
      await expect(page.getByRole("button", { name: h.t.save, exact: true })).toBeEnabled();
      const after = await h.money.getMoney(h.subject);
      expect(after.raw).toEqual({ amountMinor: "200", currency: "AFN" });
      expect(after.interpretation).toMatchObject({
        kind: "INTERPRETED",
        exponent: 2,
        decimal: "2.00",
      });
      expect((await h.money.listHistory(h.subject, {})).events[0]).toMatchObject({
        operation: "AUTHOR",
        reason: "Use the new acquisition record",
      });
    } finally {
      await cleanupSearchFixture(h.f);
    }
  });
  test(`${locale}: locale switch preserves exact monetary draft and original source token`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI test database");
    const h = await openHistoricalPrice(page, locale);
    try {
      await h.region.getByLabel(h.m.newAmount, { exact: true }).fill("1,23");
      await h.region.getByRole("textbox", { name: h.m.reason, exact: true }).fill("Private bilingual draft");
      await h.region.getByLabel(h.m.replacementAck, { exact: true }).check();
      const next = locale === "de" ? "en" : "de",
        shell = (locale === "de" ? de : en).Shell;
      await page
        .getByRole("link", { name: locale === "de" ? shell.english : shell.german, exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`/${next}/items/${h.f.itemId}$`));
      const mt = (next === "de" ? de : en).LegacyMoney,
        t = (next === "de" ? de : en).ItemForm;
      const region = page.getByRole("region", { name: t.unitPrice, exact: true });
      await expect(region.getByLabel(mt.newAmount, { exact: true })).toHaveValue("1,23");
      await expect(region.getByRole("textbox", { name: mt.reason, exact: true })).toHaveValue(
        "Private bilingual draft",
      );
      await expect(region.getByLabel(mt.replacementAck, { exact: true })).toBeChecked();
      expect((await h.money.getMoney(h.subject)).factToken).toBe(h.before.factToken);
    } finally {
      await cleanupSearchFixture(h.f);
    }
  });
  test(`${locale}: stale monetary draft reports conflict without rewriting the newer meaning`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI test database");
    const h = await openHistoricalPrice(page, locale);
    try {
      await h.region.getByLabel(h.m.newAmount, { exact: true }).fill("2");
      await h.region
        .getByRole("textbox", { name: h.m.reason, exact: true })
        .fill("Prepared before the competing edit");
      await h.region.getByLabel(h.m.replacementAck, { exact: true }).check();
      await h.money.classifyMoney(h.subject, {
        expectedFactToken: h.before.factToken,
        exponent: 1,
        unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
        evidence: { category: "OWNER_ATTESTATION", reason: "Newer independent record" },
      });
      const fresh = await h.money.getMoney(h.subject);
      const response = page.waitForResponse(
        (r) =>
          r.request().method() === "PATCH" &&
          new URL(r.url()).pathname.endsWith(`/items/${h.f.itemId}`),
      );
      await page.getByRole("button", { name: h.t.save, exact: true }).click();
      expect((await response).status()).toBe(409);
      await expect(page.locator("p.error[role=alert]")).toContainText(h.m.conflict);
      await expect(page.getByRole("button", { name: h.t.save, exact: true })).toBeDisabled();
      expect(await h.money.getMoney(h.subject)).toEqual(fresh);
      await page.getByRole("button", { name: h.m.checkCurrent, exact: true }).click();
      await expect(page.getByRole("button", { name: h.m.adoptCurrent, exact: true })).toBeVisible();
      await expect(h.region.getByLabel(h.m.newAmount, { exact: true })).toHaveValue("2");
      await expect(page.getByRole("button", { name: h.t.save, exact: true })).toBeDisabled();
      await page.getByRole("button", { name: h.m.adoptCurrent, exact: true }).click();
      await expect(page.getByRole("button", { name: h.t.save, exact: true })).toBeEnabled();
    } finally {
      await cleanupSearchFixture(h.f);
    }
  });
}
