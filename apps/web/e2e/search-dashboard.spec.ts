import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { searchFixture, cleanupSearchFixture, db, enabled, origin } from "./support/search-fixture";
test.use({ actionTimeout: 10000 });
test.afterAll(async () => {
  await db?.$disconnect();
});
export async function signIn(page: Page, f: Awaited<ReturnType<typeof searchFixture>>) {
  expect(
    (
      await page.request.post("/api/auth/sign-in/email", {
        data: { email: f.email, password: f.password },
        headers: { origin, "x-forwarded-for": f.ip },
      })
    ).status(),
  ).toBe(200);
}
for (const locale of ["de", "en"] as const) {
  test(`${locale}: authenticated collector can discover search and filter actual owned inventory`, async ({
    page,
  }, info) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await searchFixture();
    try {
      await signIn(page, f);
      await page.goto(`/${locale}/collections`);
      await page
        .getByRole("link", { name: locale === "de" ? "Suche" : "Search", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: locale === "de" ? "Sammlung durchsuchen" : "Search your collection",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Synthetic untagged card", exact: true }),
      ).toBeVisible();
      await expect(page.getByText("Foreign public card", { exact: true })).toHaveCount(0);
      await expect(page.locator(".skip-link")).toHaveCSS("clip-path", "inset(50%)");
      await page.locator(".skip-link").focus();
      await expect(page.locator(".skip-link")).toBeFocused();
      expect(
        await page.locator(".skip-link").evaluate((el) => el.getBoundingClientRect().top),
      ).toBeGreaterThanOrEqual(0);
      await page.keyboard.press("Tab");
      await expect(page.locator(".skip-link")).not.toBeFocused();
      if (info.project.name === "mobile")
        await page
          .getByRole("button", {
            name: locale === "de" ? "Filter öffnen" : "Open filters",
            exact: true,
          })
          .click();
      await page
        .getByRole("button", {
          name: locale === "de" ? "Bedingung hinzufügen" : "Add condition",
          exact: true,
        })
        .first()
        .click();
      await page.screenshot({
        path: resolve(
          `../../.superpowers/sdd/2026-09-19-07-search-smart-collections-dashboard/screenshots/task-5c-${locale}-${info.project.name}-builder.png`,
        ),
        fullPage: true,
      });
      await page
        .getByLabel(locale === "de" ? "Filterart" : "Filter family", { exact: true })
        .selectOption("tags");
      await page
        .getByLabel(locale === "de" ? "Werte (eine Zeile je Wert)" : "Values (one per line)", {
          exact: true,
        })
        .fill("signiert");
      await page
        .getByRole("button", { name: locale === "de" ? "Anwenden" : "Apply", exact: true })
        .click();
      await expect(
        page.getByText(locale === "de" ? "Keine passenden Objekte." : "No matching items.", {
          exact: true,
        }),
      ).toBeVisible();
      expect(new URL(page.url()).search).toMatch(/^\?q=[a-f0-9]{32}$/);
      expect(page.url()).not.toContain("signiert");
      await page.screenshot({
        path: resolve(
          `../../.superpowers/sdd/2026-09-19-07-search-smart-collections-dashboard/screenshots/task-5c-${locale}-${info.project.name}-empty.png`,
        ),
        fullPage: true,
      });
    } finally {
      await cleanupSearchFixture(f);
    }
  });
}

