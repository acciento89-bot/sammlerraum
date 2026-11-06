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

async function openHistoricalPrice(
  page: Page,
  locale: "de" | "en",
  options: { edit?: boolean; longText?: boolean } = {},
) {
  const f = await searchFixture();
  try {
    const subject = { family: "PURCHASE" as const, itemId: f.itemId },
      money = createPersonalMoneyService(db!, f.ownerId);
    await createItemService(db!, f.ownerId).updateItem(f.itemId, {
      purchaseAmountMinor: 100,
      purchaseCurrency: "AFN",
      ...(options.longText
        ? { publicDescription: "p".repeat(9000), privateNotes: "n".repeat(9000) }
        : {}),
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
    if (options.edit !== false)
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
      await h.region
        .getByRole("textbox", { name: h.m.reason, exact: true })
        .fill("Use the new acquisition record");
      await page.getByRole("button", { name: h.t.save, exact: true }).click();
      await expect(page.locator("p.error[role=alert]")).toContainText(
        locale === "de"
          ? "Bitte die Korrektur ausdrücklich bestätigen."
          : "Explicitly confirm this correction.",
      );
      expect(patches).toBe(0);
      await h.region.getByLabel(h.m.replacementAck, { exact: true }).check();
      await page.screenshot({
        path: test.info().outputPath("money-replacement.png"),
        fullPage: true,
      });
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
      await h.region
        .getByRole("textbox", { name: h.m.reason, exact: true })
        .fill("Private bilingual draft");
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
      await page.screenshot({ path: test.info().outputPath("money-conflict.png"), fullPage: true });
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

for (const locale of ["de", "en"] as const) {
  test(`${locale}: legal long existing texts do not block a title-only monetary form save`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI test database");
    const h = await openHistoricalPrice(page, locale, { edit: false, longText: true });
    try {
      await page.getByLabel(h.t.title, { exact: true }).fill("A short title correction");
      const response = page.waitForResponse(
        (r) =>
          r.request().method() === "PATCH" &&
          new URL(r.url()).pathname.endsWith(`/items/${h.f.itemId}`),
      );
      await page.getByRole("button", { name: h.t.save, exact: true }).click();
      expect((await response).status()).toBe(200);
      await expect(page.getByRole("button", { name: h.t.save, exact: true })).toBeEnabled();
      const item = await db!.collectibleItem.findUniqueOrThrow({ where: { id: h.f.itemId } });
      expect(item.publicDescription).toHaveLength(9000);
      expect(item.privateNotes).toHaveLength(9000);
      expect(item.title).toBe("A short title correction");
      expect((await h.money.getMoney(h.subject)).factToken).toBe(h.before.factToken);
    } finally {
      await cleanupSearchFixture(h.f);
    }
  });
  test(`${locale}: disabled authoring profile explains read-only state and retains the stored display`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI test database");
    const h = await openHistoricalPrice(page, locale, { edit: false });
    try {
      const capability = await (await page.request.get("/api/v1/money/capabilities")).json();
      await page.route("**/api/v1/money/capabilities", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...capability, authoringProfiles: [] }),
        }),
      );
      await page.reload();
      await expect(page.getByRole("button", { name: h.t.save, exact: true })).toBeDisabled();
      await expect(
        page.locator('p.notice[role="status"]').filter({ hasText: h.m.disabled }),
      ).toBeVisible();
      await expect(h.region.getByText("100 AFN", { exact: true })).toBeVisible();
      expect((await h.money.getMoney(h.subject)).factToken).toBe(h.before.factToken);
    } finally {
      await cleanupSearchFixture(h.f);
    }
  });
  test(`${locale}: metadata-only save still commits tags while retaining the purchase receipt`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI test database");
    const h = await openHistoricalPrice(page, locale, { edit: false });
    try {
      await page.locator('input[name="tags"]').fill("a-new-private-tag");
      const tags = page.waitForResponse(
        (r) =>
          r.request().method() === "PUT" &&
          new URL(r.url()).pathname.endsWith(`/items/${h.f.itemId}/tags`),
      );
      await page.getByRole("button", { name: h.t.save, exact: true }).click();
      expect((await tags).status()).toBe(200);
      await expect(page.getByRole("button", { name: h.t.save, exact: true })).toBeEnabled();
      const current = await (await page.request.get(`/api/v1/items/${h.f.itemId}`)).json();
      expect(current.metadata.tags).toContain("a-new-private-tag");
      expect((await h.money.getMoney(h.subject)).factToken).toBe(h.before.factToken);
    } finally {
      await cleanupSearchFixture(h.f);
    }
  });
}

