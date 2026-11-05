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

for (const locale of ["de", "en"] as const) {
  test(`${locale}: saved search follows real ItemForm tag changes without copying items`, async ({
    page,
  }) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await searchFixture();
    const c = copies[locale];
    const saveSearch = locale === "de" ? "Suche speichern" : "Save search";
    const searchName = locale === "de" ? "Name der Suche" : "Search name";
    const saveItem = locale === "de" ? "Stück speichern" : "Save item";
    try {
      await start(page, locale, f);
      await addLeaf(page, locale, "tags");
      await page.getByLabel(c.values, { exact: true }).fill("signiert");
      await apply(page, locale, 0);
      await page.getByRole("button", { name: saveSearch, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel(searchName, { exact: true }).fill("Signiert — Live");
      const created = page.waitForResponse(
        (r) => r.url().endsWith("/api/v1/smart-collections") && r.request().method() === "POST",
      );
      await dialog
        .getByRole("button", { name: locale === "de" ? "Speichern" : "Save", exact: true })
        .click();
      expect((await created).status()).toBe(201);
      const saved = await (await created).json();
      const savedUrl = `/${locale}/smart-collections/${saved.id}`;
      await expect(page).toHaveURL(new RegExp(`${savedUrl}$`));
      await expect(
        page.getByRole("heading", { name: "Signiert — Live", exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId("search-total")).toContainText("0");
      for (const [tag, total] of [
        ["signiert", 1],
        ["", 0],
      ] as const) {
        await page.goto(`/${locale}/items/${f.itemId}`);
        await page.getByLabel("Tags").fill(tag);
        const updated = page.waitForResponse(
          (r) =>
            r.url().endsWith(`/api/v1/items/${f.itemId}/tags`) && r.request().method() === "PUT",
        );
        await page.getByRole("button", { name: saveItem, exact: true }).click();
        expect((await updated).status()).toBe(200);
        await expect(page.getByRole("button", { name: saveItem, exact: true })).toBeEnabled();
        await page.goto(savedUrl);
        await expect(page.getByTestId("search-total")).toContainText(String(total));
      }
    } finally {
      await cleanupSearchFixture(f);
    }
  });
}

async function seededSavedSearch(page: Page, name: string, fields: Record<string, unknown> = {}) {
  const response = await page.request.post("/api/v1/smart-collections", {
    headers: { origin },
    data: { name, text: "", lifecycle: "ACTIVE", f: null, ...fields },
  });
  expect(response.status()).toBe(201);
  return response.json() as Promise<{
    id: string;
    revision: number;
    name: string;
    definition: unknown;
  }>;
}
for (const locale of ["de", "en"] as const) {
  const c = (locale === "de" ? de : en).SavedSearches;
  test(`${locale}: saved search full replacement rename copy and confirmed delete retain items`, async ({
    page,
  }, info) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await searchFixture();
    try {
      await signIn(page, f);
      const saved = await seededSavedSearch(page, "Initial search");
      await page.goto(`/${locale}/smart-collections/${saved.id}`);
      await expect(page.getByTestId("search-total")).toContainText("1");
      await page.getByRole("textbox", { name: c.name, exact: true }).fill("Revised search");
      await page.getByLabel(copies[locale].text, { exact: true }).fill("No matching title");
      await page.getByLabel(copies[locale].lifecycle, { exact: true }).selectOption("ARCHIVED");
      const changed = page.waitForResponse(
        (r) => r.request().method() === "PATCH" && r.url().endsWith(`/${saved.id}`),
      );
      await page.getByRole("button", { name: c.saveChanges, exact: true }).click();
      expect((await changed).status()).toBe(200);
      await expect(page.getByTestId("search-total")).toContainText("0");
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Revised search", exact: true }),
      ).toBeVisible();
      await expect(page.getByLabel(copies[locale].text, { exact: true })).toHaveValue(
        "No matching title",
      );
      await expect(page.getByLabel(copies[locale].lifecycle, { exact: true })).toHaveValue(
        "ARCHIVED",
      );
      await page.getByRole("textbox", { name: c.name, exact: true }).fill("Renamed only");
      await page.getByRole("button", { name: c.saveChanges, exact: true }).click();
      await expect(page.getByTestId("search-total")).toContainText("0");
      const original = await (
        await page.request.get(`/api/v1/smart-collections/${saved.id}`)
      ).json();
      expect(original.revision).toBe(3);
      await page.screenshot({
        path: resolve(
          `../../.superpowers/sdd/2026-09-19-07-search-smart-collections-dashboard/screenshots/task-5d-${locale}-${info.project.name}-detail.png`,
        ),
        fullPage: true,
      });
      await page.getByRole("button", { name: c.saveNew, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("textbox", { name: c.name, exact: true }).fill("Copied conditions");
      const created = page.waitForResponse(
        (r) => r.request().method() === "POST" && r.url().endsWith("/api/v1/smart-collections"),
      );
      await dialog.getByRole("button", { name: c.save, exact: true }).click();
      const copy = await (await created).json();
      expect(copy.id).not.toBe(saved.id);
      expect(copy.revision).toBe(1);
      expect(copy.definition).toEqual(original.definition);
      await expect(page).toHaveURL(new RegExp(`/${copy.id}$`));
      await expect(page.getByTestId("search-total")).toContainText("0");
      await page.getByRole("button", { name: c.delete, exact: true }).click();
      await expect(
        page.getByRole("dialog").getByRole("button", { name: c.cancel, exact: true }),
      ).toBeFocused();
      await page.getByRole("dialog").getByRole("button", { name: c.cancel, exact: true }).click();
      expect((await page.request.get(`/api/v1/smart-collections/${copy.id}`)).status()).toBe(200);
      await page.getByRole("button", { name: c.delete, exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: c.delete, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/smart-collections$`));
      await expect(page.getByRole("link", { name: "Renamed only", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Copied conditions", exact: true })).toHaveCount(
        0,
      );
      expect((await page.request.get(`/api/v1/items/${f.itemId}`)).status()).toBe(200);
    } finally {
      await cleanupSearchFixture(f);
    }
  });
  test(`${locale}: two-tab stale revision preserves input and requires explicit latest adoption`, async ({
    page,
    context,
  }) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await searchFixture();
    const other = await context.newPage();
    try {
      await signIn(page, f);
      const saved = await seededSavedSearch(page, "Before both tabs"),
        url = `/${locale}/smart-collections/${saved.id}`;
      await page.goto(url);
      await other.goto(url);
      await expect(page.getByTestId("search-total")).toBeVisible();
      await expect(other.getByTestId("search-total")).toBeVisible();
      await page.getByRole("textbox", { name: c.name, exact: true }).fill("First writer");
      await page.getByRole("button", { name: c.saveChanges, exact: true }).click();
      await expect(page.getByRole("heading", { name: "First writer", exact: true })).toBeVisible();
      await other.getByRole("textbox", { name: c.name, exact: true }).fill("Second private draft");
      const conflict = other.waitForResponse(
        (r) => r.request().method() === "PATCH" && r.url().endsWith(`/${saved.id}`),
      );
      await other.getByRole("button", { name: c.saveChanges, exact: true }).click();
      expect((await conflict).status()).toBe(409);
      await expect(other.getByText(c.conflict, { exact: true })).toBeVisible();
      await expect(other.getByRole("textbox", { name: c.name, exact: true })).toHaveValue(
        "Second private draft",
      );
      await expect(other.getByTestId("search-total")).toHaveCount(0);
      await other.getByRole("button", { name: c.inspect, exact: true }).click();
      await expect(other.getByRole("heading", { name: c.latestTitle, exact: true })).toBeVisible();
      await expect(other.getByRole("textbox", { name: c.name, exact: true })).toHaveValue(
        "Second private draft",
      );
      await expect(other.getByRole("button", { name: c.saveChanges, exact: true })).toBeDisabled();
      await other.getByRole("button", { name: c.reopenLatest, exact: true }).click();
      await other.getByRole("dialog").getByRole("button", { name: c.cancel, exact: true }).click();
      await expect(other.getByRole("textbox", { name: c.name, exact: true })).toHaveValue(
        "Second private draft",
      );
      await other.getByRole("button", { name: c.reopenLatest, exact: true }).click();
      await other.getByRole("dialog").getByRole("button", { name: c.discard, exact: true }).click();
      await expect(other.getByRole("textbox", { name: c.name, exact: true })).toHaveValue(
        "First writer",
      );
      await expect(other.getByTestId("search-total")).toBeVisible();
    } finally {
      await other.close();
      await cleanupSearchFixture(f);
    }
  });
  for (const operation of ["create", "update", "delete"] as const) {
    test(`${locale}: lost ${operation} acknowledgement never retries or silently changes expected revision`, async ({
      page,
    }) => {
      test.skip(!enabled, "Requires guarded auth database");
      const f = await searchFixture();
      let writes = 0;
      try {
        await signIn(page, f);
        const saved =
          operation === "create" ? null : await seededSavedSearch(page, "Unknown original");
        if (saved) {
          await page.goto(`/${locale}/smart-collections/${saved.id}`);
          await expect(page.getByTestId("search-total")).toBeVisible();
        } else {
          await start(page, locale, f);
        }
        const method =
          operation === "create" ? "POST" : operation === "update" ? "PATCH" : "DELETE";
        await page.route("**/api/v1/smart-collections{,/**}", async (route) => {
          if (route.request().method() !== method) {
            await route.continue();
            return;
          }
          writes++;
          const response = await route.fetch();
          expect(response.status()).toBe(operation === "create" ? 201 : 200);
          await route.abort("failed");
        });
        if (operation === "create") {
          await page.getByRole("button", { name: copies[locale].saveSearch, exact: true }).click();
          await page
            .getByRole("dialog")
            .getByRole("textbox", { name: c.name, exact: true })
            .fill("Unknown created");
          await page.getByRole("dialog").getByRole("button", { name: c.save, exact: true }).click();
          await expect(page.getByText(c.unknownCreate, { exact: true })).toBeVisible();
          await expect(
            page.getByRole("dialog").getByRole("button", { name: c.save, exact: true }),
          ).toBeDisabled();
          await page.getByRole("link", { name: c.inspectList, exact: true }).click();
          await expect(
            page.getByRole("link", { name: "Unknown created", exact: true }),
          ).toBeVisible();
        } else if (operation === "update") {
          await page.getByRole("textbox", { name: c.name, exact: true }).fill("Unknown updated");
          await page.getByRole("button", { name: c.saveChanges, exact: true }).click();
          await expect(page.getByText(c.unknownUpdate, { exact: true })).toBeVisible();
          await page.getByRole("button", { name: c.inspect, exact: true }).click();
          await expect(
            page.getByRole("heading", { name: c.latestTitle, exact: true }),
          ).toBeVisible();
          await expect(page.getByRole("textbox", { name: c.name, exact: true })).toHaveValue(
            "Unknown updated",
          );
          await expect(
            page.getByRole("button", { name: c.saveChanges, exact: true }),
          ).toBeDisabled();
        } else {
          await page.getByRole("button", { name: c.delete, exact: true }).click();
          await page
            .getByRole("dialog")
            .getByRole("button", { name: c.delete, exact: true })
            .click();
          await expect(page.getByText(c.unknownDelete, { exact: true })).toBeVisible();
          await page.getByRole("button", { name: c.inspect, exact: true }).click();
          await expect(page.getByText(c.notFound, { exact: true })).toBeVisible();
          await expect(page.getByRole("button", { name: c.delete, exact: true })).toBeDisabled();
        }
        expect(writes).toBe(1);
      } finally {
        await cleanupSearchFixture(f);
      }
    });
  }
  test(`${locale}: acknowledged update survives failed member refresh and exact revision is retained`, async ({
    page,
  }) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await searchFixture();
    let fail = false;
    try {
      await signIn(page, f);
      const saved = await seededSavedSearch(page, "Before acknowledged");
      await page.goto(`/${locale}/smart-collections/${saved.id}`);
      await expect(page.getByTestId("search-total")).toBeVisible();
      await page.route(`**/api/v1/smart-collections/${saved.id}/items?*`, (route) =>
        fail
          ? route.fulfill({ status: 503, json: { error: { code: "SEARCH_UNAVAILABLE" } } })
          : route.continue(),
      );
      fail = true;
      await page.getByRole("textbox", { name: c.name, exact: true }).fill("Acknowledged retained");
      await page.getByRole("button", { name: c.saveChanges, exact: true }).click();
      await expect(page.getByText(c.membersFailed, { exact: true })).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Acknowledged retained", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(c.revision.replace("{revision}", "2"), { exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId("search-total")).toHaveCount(0);
      fail = false;
      await page.getByRole("button", { name: c.refresh, exact: true }).click();
      await expect(page.getByTestId("search-total")).toContainText("1");
    } finally {
      await cleanupSearchFixture(f);
    }
  });
}

for (const locale of ["de", "en"] as const) {
  const c = (locale === "de" ? de : en).SavedSearches;
  test(`${locale}: late acknowledged-refresh response cannot replace a newer member read`, async ({
    page,
  }) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await searchFixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let captured!: () => void;
    const held = new Promise<void>((resolve) => {
      captured = resolve;
    });
    let hold = false,
      once = false;
    try {
      await signIn(page, f);
      const saved = await seededSavedSearch(page, "Late member read");
      await page.goto(`/${locale}/smart-collections/${saved.id}`);
      await expect(page.getByTestId("search-total")).toContainText("1");
      await page.route(`**/api/v1/smart-collections/${saved.id}/items?*`, async (route) => {
        if (!hold || once) {
          await route.continue();
          return;
        }
        once = true;
        const response = await route.fetch();
        captured();
        await gate;
        try {
          await route.fulfill({ response });
        } catch {
          /* Correct cancellation may dispose the held route. */
        }
      });
      hold = true;
      await page
        .getByRole("textbox", { name: c.name, exact: true })
        .fill("Acknowledged before delay");
      await page.getByRole("button", { name: c.saveChanges, exact: true }).click();
      await held;
      const second = await page.request.post("/api/v1/items", {
        headers: { origin },
        data: { collectionId: f.collectionId, title: "Second current item", quantity: 1 },
      });
      expect(second.status()).toBe(201);
      await page.getByRole("button", { name: c.refresh, exact: true }).click();
      await expect(page.getByTestId("search-total")).toContainText("2");
      release();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await expect(page.getByTestId("search-total")).toContainText("2");
    } finally {
      release();
      await cleanupSearchFixture(f);
    }
  });
}

for (const locale of ["de", "en"] as const) {
  const c = (locale === "de" ? de : en).SavedSearches,
    s = copies[locale];
  test(`${locale}: unavailable references permit explicit repair while malformed definitions expose only list recovery`, async ({
    page,
  }) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await searchFixture();
    try {
      await signIn(page, f);
      const temp = await db!.collection.create({
        data: { ownerId: f.ownerId, name: "Deleted saved reference" },
      });
      const saved = await seededSavedSearch(page, "Repairable reference", {
        f: JSON.stringify({
          version: 1,
          root: { kind: "collection", test: { op: "eq", value: temp.id } },
        }),
      });
      await db!.collection.update({ where: { id: temp.id }, data: { deletedAt: new Date() } });
      await page.goto(`/${locale}/smart-collections/${saved.id}`);
      await expect(page.getByText(c.unresolvable, { exact: true })).toBeVisible();
      await expect(page.getByTestId("search-total")).toHaveCount(0);
      await page.getByRole("button", { name: s.remove, exact: true }).click();
      await page.getByRole("button", { name: c.saveChanges, exact: true }).click();
      await expect(page.getByTestId("search-total")).toContainText("1");
      const broken = await seededSavedSearch(page, "Malformed retained definition");
      await db!.smartCollection.update({
        where: { id: broken.id },
        data: {
          definition: {
            version: 1,
            text: "never-render-private-stored-json",
            lifecycle: "ACTIVE",
            filter: { version: 1, root: { kind: "invalid-stored-kind" } },
          },
        },
      });
      await page.goto(`/${locale}/smart-collections/${broken.id}`);
      await expect(page.getByText(c.detailFailed, { exact: true })).toBeVisible();
      await expect(page.getByTestId("search-total")).toHaveCount(0);
      await expect(page.getByRole("textbox", { name: c.name, exact: true })).toHaveCount(0);
      expect(await page.locator("body").innerText()).not.toContain(
        "never-render-private-stored-json",
      );
      await page.getByRole("link", { name: c.back, exact: true }).click();
      const row = page.getByRole("listitem").filter({
        has: page.getByRole("link", { name: "Malformed retained definition", exact: true }),
      });
      await row.getByRole("button", { name: c.delete, exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: c.delete, exact: true }).click();
      await expect(
        page.getByRole("link", { name: "Malformed retained definition", exact: true }),
      ).toHaveCount(0);
    } finally {
      await cleanupSearchFixture(f);
    }
  });
  test(`${locale}: saved list paginates actual rows and foreign missing deleted details stay indistinguishable`, async ({
    page,
  }) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await searchFixture();
    try {
      await signIn(page, f);
      for (let n = 0; n < 21; n++)
        await seededSavedSearch(page, `Owned saved ${String(n).padStart(2, "0")}`);
      await page.goto(`/${locale}/smart-collections`);
      const links = page.getByRole("link", { name: /^Owned saved /u });
      await expect(links).toHaveCount(20);
      const first = await links.allTextContents();
      await page.getByRole("button", { name: c.nextPage, exact: true }).click();
      await expect(links).toHaveCount(1);
      expect(first).not.toContain(await links.first().innerText());
      await page.getByRole("button", { name: c.firstPage, exact: true }).click();
      await expect(links).toHaveCount(20);
      const foreign = await db!.smartCollection.create({
        data: {
          ownerId: f.foreignId,
          name: "Private foreign saved",
          definition: { version: 1, text: "", filter: null, lifecycle: "ACTIVE" },
        },
      });
      const deleted = await seededSavedSearch(page, "Deleted own");
      expect(
        (
          await page.request.delete(`/api/v1/smart-collections/${deleted.id}`, {
            headers: { origin },
            data: { expectedRevision: 1 },
          })
        ).status(),
      ).toBe(200);
      for (const id of [foreign.id, deleted.id, "00000000-0000-4000-8000-000000000099"]) {
        await page.goto(`/${locale}/smart-collections/${id}`);
        await expect(page.getByText(c.notFound, { exact: true })).toBeVisible();
        await expect(page.getByTestId("search-total")).toHaveCount(0);
        expect(await page.locator("body").innerText()).not.toContain("Private foreign saved");
      }
    } finally {
      await cleanupSearchFixture(f);
    }
  });
  test(`${locale}: saved editor confirms locale history and clears private draft undo on 401`, async ({
    page,
  }) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await searchFixture();
    try {
      await signIn(page, f);
      const saved = await seededSavedSearch(page, "Private saved edit", {
        f: JSON.stringify({
          version: 1,
          root: { kind: "tags", test: { op: "hasAll", values: ["private-operand"] } },
        }),
      });
      await page.goto(`/${locale}/smart-collections`);
      await page.getByRole("link", { name: "Private saved edit", exact: true }).click();
      await expect(page.getByTestId("search-total")).toContainText("0");
      await page.getByRole("textbox", { name: c.name, exact: true }).fill("Private local edit");
      const otherLocale = locale === "de" ? "en" : "de";
      await page.locator(`a[hreflang="${otherLocale}"]`).click();
      await expect(
        page.getByRole("dialog").getByRole("heading", { name: c.discardTitle, exact: true }),
      ).toBeVisible();
      await page.getByRole("dialog").getByRole("button", { name: c.cancel, exact: true }).click();
      await expect(page.getByRole("textbox", { name: c.name, exact: true })).toHaveValue(
        "Private local edit",
      );
      await expect(page).toHaveURL(new RegExp(`/${locale}/smart-collections/${saved.id}$`));
      await page.goBack();
      await expect(
        page.getByRole("dialog").getByRole("heading", { name: c.discardTitle, exact: true }),
      ).toBeVisible();
      await page.getByRole("dialog").getByRole("button", { name: c.cancel, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${saved.id}$`));
      // An explicit discard may traverse; Forward reopens only the saved state.
      await page.goBack();
      await page.getByRole("dialog").getByRole("button", { name: c.discard, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/smart-collections$`));
      await page.goForward();
      await expect(page.getByRole("textbox", { name: c.name, exact: true })).toHaveValue(
        "Private saved edit",
      );
      await page.getByRole("button", { name: s.remove, exact: true }).click();
      await expect(page.getByRole("button", { name: s.undo, exact: true })).toBeVisible();
      await page.route(`**/api/v1/smart-collections/${saved.id}`, (route) =>
        route.request().method() === "PATCH"
          ? route.fulfill({ status: 401, json: { error: { code: "UNAUTHENTICATED" } } })
          : route.continue(),
      );
      await page.getByRole("button", { name: c.saveChanges, exact: true }).click();
      await expect(page.getByText(c.session, { exact: true })).toBeVisible();
      await expect(page.getByRole("textbox", { name: c.name, exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: s.undo, exact: true })).toHaveCount(0);
      await expect(page.getByTestId("search-total")).toHaveCount(0);
      expect(await page.locator("body").innerText()).not.toContain("private-operand");
      expect(await page.locator("body").innerText()).not.toContain("Private local edit");
    } finally {
      await cleanupSearchFixture(f);
    }
  });
  test(`${locale}: create acknowledgement remains readable when subsequent detail fetch fails`, async ({
    page,
  }) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await searchFixture();
    try {
      await start(page, locale, f);
      await page.route("**/api/v1/smart-collections/*", (route) =>
        route.request().method() === "GET"
          ? route.fulfill({ status: 503, json: { error: { code: "SEARCH_UNAVAILABLE" } } })
          : route.continue(),
      );
      await page.getByRole("button", { name: s.saveSearch, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByRole("textbox", { name: c.name, exact: true })
        .fill("Confirmed create identity");
      await dialog.getByRole("button", { name: c.save, exact: true }).click();
      await expect(page.getByText(c.detailFailed, { exact: true })).toBeVisible();
      await expect(page.getByText("Confirmed create identity", { exact: true })).toBeVisible();
      await expect(page.getByText(c.ack.replace("{revision}", "1"), { exact: true })).toBeVisible();
      await expect(page.getByRole("textbox", { name: c.name, exact: true })).toHaveCount(0);
    } finally {
      await cleanupSearchFixture(f);
    }
  });
  test(`${locale}: saved definition over fifty references survives cache eviction and replacement intact`, async ({
    page,
  }) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await searchFixture();
    try {
      await signIn(page, f);
      const ids = [f.collectionId];
      for (let n = 1; n < 200; n++) {
        const row = await db!.collection.create({
          data: { ownerId: f.ownerId, name: `Saved reference ${String(n).padStart(3, "0")}` },
        });
        ids.push(row.id);
      }
      const filter = {
        version: 1,
        root: {
          kind: "or",
          children: [0, 50, 100, 150].map((offset) => ({
            kind: "collection",
            test: { op: "in", values: ids.slice(offset, offset + 50) },
          })),
        },
      };
      const saved = await seededSavedSearch(page, "Two hundred references", {
        f: JSON.stringify(filter),
      });
      await page.goto(`/${locale}/smart-collections/${saved.id}`);
      await expect(page.getByTestId("search-total")).toContainText("1");
      const leaf = page
        .locator("fieldset.search-node")
        .filter({ has: page.locator(":scope > legend", { hasText: s.families.collection }) });
      for (const n of [0, 1, 2, 3, 0]) {
        const node = leaf.nth(n);
        const edit = node.getByRole("button", { name: s.edit, exact: true });
        if (await edit.isVisible()) await edit.click();
        const picker = node.locator("fieldset.search-reference");
        await picker.getByRole("button", { name: s.choose, exact: true }).click();
        await expect(picker.getByLabel(s.availableChoices, { exact: true })).toBeEnabled();
        await expect(picker.locator(".search-selected li")).toHaveCount(50);
        await expect(picker.getByRole("alert")).toHaveCount(0);
        await picker.getByRole("button", { name: s.closeChoices, exact: true }).click();
      }
      await page
        .getByRole("textbox", { name: c.name, exact: true })
        .fill("All references retained");
      await page.getByRole("button", { name: c.saveChanges, exact: true }).click();
      await expect(page.getByTestId("search-total")).toContainText("1");
      const after = await (await page.request.get(`/api/v1/smart-collections/${saved.id}`)).json();
      expect(after.definition).toEqual(saved.definition);
      expect(after.revision).toBe(2);
    } finally {
      await cleanupSearchFixture(f);
    }
  });
}

for (const locale of ["de", "en"] as const) {
  const c = (locale === "de" ? de : en).SavedSearches;
  test(`${locale}: saved pages and dialogs fit 320px and 200 percent zoom with keyboard focus`, async ({
    page,
  }, info) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await searchFixture();
    try {
      await signIn(page, f);
      const saved = await seededSavedSearch(page, "Long owned saved name ".repeat(4));
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(`/${locale}/smart-collections/${saved.id}`);
      await expect(page.getByTestId("search-total")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.getByRole("button", { name: c.saveNew, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("textbox", { name: c.name, exact: true })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(dialog.getByRole("button", { name: c.cancel, exact: true })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(dialog.getByRole("button", { name: c.save, exact: true })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(dialog.getByRole("textbox", { name: c.name, exact: true })).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(dialog.getByRole("button", { name: c.save, exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await page.getByRole("link", { name: c.back, exact: true }).click();
      await expect(page.getByRole("link", { name: saved.name, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: resolve(
          `../../.superpowers/sdd/2026-09-19-07-search-smart-collections-dashboard/screenshots/task-5d-${locale}-${info.project.name}-list-320.png`,
        ),
        fullPage: true,
      });
      await page.setViewportSize({ width: 640, height: 900 });
      await page.evaluate(() => {
        document.documentElement.style.zoom = "2";
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    } finally {
      await cleanupSearchFixture(f);
    }
  });
}

for (const locale of ["de", "en"] as const) {
  const c = (locale === "de" ? de : en).SavedSearches,
    s = copies[locale];
  test(`${locale}: refreshed saved membership is bound to displayed definition across concurrent tabs`, async ({
    page,
    context,
  }) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await searchFixture(),
      other = await context.newPage();
    try {
      await signIn(page, f);
      const saved = await seededSavedSearch(page, "Concurrent definition"),
        url = `/${locale}/smart-collections/${saved.id}`;
      await page.goto(url);
      await other.goto(url);
      await expect(page.getByTestId("search-total")).toContainText("1");
      await expect(other.getByTestId("search-total")).toContainText("1");
      await other.getByLabel(s.text, { exact: true }).fill("No matching new definition");
      await other.getByRole("button", { name: c.saveChanges, exact: true }).click();
      await expect(other.getByTestId("search-total")).toContainText("0");
      await page.getByRole("button", { name: c.refresh, exact: true }).click();
      await expect(
        page.getByText(
          locale === "de"
            ? "Die gespeicherte Definition hat sich geändert. Prüfe den neuesten Stand, bevor du weitere Treffer liest."
            : "The saved definition changed. Inspect the latest state before reading more results.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(page.getByTestId("search-total")).toHaveCount(0);
      await expect(page.getByLabel(s.text, { exact: true })).toHaveValue("");
      await page.getByRole("button", { name: c.reopenLatest, exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: c.discard, exact: true }).click();
      await expect(page.getByLabel(s.text, { exact: true })).toHaveValue(
        "No matching new definition",
      );
      await expect(page.getByTestId("search-total")).toContainText("0");
    } finally {
      await other.close();
      await cleanupSearchFixture(f);
    }
  });
  test(`${locale}: confirmed ordinary and locale navigation leave no phantom Back steps`, async ({
    page,
  }) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await searchFixture();
    try {
      await signIn(page, f);
      const saved = await seededSavedSearch(page, "Ordinary navigation");
      for (const destination of ["search", "locale"] as const) {
        await page.goto(`/${locale}/smart-collections`);
        await page.getByRole("link", { name: saved.name, exact: true }).click();
        await expect(page.getByTestId("search-total")).toBeVisible();
        await page.getByRole("textbox", { name: c.name, exact: true }).fill("Unsaved before link");
        if (destination === "search")
          await page.getByRole("link", { name: s.navSearch, exact: true }).click();
        else await page.locator(`a[hreflang="${locale === "de" ? "en" : "de"}"]`).click();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: c.discard, exact: true })
          .click();
        await expect(page).toHaveURL(
          destination === "search"
            ? new RegExp(`/${locale}/search`)
            : new RegExp(`/${locale === "de" ? "en" : "de"}/smart-collections/${saved.id}$`),
        );
        await page.goBack();
        await expect(page).toHaveURL(new RegExp(`/${locale}/smart-collections/${saved.id}$`));
        await expect(page.getByRole("textbox", { name: c.name, exact: true })).toHaveValue(
          saved.name,
        );
        await page.goBack();
        await expect(page).toHaveURL(new RegExp(`/${locale}/smart-collections$`));
      }
    } finally {
      await cleanupSearchFixture(f);
    }
  });
  test(`${locale}: unknown save-as-new recovery suspends its dialog and preserves input on cancellation`, async ({
    page,
  }) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await searchFixture();
    try {
      await signIn(page, f);
      const saved = await seededSavedSearch(page, "Saved parent definition");
      await page.goto(`/${locale}/smart-collections/${saved.id}`);
      await expect(page.getByTestId("search-total")).toBeVisible();
      await page
        .getByRole("textbox", { name: c.name, exact: true })
        .fill("Unsaved parent definition");
      await page.getByRole("button", { name: c.saveNew, exact: true }).click();
      await page
        .getByRole("dialog")
        .getByRole("textbox", { name: c.name, exact: true })
        .fill("Unknown child create");
      await page.route("**/api/v1/smart-collections", async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        await route.abort("failed");
      });
      await page.getByRole("dialog").getByRole("button", { name: c.save, exact: true }).click();
      await expect(page.getByText(c.unknownCreate, { exact: true })).toBeVisible();
      await page.getByRole("link", { name: c.inspectList, exact: true }).click();
      await expect(page.getByRole("dialog", { name: c.discardTitle, exact: true })).toBeVisible();
      await expect(page.locator("dialog[open]")).toHaveCount(1);
      await page.getByRole("dialog").getByRole("button", { name: c.cancel, exact: true }).click();
      await expect(page.getByRole("dialog", { name: c.create, exact: true })).toBeVisible();
      await expect(page.locator("dialog[open]")).toHaveCount(1);
      await expect(
        page.getByRole("dialog").getByRole("textbox", { name: c.name, exact: true }),
      ).toHaveValue("Unknown child create");
      await expect(page.getByText(c.unknownCreate, { exact: true })).toBeVisible();
      await page.goBack();
      await expect(page.getByRole("dialog", { name: c.discardTitle, exact: true })).toBeVisible();
      await expect(page.locator("dialog[open]")).toHaveCount(1);
      await page.getByRole("dialog").getByRole("button", { name: c.cancel, exact: true }).click();
      await expect(page.getByText(c.unknownCreate, { exact: true })).toBeVisible();
      await page.getByRole("link", { name: c.inspectList, exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: c.discard, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/smart-collections$`));
      await expect(
        page.getByRole("link", { name: "Unknown child create", exact: true }),
      ).toBeVisible();
    } finally {
      await cleanupSearchFixture(f);
    }
  });
}

for (const locale of ["de", "en"] as const) {
  const c = (locale === "de" ? de : en).SavedSearches,
    s = copies[locale];
  for (const phase of ["initial", "acknowledged"] as const) {
    test(`${locale}: ${phase} member resolution rejects a definition change before publication`, async ({
      page,
      context,
    }) => {
      test.skip(!enabled, "Requires guarded auth database");
      const f = await searchFixture(),
        other = await context.newPage();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let arrived!: () => void;
      const incoming = new Promise<void>((resolve) => {
        arrived = resolve;
      });
      let hold = phase === "initial",
        once = false;
      try {
        await signIn(page, f);
        const saved = await seededSavedSearch(page, "Interleaved definition"),
          url = `/${locale}/smart-collections/${saved.id}`;
        await other.goto(url);
        await expect(other.getByTestId("search-total")).toContainText("1");
        await page.route(`**/api/v1/smart-collections/${saved.id}/items?*`, async (route) => {
          if (!hold || once) {
            await route.continue();
            return;
          }
          once = true;
          arrived();
          await gate;
          await route.continue();
        });
        await page.goto(url);
        if (phase === "acknowledged") {
          await expect(page.getByTestId("search-total")).toContainText("1");
          hold = true;
          await page
            .getByRole("textbox", { name: c.name, exact: true })
            .fill("Acknowledged interleaving");
          await page.getByRole("button", { name: c.saveChanges, exact: true }).click();
          await incoming;
          await other.getByRole("button", { name: c.refreshDefinition, exact: true }).click();
          await expect(other.getByRole("textbox", { name: c.name, exact: true })).toHaveValue(
            "Acknowledged interleaving",
          );
          await expect(other.getByTestId("search-total")).toContainText("1");
        } else await incoming;
        await other.getByLabel(s.text, { exact: true }).fill("No matching interleaved definition");
        await other.getByRole("button", { name: c.saveChanges, exact: true }).click();
        await expect(other.getByTestId("search-total")).toContainText("0");
        release();
        await expect(
          page.getByText(
            locale === "de"
              ? "Die gespeicherte Definition hat sich geändert. Prüfe den neuesten Stand, bevor du weitere Treffer liest."
              : "The saved definition changed. Inspect the latest state before reading more results.",
            { exact: true },
          ),
        ).toBeVisible();
        await expect(page.getByTestId("search-total")).toHaveCount(0);
        await expect(page.getByLabel(s.text, { exact: true })).toHaveValue("");
      } finally {
        release();
        await other.close();
        await cleanupSearchFixture(f);
      }
    });
  }
  test(`${locale}: pending save-as-new stays in one modal and successful navigation removes its history guard`, async ({
    page,
  }) => {
    test.skip(!enabled, "Requires guarded auth database");
    const f = await searchFixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let arrived!: () => void;
    const incoming = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    try {
      await signIn(page, f);
      const saved = await seededSavedSearch(page, "Original before copy");
      await page.goto(`/${locale}/smart-collections`);
      await page.getByRole("link", { name: saved.name, exact: true }).click();
      await expect(page.getByTestId("search-total")).toContainText("1");
      await page.getByRole("textbox", { name: c.name, exact: true }).fill("Unsaved copied parent");
      await page.getByRole("button", { name: c.saveNew, exact: true }).click();
      await page
        .getByRole("dialog")
        .getByRole("textbox", { name: c.name, exact: true })
        .fill("Acknowledged copied child");
      await page.route("**/api/v1/smart-collections", async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        arrived();
        await gate;
        await route.fulfill({ response });
      });
      await page.getByRole("dialog").getByRole("button", { name: c.save, exact: true }).click();
      await incoming;
      await page.goBack();
      await expect(page.getByRole("dialog", { name: c.create, exact: true })).toBeVisible();
      await expect(page.locator("dialog[open]")).toHaveCount(1);
      await expect(
        page.getByRole("dialog").getByRole("button", { name: c.saving, exact: true }),
      ).toBeDisabled();
      release();
      await expect(
        page.getByRole("heading", { name: "Acknowledged copied child", exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId("search-total")).toContainText("1");
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`/${locale}/smart-collections/${saved.id}$`));
      await expect(page.getByRole("textbox", { name: c.name, exact: true })).toHaveValue(
        saved.name,
      );
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`/${locale}/smart-collections$`));
    } finally {
      release();
      await cleanupSearchFixture(f);
    }
  });
}