import de from "../messages/de.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import {
  searchDetailsFixture,
  cleanupSearchDetailsFixture,
} from "./support/search-details-fixture";
const copies = { de: de.Search, en: en.Search };
type Locale = "de" | "en";
async function panel(page: Page, locale: Locale) {
  const open = page.getByRole("button", { name: copies[locale].openFilters, exact: true });
  if (!(await page.locator("dialog.search-drawer[open]").count()) && (await open.isVisible()))
    await open.click();
}
async function apply(page: Page, locale: Locale, total: number) {
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/v1/search/items") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: copies[locale].apply, exact: true }).click();
  const body = await (await response).json();
  expect(body.total).toBe(total);
  expect(body.scope).toBe("OWNED");
  await expect(page.getByTestId("search-total")).toContainText(String(total));
}
async function setText(page: Page, locale: Locale, value: string, total: number) {
  await panel(page, locale);
  await page.getByLabel(copies[locale].text, { exact: true }).fill(value);
  await apply(page, locale, total);
}
async function start(page: Page, locale: Locale, f: Awaited<ReturnType<typeof searchFixture>>) {
  await signIn(page, f);
  await page.goto(`/${locale}/search`);
  await expect(page.getByTestId("search-total")).toContainText("1");
}
async function addLeaf(page: Page, locale: Locale, kind: string) {
  await panel(page, locale);
  const c = copies[locale];
  await page.getByRole("button", { name: c.addCondition, exact: true }).first().click();
  await page.getByLabel(c.family, { exact: true }).selectOption(kind);
}
async function chooseReference(page: Page, locale: Locale, label: string, option: string) {
  const group = page.getByRole("group", { name: label, exact: true }).last();
  await group.getByRole("button", { name: copies[locale].choose, exact: true }).click();
  await group
    .getByLabel(copies[locale].availableChoices, { exact: true })
    .selectOption({ label: option });
}
async function cleanFilter(page: Page, locale: Locale) {
  await panel(page, locale);
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/v1/search/items") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: copies[locale].reset, exact: true }).first().click();
  await response;
}
for (const locale of ["de", "en"] as const) {
  const c = copies[locale];
  test(`${locale}: real Next history, item Back, locale and reload keep private query tokens`, async ({
    page,
    context,
  }) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await searchFixture();
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    try {
      await start(page, locale, f);
      const first = page.url();
      const keys = await page.evaluate(() => Object.keys(history.state));
      expect(keys).toContain("__NA");
      await page.getByRole("link", { name: "Synthetic untagged card", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/items/${f.itemId}$`));
      await expect(
        page.getByRole("heading", { name: "Synthetic untagged card", exact: true }),
      ).toBeVisible();
      await page.goBack();
      await expect(page.getByTestId("search-total")).toContainText("1");
      expect(page.url()).toBe(first);
      await setText(page, locale, "private-certificate-sentinel", 0);
      const second = page.url();
      expect(second).not.toBe(first);
      expect(await page.evaluate(() => Object.keys(history.state))).toEqual(
        expect.arrayContaining(keys),
      );
      await page.goBack();
      await expect(page.getByTestId("search-total")).toContainText("1");
      expect(page.url()).toBe(first);
      await page.goForward();
      await expect(page.getByText(c.empty, { exact: true })).toBeVisible();
      expect(page.url()).toBe(second);
      await page.reload();
      await expect(page.getByText(c.empty, { exact: true })).toBeVisible();
      const other = locale === "de" ? "en" : "de";
      await page
        .getByRole("link", { name: locale === "de" ? "English" : "Deutsch", exact: true })
        .click();
      await expect(page).toHaveURL(second.replace(`/${locale}/search`, `/${other}/search`));
      await expect(page.getByText(copies[other].empty, { exact: true })).toBeVisible();
      const copy = await context.newPage();
      await copy.goto(page.url());
      await expect(
        copy.getByText(copies[other].errors.missingToken, { exact: true }),
      ).toBeVisible();
      await expect(copy.getByTestId("search-total")).toHaveCount(0);
      await copy.close();
      expect(requests.every((url) => !url.includes("private-certificate-sentinel"))).toBe(true);
      expect(
        await page
          .locator("a")
          .evaluateAll((links) =>
            links.every(
              (link) => !link.getAttribute("href")?.includes("private-certificate-sentinel"),
            ),
          ),
      ).toBe(true);
    } finally {
      await cleanupSearchFixture(f);
    }
  });
  test(`${locale}: unauthenticated and malformed query locations never run all-owned`, async ({
    page,
  }) => {
    test.skip(!enabled, "Requires guarded auth database");
    await page.goto(`/${locale}/search`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/login`));
    const f = await searchFixture();
    try {
      await signIn(page, f);
      let requests = 0;
      page.on("request", (r) => {
        if (r.url().endsWith("/api/v1/search/items")) requests++;
      });
      for (const suffix of [
        "?text=private-url-sentinel",
        "?f=%7B%7D",
        "?q=wrong",
        "?q=" + "a".repeat(32) + "&q=" + "b".repeat(32),
        "?%71=" + "a".repeat(32),
        "?q=%ZZ",
        "#private-url-sentinel",
      ]) {
        await page.goto(`/${locale}/search${suffix}`);
        await expect(page.getByText(c.errors.invalidUrl, { exact: true })).toBeVisible();
        await expect(page.getByTestId("search-total")).toHaveCount(0);
      }
      expect(requests).toBe(0);
      await page.getByRole("button", { name: c.reset, exact: true }).last().click();
      await expect(page.getByTestId("search-total")).toContainText("1");
    } finally {
      await cleanupSearchFixture(f);
    }
  });
  test(`${locale}: bounded tab eviction, blocked storage and actor replacement are honest`, async ({
    page,
    context,
  }) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await searchFixture();
    let second: Awaited<ReturnType<typeof searchFixture>> | undefined;
    try {
      await start(page, locale, f);
      const old = page.url();
      for (let n = 0; n < 21; n++) await setText(page, locale, `unmatched-${n}`, 0);
      expect(
        await page.evaluate(
          () => JSON.parse(sessionStorage.getItem("sammlerraum.search.v1")!).entries.length,
        ),
      ).toBe(20);
      await page.goto(old);
      await expect(page.getByText(c.errors.missingToken, { exact: true })).toBeVisible();
      const blocked = await context.newPage();
      await blocked.addInitScript(() =>
        Object.defineProperty(window, "sessionStorage", {
          get() {
            throw new DOMException("Blocked", "SecurityError");
          },
        }),
      );
      await blocked.goto(`/${locale}/search`);
      await expect(blocked.getByTestId("search-total")).toContainText("1");
      await setText(blocked, locale, "blocked-storage-private", 0);
      await blocked.goBack();
      await expect(blocked.getByTestId("search-total")).toContainText("1");
      await blocked.goForward();
      await expect(blocked.getByText(c.empty, { exact: true })).toBeVisible();
      await blocked.reload();
      await expect(blocked.getByText(c.errors.missingToken, { exact: true })).toBeVisible();
      await blocked.close();
      second = await searchFixture();
      await signIn(page, second);
      await page.goto(old);
      await expect(page.getByText(c.errors.missingToken, { exact: true })).toBeVisible();
      expect(await page.evaluate(() => sessionStorage.getItem("sammlerraum.search.v1"))).toBeNull();
    } finally {
      if (second) await cleanupSearchFixture(second);
      await cleanupSearchFixture(f);
    }
  });
  test(`${locale}: actual delayed response, failure/stale states and 401 clearing`, async ({
    page,
  }, info) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await searchFixture();
    try {
      await start(page, locale, f);
      await setText(page, locale, "no-match-private", 0);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let held!: () => void;
      const arrived = new Promise<void>((resolve) => (held = resolve));
      let delay = true;
      await page.route("**/api/v1/search/items", async (route) => {
        if (!delay) {
          await route.continue();
          return;
        }
        delay = false;
        const response = await route.fetch();
        held();
        await gate;
        try {
          await route.fulfill({ response });
        } catch {
          /* The real request was aborted on Back. */
        }
      });
      await page.getByRole("button", { name: c.refresh, exact: true }).click();
      await arrived;
      await expect(page.getByText(c.loading, { exact: true }).first()).toBeVisible();
      await page.goBack();
      await expect(page.getByTestId("search-total")).toContainText("1");
      release();
      await expect(
        page.getByRole("link", { name: "Synthetic untagged card", exact: true }),
      ).toBeVisible();
      await page.unroute("**/api/v1/search/items");
      for (const status of [400, 403, 404, 422, 503, 500]) {
        await page.route("**/api/v1/search/items", (route) =>
          route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify({
              error: { code: "SEARCH_UNAVAILABLE", requestId: "synthetic-request" },
            }),
          }),
        );
        await page.getByRole("button", { name: c.refresh, exact: true }).click();
        await expect(page.getByText(c.stale, { exact: true })).toBeVisible();
        await expect(page.getByTestId("search-total")).toContainText("1");
        await page.unroute("**/api/v1/search/items");
      }
      await addLeaf(page, locale, "tags");
      await page.getByLabel(c.values, { exact: true }).fill("PRIVATE-OPERAND-BEFORE-EXPIRY");
      await page.getByRole("button", { name: c.remove, exact: true }).click();
      await expect(page.getByRole("button", { name: c.undo, exact: true })).toBeVisible();
      if (info.project.name === "mobile")
        await page.getByRole("button", { name: c.closeFilters, exact: true }).click();
      await page.route("**/api/v1/search/items", (route) =>
        route.fulfill({
          status: 401,
          contentType: "application/json",
          body: '{"error":{"code":"UNAUTHENTICATED"}}',
        }),
      );
      await page.getByRole("button", { name: c.refresh, exact: true }).click();
      await expect(page.getByText(c.errors.session, { exact: true })).toBeVisible();
      await expect(page.getByTestId("search-total")).toHaveCount(0);
      expect(await page.evaluate(() => sessionStorage.getItem("sammlerraum.search.v1"))).toBeNull();
      await page.unroute("**/api/v1/search/items");
      let afterExpiryRequests = 0;
      page.on("request", (request) => {
        if (request.url().endsWith("/api/v1/search/items")) afterExpiryRequests++;
      });
      await page.evaluate(() => window.dispatchEvent(new PopStateEvent("popstate")));
      await expect(page.getByText(c.errors.session, { exact: true })).toBeVisible();
      await panel(page, locale);
      await expect(page.getByRole("button", { name: c.undo, exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: c.reset, exact: true }).click();
      await expect(page.getByText(c.errors.session, { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: c.apply, exact: true })).toBeDisabled();
      expect(afterExpiryRequests).toBe(0);
      expect(await page.evaluate(() => sessionStorage.getItem("sammlerraum.search.v1"))).toBeNull();
    } finally {
      await cleanupSearchFixture(f);
    }
  });
  test(`${locale}: keyboard nesting, discard, drawer focus and 320px/200% overflow`, async ({
    page,
  }, info) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await searchFixture();
    try {
      await start(page, locale, f);
      await addLeaf(page, locale, "tags");
      await page.getByLabel(c.values, { exact: true }).fill("unapplied-private");
      await page.getByRole("button", { name: c.negate, exact: true }).focus();
      await page.keyboard.press("Enter");
      await page.getByRole("button", { name: c.addGroup, exact: true }).last().focus();
      await page.keyboard.press("Enter");
      await expect(page.getByLabel(c.combination, { exact: true }).first()).toBeVisible();
      await page.getByLabel(c.combination, { exact: true }).first().selectOption("or");
      await page.getByRole("button", { name: c.remove, exact: true }).last().focus();
      await page.keyboard.press("Enter");
      await page.getByRole("button", { name: c.undo, exact: true }).focus();
      await page.keyboard.press("Enter");
      if (info.project.name === "mobile") {
        const dialog = page.locator("dialog[open]");
        for (let n = 0; n < 15; n++) {
          await page.keyboard.press("Tab");
          expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
        }
        await page.keyboard.press("Escape");
        await expect(page.getByRole("button", { name: c.openFilters, exact: true })).toBeFocused();
      }
      await page
        .getByRole("link", { name: locale === "de" ? "English" : "Deutsch", exact: true })
        .click();
      await expect(page.getByRole("dialog", { name: c.discardTitle, exact: true })).toBeVisible();
      await page.getByRole("button", { name: c.cancel, exact: true }).click();
      expect(new URL(page.url()).pathname).toBe(`/${locale}/search`);
      await panel(page, locale);
      await page.getByRole("button", { name: c.discard, exact: true }).click();
      await page.getByRole("button", { name: c.discardConfirm, exact: true }).click();
      await page.setViewportSize({ width: 320, height: 900 });
      await expect(page.getByRole("button", { name: c.openFilters, exact: true })).toBeVisible();
      await panel(page, locale);
      await expect(page.locator("dialog[open]")).toBeVisible();
      expect(
        await page.locator(".search-shell .management-nav a").evaluateAll((links) =>
          links.every((link) => {
            const range = document.createRange();
            range.selectNodeContents(link);
            return range.getClientRects().length === 1;
          }),
        ),
      ).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        await page.locator("dialog[open]").evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await page.screenshot({
        path: resolve(
          `../../.superpowers/sdd/2026-09-19-07-search-smart-collections-dashboard/screenshots/task-5c-${locale}-${info.project.name}-320.png`,
        ),
        fullPage: true,
      });
      await page.keyboard.press("Escape");
      await page.setViewportSize({ width: 720, height: 500 });
      await page.evaluate(() => {
        document.documentElement.style.zoom = "2";
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: resolve(
          `../../.superpowers/sdd/2026-09-19-07-search-smart-collections-dashboard/screenshots/task-5c-${locale}-${info.project.name}-zoom.png`,
        ),
        fullPage: true,
      });
    } finally {
      await cleanupSearchFixture(f);
    }
  });
  test(`${locale}: actual lifecycle and reference selectors with typed family matrix`, async ({
    page,
  }, info) => {
    test.skip(!enabled, "Requires guarded auth database"); // This one case exercises 25+ explicit typed edits and real source queries, so has a finite 120s budget.
    test.setTimeout(120000);
    const f = await searchDetailsFixture();
    try {
      await start(page, locale, f);
      for (const [status, total] of [
        ["ARCHIVED", 1],
        ["DISPOSED", 1],
        ["ALL", 3],
        ["ACTIVE", 1],
      ] as const) {
        await panel(page, locale);
        await page.getByLabel(c.lifecycle, { exact: true }).selectOption(status);
        await apply(page, locale, total);
      }
      for (const kind of [
        "purchaseMoney",
        "media",
        "createdAt",
        "updatedAt",
        "acquisitionDate",
        "visibility",
        "tradeStatus",
        "grading",
        "manualMoney",
        "category",
        "collection",
        "condition",
      ]) {
        await cleanFilter(page, locale);
        await addLeaf(page, locale, kind);
        if (kind === "media")
          await page.getByLabel(c.operator, { exact: true }).selectOption("missing");
        if (kind === "createdAt" || kind === "updatedAt") {
          await page.getByLabel(c.operator, { exact: true }).selectOption("gte");
          await page.getByLabel(c.value, { exact: true }).fill("2020-01-01T00:00");
        }
        if (kind === "acquisitionDate") {
          await page.getByLabel(c.operator, { exact: true }).selectOption("eq");
          await page.getByLabel(c.value, { exact: true }).fill("2025-01-02");
        }
        if (kind === "visibility" || kind === "tradeStatus")
          await page
            .getByLabel(c.value, { exact: true })
            .selectOption(kind === "visibility" ? "PRIVATE" : "NOT_FOR_TRADE");
        if (kind === "manualMoney") {
          await page.getByLabel(c.operator, { exact: true }).selectOption("range");
          await page.getByLabel(c.minimum, { exact: true }).fill("0");
          await page.getByLabel(c.maximum, { exact: true }).fill("0");
        }
        if (kind === "grading") {
          await page.getByLabel(c.operator, { exact: true }).selectOption("authored");
          await page.getByLabel(c.provider, { exact: true }).fill("Synthetic provider");
          await page
            .getByLabel(c.certificateNo, { exact: true })
            .fill("private-certificate-sentinel");
        }
        if (kind === "collection")
          await chooseReference(page, locale, c.collection, "Synthetic search collection");
        if (kind === "condition") {
          await chooseReference(
            page,
            locale,
            c.category,
            locale === "de" ? "Suchkarten" : "Search cards",
          );
          await page.getByLabel(c.operator, { exact: true }).selectOption("eq");
          await chooseReference(
            page,
            locale,
            c.families.condition,
            (locale === "de" ? "Beibehaltener Zustand" : "Retained condition") + " · " + c.retired,
          );
        }
        await apply(page, locale, 1);
        if (kind === "createdAt") {
          await panel(page, locale);
          if (!(await page.getByLabel(c.family, { exact: true }).isVisible()))
            await page.getByRole("button", { name: c.edit, exact: true }).first().click();
          await page.getByLabel(c.operator, { exact: true }).selectOption("in");
          await page.getByRole("button", { name: c.addValue, exact: true }).click();
          const value = page.getByLabel(`${c.value} 1`, { exact: true });
          await expect(value).toHaveAttribute("type", "datetime-local");
          await value.fill("2020-01-01T00:00");
          await apply(page, locale, 0);
        }
        if (kind === "grading") {
          await panel(page, locale);
          if (!(await page.getByLabel(c.family, { exact: true }).isVisible()))
            await page.getByRole("button", { name: c.edit, exact: true }).first().click();
          await page.getByLabel(c.operator, { exact: true }).first().selectOption("comparable");
          await page.getByLabel(c.provider, { exact: true }).fill("Synthetic provider");
          await page.getByLabel(c.scale, { exact: true }).fill("ten");
          await page.getByLabel(c.operator, { exact: true }).last().selectOption("between");
          await page.getByLabel(c.minimum, { exact: true }).fill("9");
          await page.getByLabel(c.maximum, { exact: true }).fill("10");
          await apply(page, locale, 1);
        }
        if (kind === "media") {
          await panel(page, locale);
          if (!(await page.getByLabel(c.family, { exact: true }).isVisible()))
            await page.getByRole("button", { name: c.edit, exact: true }).first().click();
          await page.getByLabel(c.mediaKind, { exact: true }).selectOption("DOCUMENT");
          await page.getByLabel(c.documentCategory, { exact: true }).selectOption("OTHER_PRIVATE");
          await apply(page, locale, 1);
        }
      }
      for (const [type, source, op, input] of [
        ["SHORT_TEXT", "customField", "contains", "alpha"],
        ["LONG_TEXT", "catalogAttribute", "startsWith", "private"],
        ["INTEGER", "customField", "eq", "0"],
        ["DECIMAL", "catalogAttribute", "gte", "1.25"],
        ["DATE", "customField", "eq", "2025-01-02"],
        ["BOOLEAN", "catalogAttribute", "eq", "false"],
        ["SINGLE_SELECT", "customField", "eq", "alpha"],
        ["MULTI_SELECT", "catalogAttribute", "present", ""],
        ["URL", "customField", "eq", "https://example.test/"],
        ["MONEY", "catalogAttribute", "present", ""],
      ] as const) {
        await cleanFilter(page, locale);
        await addLeaf(page, locale, source);
        await chooseReference(
          page,
          locale,
          source === "customField" ? c.collection : c.category,
          source === "customField"
            ? "Synthetic search collection"
            : locale === "de"
              ? "Suchkarten"
              : "Search cards",
        );
        await chooseReference(
          page,
          locale,
          c.definition,
          `${source === "customField" ? "Synthetic" : locale === "de" ? "Katalog" : "Catalog"} ${type} · ${c.types[type]}`,
        );
        if (source === "catalogAttribute")
          await page
            .getByLabel(c.target, { exact: true })
            .selectOption(type === "LONG_TEXT" ? "ENTRY" : "SELECTED_VARIANT");
        await page.getByLabel(c.operator, { exact: true }).selectOption(op);
        if (input) {
          const value = page.getByLabel(c.value, { exact: true });
          if (type === "BOOLEAN") await value.selectOption(input);
          else await value.fill(input);
        }
        await apply(page, locale, 1);
      }
      await cleanFilter(page, locale);
      await addLeaf(page, locale, "customField");
      await chooseReference(page, locale, c.collection, "Synthetic search collection");
      await chooseReference(
        page,
        locale,
        c.definition,
        `Synthetic SINGLE_SELECT · ${c.types.SINGLE_SELECT}`,
      );
      await page.getByLabel(c.operator, { exact: true }).selectOption("eq");
      await page.getByLabel(c.value, { exact: true }).fill("unknown-valid-option");
      await apply(page, locale, 0);
      await page.screenshot({
        path: resolve(
          `../../.superpowers/sdd/2026-09-19-07-search-smart-collections-dashboard/screenshots/task-5c-${locale}-${info.project.name}-typed.png`,
        ),
        fullPage: true,
      });
    } finally {
      await cleanupSearchDetailsFixture(f);
    }
  });
}
for (const locale of ["de", "en"] as const) {
  const c = copies[locale];
  test(`${locale}: Back requires deliberate discard of a meaningful draft`, async ({ page }) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await searchFixture();
    try {
      await start(page, locale, f);
      await setText(page, locale, "applied-no-match", 0);
      const applied = page.url();
      await panel(page, locale);
      await page.getByLabel(c.text, { exact: true }).fill("unapplied-value");
      await page.goBack();
      await expect(page.getByRole("dialog", { name: c.discardTitle, exact: true })).toBeVisible();
      await page.getByRole("button", { name: c.cancel, exact: true }).click();
      await expect(page).toHaveURL(applied);
      await panel(page, locale);
      await expect(page.getByLabel(c.text, { exact: true })).toHaveValue("unapplied-value");
      if (await page.locator("dialog.search-drawer[open]").count())
        await page.keyboard.press("Escape");
      await page.goBack();
      await expect(page.getByRole("dialog", { name: c.discardTitle, exact: true })).toBeVisible();
      await page.getByRole("button", { name: c.discardConfirm, exact: true }).click();
      await expect(page.getByTestId("search-total")).toContainText("1");
    } finally {
      await cleanupSearchFixture(f);
    }
  });
}