for (const locale of ["de", "en"] as const) {
  test(`${locale}: title-only save preserves a custom MONEY field's historical receipt`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI test database");
    const f = await searchFixture();
    try {
      const { createCustomFieldService } = await import(
        "@sammlerraum/domain/custom-fields/custom-field-service"
      );
      const custom = createCustomFieldService(db!, f.ownerId);
      const field = await custom.createFieldDefinition({
        collectionId: f.collectionId,
        name: "Historical custom price",
        type: "MONEY",
      });
      await custom.setFieldValue(f.itemId, field.id, { amountMinor: 100, currency: "AFN" });
      const money = createPersonalMoneyService(db!, f.ownerId),
        subject = { family: "CUSTOM" as const, itemId: f.itemId, fieldDefinitionId: field.id };
      const raw = await money.getMoney(subject);
      await money.classifyMoney(subject, {
        expectedFactToken: raw.factToken,
        exponent: 0,
        unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
        evidence: { category: "OWNER_ATTESTATION", reason: "Synthetic historical custom value" },
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
      const t = (locale === "de" ? de : en).ItemForm;
      const save = page.getByRole("button", { name: t.save, exact: true });
      await expect(save).toBeEnabled();
      await page.getByLabel(t.title, { exact: true }).fill("Changed title with custom receipt");
      const response = page.waitForResponse(
        (r) =>
          r.request().method() === "PATCH" &&
          new URL(r.url()).pathname.endsWith(`/items/${f.itemId}`),
      );
      await save.click();
      expect((await response).status()).toBe(200);
      await expect(save).toBeEnabled();
      expect((await money.getMoney(subject)).factToken).toBe(before.factToken);
      await expect(
        page.getByRole("region", { name: field.name, exact: true }).getByRole("status").first(),
      ).toContainText("100 AFN");
    } finally {
      await cleanupSearchFixture(f);
    }
  });
}

async function customPriceFixture(page: Page, locale: "de" | "en", count = 1, newItem = false) {
  const f = await searchFixture();
  try {
    const { createCustomFieldService } = await import(
      "@sammlerraum/domain/custom-fields/custom-field-service"
    );
    const custom = createCustomFieldService(db!, f.ownerId),
      money = createPersonalMoneyService(db!, f.ownerId);
    const fields = [];
    for (let i = 0; i < count; i++) {
      const field = await custom.createFieldDefinition({
        collectionId: f.collectionId,
        name: `Custom price ${i + 1}`,
        type: "MONEY",
      });
      if (!newItem) {
        await custom.setFieldValue(f.itemId, field.id, { amountMinor: 100, currency: "AFN" });
        const subject = {
          family: "CUSTOM" as const,
          itemId: f.itemId,
          fieldDefinitionId: field.id,
        };
        const raw = await money.getMoney(subject);
        await money.classifyMoney(subject, {
          expectedFactToken: raw.factToken,
          exponent: 0,
          unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
          evidence: { category: "OWNER_ATTESTATION", reason: "Synthetic historical custom price" },
        });
      }
      fields.push(field);
    }
    expect(
      (
        await page.request.post("/api/auth/sign-in/email", {
          headers: { origin, "x-forwarded-for": f.ip },
          data: { email: f.email, password: f.password },
        })
      ).status(),
    ).toBe(200);
    await page.goto(
      newItem
        ? `/${locale}/items/new?collectionId=${f.collectionId}`
        : `/${locale}/items/${f.itemId}`,
    );
    const t = (locale === "de" ? de : en).ItemForm,
      m = (locale === "de" ? de : en).LegacyMoney;
    await expect(page.getByRole("button", { name: t.save, exact: true })).toBeEnabled();
    return { f, fields, money, t, m };
  } catch (error) {
    await cleanupSearchFixture(f);
    throw error;
  }
}
for (const locale of ["de", "en"] as const) {
  test(`${locale}: custom replacement acknowledges each field before a later uncertain result and never replays the first`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI test database");
    const { f, fields, money, t, m } = await customPriceFixture(page, locale, 2);
    try {
      for (const field of fields) {
        const region = page.getByRole("region", { name: field.name, exact: true });
        await region.getByRole("button", { name: m.replace, exact: true }).click();
        await region.getByRole("textbox", { name: m.newAmount, exact: true }).fill("2");
        await region
          .getByRole("textbox", { name: m.reason, exact: true })
          .fill("Synthetic deliberate custom correction");
        await region.getByRole("checkbox").check();
      }
      const secondPath = `/api/v1/money/items/${f.itemId}/custom-fields/${fields[1]!.id}`;
      await page.route(`**${secondPath}`, (route) =>
        route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
      );
      const save = page.getByRole("button", { name: t.save, exact: true });
      await save.click();
      await expect(page.locator('p.error[role="alert"]')).toContainText(fields[1]!.name);
      await expect(save).toBeDisabled();
      const firstSubject = {
        family: "CUSTOM" as const,
        itemId: f.itemId,
        fieldDefinitionId: fields[0]!.id,
      };
      const first = await money.getMoney(firstSubject);
      expect(first.raw).toEqual({ amountMinor: "200", currency: "AFN" });
      expect(first.interpretation).toMatchObject({
        kind: "INTERPRETED",
        exponent: 2,
        decimal: "2.00",
      });
      const firstRegion = page.getByRole("region", { name: fields[0]!.name, exact: true });
      await expect(firstRegion.getByRole("button", { name: m.replace, exact: true })).toBeVisible();
      const secondShell = page
        .getByRole("region", { name: fields[1]!.name, exact: true })
        .locator("..");
      await secondShell.getByRole("button", { name: m.checkCurrent, exact: true }).click();
      await expect(save).toBeDisabled();
      await secondShell.getByRole("button", { name: m.adoptCurrent, exact: true }).click();
      await expect(save).toBeEnabled();
      await page.unroute(`**${secondPath}`);
      await page
        .getByLabel(t.title, { exact: true })
        .fill("Retry keeps acknowledged custom receipt");
      const response = page.waitForResponse(
        (r) =>
          r.request().method() === "PATCH" &&
          new URL(r.url()).pathname.endsWith(`/items/${f.itemId}`),
      );
      await save.click();
      expect((await response).status()).toBe(200);
      await expect(save).toBeEnabled();
      expect((await money.getMoney(firstSubject)).factToken).toBe(first.factToken);
    } finally {
      await cleanupSearchFixture(f);
    }
  });

  test(`${locale}: a new item binds its custom amount to actual absence without duplicate creation`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI test database");
    const { f, fields, money, t } = await customPriceFixture(page, locale, 1, true);
    try {
      await page.getByLabel(t.title, { exact: true }).fill("New item with explicit custom money");
      const region = page.getByRole("region", { name: fields[0]!.name, exact: true });
      await region.getByRole("textbox", { name: fields[0]!.name, exact: true }).fill("1,25");
      const save = page.getByRole("button", { name: t.save, exact: true });
      const response = page.waitForResponse(
        (r) =>
          r.request().method() === "POST" && new URL(r.url()).pathname === "/api/v1/money/items",
      );
      await save.click();
      const created = await response;
      expect(created.status()).toBe(201);
      const result = await created.json();
      await expect(page).toHaveURL(new RegExp(`/${locale}/items/${result.item.id}$`));
      await expect(save).toBeEnabled();
      const actual = await money.getMoney({
        family: "CUSTOM",
        itemId: result.item.id,
        fieldDefinitionId: fields[0]!.id,
      });
      expect(actual.raw).toEqual({ amountMinor: "125", currency: "EUR" });
      expect(actual.interpretation).toMatchObject({
        kind: "INTERPRETED",
        decimal: "1.25",
        exponent: 2,
      });
      expect(
        await db!.collectibleItem.count({
          where: { collectionId: f.collectionId, title: "New item with explicit custom money" },
        }),
      ).toBe(1);
    } finally {
      await cleanupSearchFixture(f);
    }
  });
}

for (const locale of ["de", "en"] as const) {
  test(`${locale}: a pending committed core write cannot be abandoned by a locale click`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI test database");
    const h = await openHistoricalPrice(page, locale, { edit: false });
    const activeRequests = new Set<string>();
    page.on("request", (request) => activeRequests.add(request.method() + " " + request.url()));
    page.on("requestfinished", (request) =>
      activeRequests.delete(request.method() + " " + request.url()),
    );
    page.on("requestfailed", (request) =>
      activeRequests.delete(request.method() + " " + request.url()),
    );
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let committed!: () => void;
    const committedSignal = new Promise<void>((resolve) => {
      committed = resolve;
    });
    try {
      await page.route(`**/api/v1/money/items/${h.f.itemId}`, async (route) => {
        if (route.request().method() !== "PATCH") return route.continue();
        const response = await route.fetch();
        committed();
        await held;
        await route.fulfill({ response });
      });
      await page.getByLabel(h.t.title, { exact: true }).fill("Held committed acknowledgment");
      await page.getByRole("button", { name: h.t.save, exact: true }).click();
      await committedSignal;
      const shell = (locale === "de" ? de : en).Shell;
      await page
        .getByRole("link", { name: locale === "de" ? shell.english : shell.german, exact: true })
        .click();
      // Observe the entire held-response interval, rather than an immediate old-route assertion.
      const escaped = await page
        .waitForURL(new RegExp(`/${locale === "de" ? "en" : "de"}/items/${h.f.itemId}$`), {
          timeout: 1200,
        })
        .then(
          () => true,
          () => false,
        );
      expect(escaped).toBe(false);
      await expect(page).toHaveURL(new RegExp(`/${locale}/items/${h.f.itemId}$`));
      await expect(page.getByRole("button", { name: h.t.saving, exact: true })).toBeDisabled();
      release();
      await expect(page.getByRole("button", { name: h.t.save, exact: true })).toBeEnabled();
      await expect.poll(() => [...activeRequests], { timeout: 2500 }).toEqual([]);
      await page.waitForLoadState("networkidle", { timeout: 5000 });
    } finally {
      release();
      await cleanupSearchFixture(h.f);
    }
  });
}