for (const locale of ["de", "en"] as const) {
  const c = copies[locale];
  test(`${locale}: real pagination replaces rows and query edits reset the cursor`, async ({
    page,
  }, info) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await searchFixture();
    try {
      await start(page, locale, f);
      const { createItemService } = await import("@sammlerraum/domain/items/item-service");
      for (let n = 0; n < 12; n++)
        await createItemService(db!, f.ownerId).createItem({
          collectionId: f.collectionId,
          title: `Synthetic long item ${n} ${"Long authored name ".repeat(8)}`,
        });
      await db!.collection.update({
        where: { id: f.collectionId },
        data: { name: "Synthetic collection " + "Long authored label ".repeat(6) },
      });
      await panel(page, locale);
      await page.getByLabel(c.pageSize, { exact: true }).selectOption("10");
      await apply(page, locale, 13);
      await expect(page.locator(".search-results > li")).toHaveCount(10);
      const first = await page
        .locator(".search-results h3 a")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
      await panel(page, locale);
      await page.getByLabel(c.text, { exact: true }).fill("Unapplied private draft");
      if (info.project.name === "mobile")
        await page.getByRole("button", { name: c.closeFilters, exact: true }).click();
      const request = page.waitForResponse(
        (r) => r.url().endsWith("/api/v1/search/items") && r.request().method() === "POST",
      );
      await page.getByRole("button", { name: c.nextPage, exact: true }).click();
      expect((await (await request).json()).total).toBe(13);
      await expect(page.locator(".search-results > li")).toHaveCount(3);
      const next = await page
        .locator(".search-results h3 a")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
      expect(next.every((href) => !first.includes(href))).toBe(true);
      await panel(page, locale);
      await expect(page.getByLabel(c.text, { exact: true })).toHaveValue("Unapplied private draft");
      await expect(page.getByText(c.draftPending, { exact: true })).toBeVisible();
      await page.getByRole("button", { name: c.discard, exact: true }).click();
      await page.getByRole("button", { name: c.discardConfirm, exact: true }).click();
      await page.goBack();
      await expect(page.locator(".search-results > li")).toHaveCount(10);
      expect(
        await page
          .locator(".search-results h3 a")
          .evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
      ).toEqual(first);
      await page.setViewportSize({ width: 320, height: 900 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      await page.screenshot({
        path: resolve(
          `../../.superpowers/sdd/2026-09-19-07-search-smart-collections-dashboard/screenshots/task-5c-${locale}-${info.project.name}-long.png`,
        ),
        fullPage: true,
      });
      await setText(page, locale, "Synthetic untagged card", 1);
      await expect(page.getByRole("button", { name: c.firstPage, exact: true })).toBeDisabled();
    } finally {
      await cleanupSearchFixture(f);
    }
  });
  test(`${locale}: unavailable full tree remains repairable and metadata retries stay bounded`, async ({
    page,
  }) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await searchFixture();
    try {
      await start(page, locale, f);
      const token = await page.evaluate(() => {
        const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), (v) =>
          v.toString(16).padStart(2, "0"),
        ).join("");
        const state = JSON.parse(sessionStorage.getItem("sammlerraum.search.v1")!);
        state.entries.push([
          token,
          {
            text: "",
            filter: {
              version: 1,
              root: {
                kind: "and",
                children: [
                  { kind: "duplicate", value: false },
                  { kind: "tags", test: { op: "missing" } },
                ],
              },
            },
            lifecycle: "ACTIVE",
            limit: 20,
          },
        ]);
        sessionStorage.setItem("sammlerraum.search.v1", JSON.stringify(state));
        return token;
      });
      const response = page.waitForResponse(
        (r) => r.url().endsWith("/api/v1/search/items") && r.request().method() === "POST",
      );
      await page.goto(`/${locale}/search?q=${token}`);
      expect((await response).status()).toBe(422);
      await panel(page, locale);
      await expect(page.getByRole("button", { name: c.apply, exact: true })).toBeDisabled();
      const unavailable = page.getByRole("group", { name: c.families.duplicate, exact: true });
      await unavailable.getByRole("button", { name: c.edit, exact: true }).click();
      await expect(unavailable.getByLabel(c.value, { exact: true })).toHaveValue(c.false);
      await unavailable.getByRole("button", { name: c.remove, exact: true }).click();
      await apply(page, locale, 1);
      await cleanFilter(page, locale);
      await addLeaf(page, locale, "collection");
      let reads = 0;
      let fail = true;
      await page.route("**/api/v1/search/references/collections?*", async (route) => {
        reads++;
        if (fail)
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: '{"error":{"code":"SEARCH_UNAVAILABLE"}}',
          });
        else await route.continue();
      });
      const picker = page.getByRole("group", { name: c.collection, exact: true }).last();
      await picker.getByRole("button", { name: c.choose, exact: true }).click();
      await expect(picker.getByText(c.referenceFailed, { exact: false })).toBeVisible();
      expect(reads).toBe(1);
      fail = false;
      await picker.getByRole("button", { name: c.retry, exact: true }).click();
      await picker
        .getByLabel(c.availableChoices, { exact: true })
        .selectOption({ label: "Synthetic search collection" });
      expect(reads).toBe(2);
      await apply(page, locale, 1);
    } finally {
      await cleanupSearchFixture(f);
    }
  });
}