for (const locale of ["de", "en"] as const) {
  test(`${locale}: documenting a historical purchase changes only its evidenced meaning, not the raw amount`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI test database");
    const h = await openHistoricalPrice(page, locale, { edit: false });
    try {
      await h.region
        .getByRole("button", { name: h.m.review, exact: true })
        .click({ timeout: 2500 });
      const review = page.getByRole("region", { name: h.m.review, exact: true });
      await expect(review).toBeVisible();
      await review
        .getByRole("textbox", {
          name: locale === "de" ? "Belegte Dezimalstellen" : "Evidenced decimal places",
          exact: true,
        })
        .fill("2");
      await review
        .getByRole("combobox", {
          name: locale === "de" ? "Bedeutung der Währung" : "Currency meaning",
          exact: true,
        })
        .selectOption("SUPPORTED");
      await review
        .getByRole("combobox", {
          name: locale === "de" ? "Art des Belegs" : "Evidence category",
          exact: true,
        })
        .selectOption("OWNER_ATTESTATION");
      await review
        .getByRole("textbox", {
          name: locale === "de" ? "Begründung des Belegs" : "Evidence reason",
          exact: true,
        })
        .fill("Synthetic private historical clarification");
      await review.getByRole("checkbox").first().check();
      await review
        .getByRole("button", {
          name: locale === "de" ? "Bedeutung bestätigen" : "Confirm meaning",
          exact: true,
        })
        .click();
      await expect(
        review.getByRole("button", {
          name: locale === "de" ? "Bedeutung bestätigen" : "Confirm meaning",
          exact: true,
        }),
      ).toBeDisabled();
      await expect(h.region.getByRole("status").first()).toContainText(
        locale === "de" ? "1,00 AFN" : "1.00 AFN",
      );
      const after = await h.money.getMoney(h.subject);
      expect(after.raw).toEqual(h.before.raw);
      expect(after.factToken).not.toBe(h.before.factToken);
      expect(after.interpretation).toMatchObject({
        kind: "INTERPRETED",
        exponent: 2,
        decimal: "1.00",
        evidenceCategory: "OWNER_ATTESTATION",
      });
      const history = await h.money.listHistory(h.subject, {});
      expect(history.events[0]!.reason).toBe("Synthetic private historical clarification");
      await page.waitForLoadState("networkidle");
    } finally {
      await cleanupSearchFixture(h.f);
    }
  });
}

async function editReview(page: Page, locale: "de" | "en") {
  const m = (locale === "de" ? de : en).LegacyMoney;
  const review = page.getByRole("region", { name: m.review, exact: true });
  await review.getByRole("textbox", { name: m.scale, exact: true }).fill("2");
  await review
    .getByRole("combobox", { name: m.unitMeaning, exact: true })
    .selectOption("SUPPORTED");
  await review
    .getByRole("combobox", { name: m.evidenceCategory, exact: true })
    .selectOption("OWNER_ATTESTATION");
  await review
    .getByRole("textbox", { name: m.evidenceReason, exact: true })
    .fill("Synthetic explicit evidence draft");
  await review.getByRole("checkbox").first().check();
  return { review, m };
}
for (const locale of ["de", "en"] as const) {
  test(`${locale}: historical evidence draft survives locale navigation with its original fact precondition`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI test database");
    const h = await openHistoricalPrice(page, locale, { edit: false });
    try {
      await h.region.getByRole("button", { name: h.m.review, exact: true }).click();
      await editReview(page, locale);
      const next = locale === "de" ? "en" : "de",
        shell = (locale === "de" ? de : en).Shell,
        m = (next === "de" ? de : en).LegacyMoney;
      await page
        .getByRole("link", { name: locale === "de" ? shell.english : shell.german, exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`/${next}/items/${h.f.itemId}$`));
      const review = page.getByRole("region", { name: m.review, exact: true });
      await expect(review).toBeVisible();
      await expect(review.getByRole("textbox", { name: m.scale, exact: true })).toHaveValue("2");
      await expect(
        review.getByRole("textbox", { name: m.evidenceReason, exact: true }),
      ).toHaveValue("Synthetic explicit evidence draft");
      await expect(review.getByRole("checkbox").first()).toBeChecked();
      expect((await h.money.getMoney(h.subject)).factToken).toBe(h.before.factToken);
      await review.getByRole("button", { name: m.confirmMeaning, exact: true }).click();
      await expect(review.getByText(m.savedSeparately, { exact: true })).toBeVisible();
      expect((await h.money.getMoney(h.subject)).interpretation).toMatchObject({
        kind: "INTERPRETED",
        exponent: 2,
      });
      await page.waitForLoadState("networkidle", { timeout: 5000 });
    } finally {
      await cleanupSearchFixture(h.f);
    }
  });
  test(`${locale}: a competing historical classification blocks stale evidence until explicit inspection and adoption`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI test database");
    const h = await openHistoricalPrice(page, locale, { edit: false });
    try {
      await h.region.getByRole("button", { name: h.m.review, exact: true }).click();
      const { review, m } = await editReview(page, locale);
      const newer = await h.money.classifyMoney(h.subject, {
        expectedFactToken: h.before.factToken,
        exponent: 1,
        unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
        evidence: { category: "OWNER_ATTESTATION", reason: "Competing actual historical evidence" },
      });
      await review.getByRole("button", { name: m.confirmMeaning, exact: true }).click();
      await expect(review.getByText(m.conflict, { exact: true })).toBeVisible();
      await expect(
        review.getByRole("button", { name: m.confirmMeaning, exact: true }),
      ).toBeDisabled();
      expect((await h.money.getMoney(h.subject)).factToken).toBe(newer.factToken);
      await review.getByRole("button", { name: m.checkCurrent, exact: true }).click();
      await expect(review.getByRole("button", { name: m.adoptCurrent, exact: true })).toBeVisible();
      await expect(
        review.getByRole("button", { name: m.confirmMeaning, exact: true }),
      ).toBeDisabled();
      await review.getByRole("button", { name: m.adoptCurrent, exact: true }).click();
      await expect(review.getByRole("textbox", { name: m.scale, exact: true })).toHaveValue("");
      expect((await h.money.getMoney(h.subject)).factToken).toBe(newer.factToken);
      await page.waitForLoadState("networkidle", { timeout: 5000 });
    } finally {
      await cleanupSearchFixture(h.f);
    }
  });
  test(`${locale}: withdrawing the exact historical assertion preserves raw money and invalidates its meaning`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI test database");
    const h = await openHistoricalPrice(page, locale, { edit: false });
    try {
      await h.region.getByRole("button", { name: h.m.review, exact: true }).click();
      const review = page.getByRole("region", { name: h.m.review, exact: true });
      await review.locator("summary").filter({ hasText: h.m.history }).click();
      await review.getByRole("button", { name: h.m.revoke, exact: true }).click();
      const revoke = review.getByRole("group", { name: h.m.revoke, exact: true });
      await revoke
        .getByRole("textbox", { name: h.m.revokeReason, exact: true })
        .fill("Synthetic deliberate withdrawal");
      await revoke.getByRole("checkbox").check();
      await revoke.getByRole("button", { name: h.m.confirmRevoke, exact: true }).click();
      await expect(review.getByText(h.m.savedSeparately, { exact: true })).toBeVisible();
      const after = await h.money.getMoney(h.subject);
      expect(after.raw).toEqual(h.before.raw);
      expect(after.interpretation).toMatchObject({ kind: "UNKNOWN", reason: "REVOKED" });
      const history = await h.money.listHistory(h.subject, {});
      expect(history.events[0]!).toMatchObject({
        operation: "REVOKE",
        reason: "Synthetic deliberate withdrawal",
      });
      await expect(review.getByRole("button", { name: h.m.revoke, exact: true })).toHaveCount(0);
      await page.waitForLoadState("networkidle", { timeout: 5000 });
    } finally {
      await cleanupSearchFixture(h.f);
    }
  });
}

for (const locale of ["de", "en"] as const) {
  test(`${locale}: an unknown new-item commit requires explicit collection reconciliation before a separate new entry`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI test database");
    const h = await customPriceFixture(page, locale, 1, true);
    try {
      const title = "Committed item with lost acknowledgment",
        save = page.getByRole("button", { name: h.t.save, exact: true });
      await page.getByRole("textbox", { name: h.t.title, exact: true }).fill(title);
      await page.route("**/api/v1/money/items", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        expect((await route.fetch()).status()).toBe(201);
        await route.abort("failed");
      });
      await save.click();
      await expect(page.locator('p.error[role="alert"]')).toHaveText(h.m.unknownOutcome);
      await page.screenshot({ path: test.info().outputPath("money-unknown.png"), fullPage: true });
      await expect(save).toBeDisabled();
      expect(
        await db!.collectibleItem.count({ where: { collectionId: h.f.collectionId, title } }),
      ).toBe(1);
      await page.unroute("**/api/v1/money/items");
      const next = locale === "de" ? "en" : "de",
        shell = (locale === "de" ? de : en).Shell;
      await page
        .getByRole("link", { name: locale === "de" ? shell.english : shell.german, exact: true })
        .click();
      const t = (next === "de" ? de : en).ItemForm;
      await expect(page.getByRole("button", { name: t.save, exact: true })).toBeDisabled();
      await page
        .getByRole("checkbox", {
          name:
            next === "de"
              ? "Ich habe die Sammlung geprüft und möchte einen getrennten neuen Eintrag beginnen."
              : "I checked the collection and want to start a separate new entry.",
          exact: true,
        })
        .check();
      await page
        .getByRole("button", {
          name:
            next === "de"
              ? "Ausstehenden Entwurf verwerfen und neu beginnen"
              : "Discard pending draft and start again",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("checkbox", {
          name:
            next === "de"
              ? "Ich habe die Sammlung geprüft und möchte einen getrennten neuen Eintrag beginnen."
              : "I checked the collection and want to start a separate new entry.",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(page.getByRole("textbox", { name: t.title, exact: true })).toHaveValue("");
      await page
        .getByRole("textbox", { name: t.title, exact: true })
        .fill("A separate explicitly started item");
      const response = page.waitForResponse(
        (r) =>
          r.request().method() === "POST" && new URL(r.url()).pathname === "/api/v1/money/items",
      );
      await page.getByRole("button", { name: t.save, exact: true }).click();
      expect((await response).status()).toBe(201);
      await expect(page).not.toHaveURL(/\/items\/new/u);
      await page.waitForLoadState("networkidle", { timeout: 5000 });
      expect(
        await db!.collectibleItem.count({ where: { collectionId: h.f.collectionId, title } }),
      ).toBe(1);
      expect(
        await db!.collectibleItem.count({
          where: { collectionId: h.f.collectionId, title: "A separate explicitly started item" },
        }),
      ).toBe(1);
    } finally {
      await cleanupSearchFixture(h.f);
    }
  });
}

for (const locale of ["de", "en"] as const) {
  for (const failure of ["LOST", "UNREADABLE", "REFRESH"] as const)
    test(`${locale}: committed purchase ${failure} recovery never reauthors an acknowledged correction`, async ({
      page,
    }) => {
      test.skip(!active, "Requires owned monetary UI test database");
      const h = await openHistoricalPrice(page, locale);
      try {
        await h.region.getByRole("textbox", { name: h.m.newAmount, exact: true }).fill("2");
        await h.region
          .getByRole("textbox", { name: h.m.reason, exact: true })
          .fill("Explicit correction before simulated response failure");
        await h.region.getByRole("checkbox").check();
        const url = `**/api/v1/money/items/${h.f.itemId}`;
        await page.route(url, async (route) => {
          const response = await route.fetch();
          if (route.request().method() !== "PATCH") return route.fulfill({ response });
          expect(response.status()).toBe(200);
          if (failure === "LOST") return route.abort("failed");
          if (failure === "UNREADABLE")
            return route.fulfill({ status: 200, json: { schemaVersion: 1 } });
          await route.fulfill({ response });
        });
        if (failure === "REFRESH")
          await page.route(`**/api/v1/items/${h.f.itemId}`, async (route) => {
            if (route.request().method() === "GET")
              return route.fulfill({
                status: 503,
                json: { error: "Synthetic failed snapshot refresh" },
              });
            return route.continue();
          });
        const save = page.getByRole("button", { name: h.t.save, exact: true });
        await save.click();
        await expect(page.locator('p.error[role="alert"]')).toBeVisible();
        const committed = await h.money.getMoney(h.subject);
        expect(committed.raw).toEqual({ amountMinor: "200", currency: "AFN" });
        expect(committed.interpretation).toMatchObject({ kind: "INTERPRETED", decimal: "2.00" });
        await page.unroute(url);
        if (failure === "REFRESH") await page.unroute(`**/api/v1/items/${h.f.itemId}`);
        else {
          await expect(save).toBeDisabled();
          await page.getByRole("button", { name: h.m.checkCurrent, exact: true }).click();
          await page.getByRole("button", { name: h.m.adoptCurrent, exact: true }).click();
        }
        await expect(save).toBeEnabled();
        await page
          .getByRole("textbox", { name: h.t.title, exact: true })
          .fill("Title after explicit recovery");
        await save.click();
        await expect(save).toBeEnabled();
        await page.waitForLoadState("networkidle", { timeout: 5000 });
        expect((await h.money.getMoney(h.subject)).factToken).toBe(committed.factToken);
      } finally {
        await cleanupSearchFixture(h.f);
      }
    });
  test(`${locale}: a capability failure never falls back to raw item writes`, async ({ page }) => {
    test.skip(!active, "Requires owned monetary UI test database");
    const h = await openHistoricalPrice(page, locale, { edit: false });
    try {
      let mutations = 0;
      page.on("request", (request) => {
        if (
          ["POST", "PUT", "PATCH"].includes(request.method()) &&
          request.url().includes("/api/v1/")
        )
          mutations++;
      });
      await page.route("**/api/v1/money/capabilities", (route) =>
        route.fulfill({ status: 404, json: { error: "Old server" } }),
      );
      await page.reload();
      await expect(page.getByRole("button", { name: h.t.save, exact: true })).toBeDisabled();
      await expect(
        page.locator('p.notice[role="status"]').filter({ hasText: h.m.disabled }),
      ).toBeVisible();
      expect(mutations).toBe(0);
      expect((await h.money.getMoney(h.subject)).factToken).toBe(h.before.factToken);
    } finally {
      await cleanupSearchFixture(h.f);
    }
  });
  test(`${locale}: changing the authenticated account refuses a stale private form without a mutation`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI test database");
    const h = await openHistoricalPrice(page, locale, { edit: false });
    const other = await searchFixture();
    try {
      expect(
        (
          await page.request.post("/api/auth/sign-in/email", {
            headers: { origin, "x-forwarded-for": other.ip },
            data: { email: other.email, password: other.password },
          })
        ).status(),
      ).toBe(200);
      let mutations = 0;
      page.on("request", (request) => {
        if (
          ["POST", "PUT", "PATCH"].includes(request.method()) &&
          request.url().includes("/api/v1/")
        )
          mutations++;
      });
      await page
        .getByRole("textbox", { name: h.t.title, exact: true })
        .fill("Must not cross account boundary");
      await page.getByRole("button", { name: h.t.save, exact: true }).click();
      await expect(page.getByText(h.m.sessionChanged, { exact: true })).toBeVisible();
      expect(mutations).toBe(0);
      expect((await h.money.getMoney(h.subject)).factToken).toBe(h.before.factToken);
    } finally {
      await cleanupSearchFixture(other);
      await cleanupSearchFixture(h.f);
    }
  });
}

for (const locale of ["de", "en"] as const)
  test(`${locale}: failed custom monetary reads have an explicit read-only retry without raw writes`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI test database");
    const h = await customPriceFixture(page, locale, 1);
    try {
      await page.route(`**/api/v1/items/${h.f.itemId}/money?*`, (route) =>
        route.fulfill({ status: 503, json: { error: "Synthetic bulk read unavailable" } }),
      );
      await page.reload();
      const retry = page.getByRole("button", {
        name: locale === "de" ? "Geld-Zusatzfelder erneut laden" : "Reload monetary custom fields",
        exact: true,
      });
      await expect(retry).toBeVisible();
      await expect(page.getByRole("button", { name: h.t.save, exact: true })).toBeDisabled();
      await page.unroute(`**/api/v1/items/${h.f.itemId}/money?*`);
      await retry.click();
      await expect(page.getByRole("button", { name: h.t.save, exact: true })).toBeEnabled();
      await expect(retry).toHaveCount(0);
    } finally {
      await cleanupSearchFixture(h.f);
    }
  });

for (const locale of ["de", "en"] as const)
  test(`${locale}: a cleared purchase retains the private entry point for withdrawing its historical assertion`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI test database");
    const h = await openHistoricalPrice(page, locale, { edit: false });
    try {
      await h.money.updateItemV2(h.f.itemId, {
        schemaVersion: 1,
        item: {},
        purchase: { op: "CLEAR", expectedFactToken: h.before.factToken },
      });
      await page.reload();
      await page.locator("summary").filter({ hasText: h.m.privateHistory }).click();
      await page
        .getByRole("button", { name: `${h.m.review}: ${h.t.unitPrice}`, exact: true })
        .click();
      const review = page.getByRole("region", { name: h.m.review, exact: true });
      await review.locator("summary").filter({ hasText: h.m.history }).click();
      await review.getByRole("button", { name: h.m.revoke, exact: true }).click();
      const form = review.getByRole("group", { name: h.m.revoke, exact: true });
      await form
        .getByRole("textbox", { name: h.m.revokeReason, exact: true })
        .fill("Withdraw historical evidence after clearing the amount");
      await form.getByRole("checkbox").check();
      await form.getByRole("button", { name: h.m.confirmRevoke, exact: true }).click();
      await expect(review.getByText(h.m.savedSeparately, { exact: true })).toBeVisible();
      expect((await h.money.getMoney(h.subject)).raw).toBeNull();
      expect((await h.money.listHistory(h.subject, {})).events[0]!.operation).toBe("REVOKE");
      await page.waitForLoadState("networkidle", { timeout: 5000 });
    } finally {
      await cleanupSearchFixture(h.f);
    }
  });

for (const locale of ["de", "en"] as const) {
  test(`${locale}: acknowledged creation survives metadata failure and locale without duplicate POST or custom authoring`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI test database");
    const h = await customPriceFixture(page, locale, 1, true);
    try {
      const title = "Acknowledged creation before metadata failure";
      await page.getByRole("textbox", { name: h.t.title, exact: true }).fill(title);
      await page
        .getByRole("region", { name: h.fields[0]!.name, exact: true })
        .getByRole("textbox", { name: h.fields[0]!.name, exact: true })
        .fill("1,25");
      let posts = 0,
        createdId = "";
      await page.route("**/api/v1/money/items", async (route) => {
        posts++;
        const response = await route.fetch();
        createdId = (await response.json()).item.id;
        await route.fulfill({ response });
      });
      await page.route("**/api/v1/items/*/tags", (route) =>
        route.fulfill({ status: 503, json: { error: "Synthetic metadata failure" } }),
      );
      await page.getByRole("button", { name: h.t.save, exact: true }).click();
      await expect(page.locator('p.error[role="alert"]')).toBeVisible();
      const subject = {
        family: "CUSTOM" as const,
        itemId: createdId,
        fieldDefinitionId: h.fields[0]!.id,
      };
      const committed = await h.money.getMoney(subject);
      await page.unroute("**/api/v1/items/*/tags");
      const next = locale === "de" ? "en" : "de",
        shell = (locale === "de" ? de : en).Shell;
      await page
        .getByRole("link", { name: locale === "de" ? shell.english : shell.german, exact: true })
        .click();
      const t = (next === "de" ? de : en).ItemForm;
      await expect(page.getByRole("textbox", { name: t.title, exact: true })).toHaveValue(title);
      await page
        .getByRole("textbox", { name: t.title, exact: true })
        .fill("Continued acknowledged item");
      await page.getByRole("button", { name: t.save, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${next}/items/${createdId}$`));
      await page.waitForLoadState("networkidle", { timeout: 5000 });
      expect(posts).toBe(1);
      expect((await h.money.getMoney(subject)).factToken).toBe(committed.factToken);
      expect(await db!.collectibleItem.count({ where: { collectionId: h.f.collectionId } })).toBe(
        2,
      );
    } finally {
      await cleanupSearchFixture(h.f);
    }
  });
  test(`${locale}: collection selection cannot bypass an unknown creation barrier`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI test database");
    const h = await customPriceFixture(page, locale, 1, true);
    try {
      await db!.collection.create({
        data: { ownerId: h.f.ownerId, name: "Other synthetic collection" },
      });
      await page.reload();
      const save = page.getByRole("button", { name: h.t.save, exact: true });
      await expect(save).toBeEnabled();
      await page
        .getByRole("textbox", { name: h.t.title, exact: true })
        .fill("Unknown creation in original collection");
      await page.route("**/api/v1/money/items", async (route) => {
        expect((await route.fetch()).status()).toBe(201);
        await route.abort("failed");
      });
      await save.click();
      await expect(page.locator('p.error[role="alert"]')).toHaveText(h.m.unknownOutcome);
      await expect(
        page.getByRole("combobox", { name: h.t.collection, exact: true }),
      ).toBeDisabled();
      await expect(save).toBeDisabled();
      expect(await db!.collectibleItem.count({ where: { collectionId: h.f.collectionId } })).toBe(
        2,
      );
    } finally {
      await cleanupSearchFixture(h.f);
    }
  });
}
