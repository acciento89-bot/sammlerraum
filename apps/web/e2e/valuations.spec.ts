import { mkdir } from "node:fs/promises";
import {
  createValuationRouteDependencies,
  createValuationRouteHandlers,
} from "../src/lib/valuation-routes";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createItemService } from "@sammlerraum/domain/items/item-service";
import { createValuationService } from "@sammlerraum/domain/valuations/valuation-service";
import { createCatalogMaintenanceService } from "@sammlerraum/domain/catalog/catalog-service";
import {
  ValuationQuerySchema,
  SourceHistorySchema,
  ValuationSummarySchema,
} from "@sammlerraum/contracts/valuations";
import {
  valuationFixture,
  cleanupValuationFixture,
  db,
  enabled,
  origin,
} from "./support/valuation-fixture";
test.use({ actionTimeout: 10000 });
test.afterAll(async () => {
  await db?.$disconnect();
});
const labels = {
  de: {
    title: "Wertverlauf",
    amount: "Betrag pro Stück",
    currency: "Währung",
    note: "Private Notiz",
    when: "Beobachtungszeit",
    date: "Datum (UTC)",
    time: "Uhrzeit (UTC)",
    save: "Schätzung speichern",
    latest: "Neueste eigene Schätzung",
    history: "Eigener Wertverlauf",
    external: "Externe Quellen",
    refresh: "Verlauf aktualisieren",
    older: "Ältere Einträge",
    newest: "Zum Anfang",
    next: "Weitere Quellen",
    first: "Erste Quellen",
    scope: "Zuordnungsbereich",
    form: "Eigene Schätzung hinzufügen",
    saved: "Schätzung gespeichert.",
    disabled: "Externe Werte sind nicht zur Anzeige freigegeben.",
    unknown: "Das Speichern konnte nicht bestätigt werden",
    discard: "Entwurf verwerfen",
    empty: "Noch keine eigene Schätzung.",
    kinds: [
      "Angebotspreis",
      "Katalogwert",
      "Händlerpreis",
      "Letzter Verkaufspreis",
      "Preisspanne",
      "Durchschnitt verkaufter Artikel",
      "Median verkaufter Artikel",
    ],
  },
  en: {
    title: "Valuation history",
    amount: "Amount per unit",
    currency: "Currency",
    note: "Private note",
    when: "Observation time",
    date: "Date (UTC)",
    time: "Time (UTC)",
    save: "Save estimate",
    latest: "Latest personal estimate",
    history: "Personal history",
    external: "External sources",
    refresh: "Refresh history",
    older: "Older entries",
    newest: "Back to newest",
    next: "Next sources",
    first: "First sources",
    scope: "Mapping scope",
    form: "Add personal estimate",
    saved: "Estimate saved.",
    disabled: "External values are not enabled for display.",
    unknown: "Saving could not be confirmed",
    discard: "Discard draft",
    empty: "No personal estimate yet.",
    kinds: [
      "Asking price",
      "Catalog value",
      "Dealer price",
      "Last sold price",
      "Price range",
      "Sold average",
      "Sold median",
    ],
  },
};
async function signIn(page: Page, f: Awaited<ReturnType<typeof valuationFixture>>) {
  expect(
    (
      await page.request.post("/api/auth/sign-in/email", {
        data: { email: f.email, password: f.password },
        headers: { origin, "x-forwarded-for": f.ip },
      })
    ).status(),
  ).toBe(200);
}
async function append(
  page: Page,
  locale: "de" | "en",
  amount: string,
  note: string,
  date?: string,
) {
  const c = labels[locale];
  const form = page.getByRole("form", { name: c.form, exact: true });
  await form.getByLabel(c.amount, { exact: true }).fill(amount);
  await form.getByLabel(c.note, { exact: true }).fill(note);
  if (date) {
    await form.getByLabel(c.when, { exact: true }).selectOption("earlier");
    await form.getByLabel(c.date, { exact: true }).fill(date);
    await form.getByLabel(c.time, { exact: true }).fill("03:04:05.006");
  }
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/valuations") && r.request().method() === "POST",
    { timeout: 10000 },
  );
  await form.getByRole("button", { name: c.save, exact: true }).click();
  const ack = await response;
  expect(ack.status()).toBe(201);
  return (await ack.json()).valuation as { id: string; amountMinor: string; observedAt: string };
}
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((r) => (release = r));
  return { promise, release };
}

test.describe("private valuation history", () => {
  test.skip(!enabled, "requires owned PostgreSQL 17 test database");
  for (const locale of ["de", "en"] as const) {
    test(`production manual journey (${locale})`, async ({ page, browser }, info) => {
      const f = await valuationFixture();
      const c = labels[locale];
      let anonymous: Awaited<ReturnType<typeof browser.newContext>> | undefined;
      try {
        await signIn(page, f);
        await page.goto(`/${locale}/collections/${f.collectionId}`);
        await page.getByRole("link", { name: /Synthetic collector's card/ }).click();
        await page.getByRole("link", { name: c.title, exact: true }).click();
        await expect(page.getByRole("heading", { name: c.title, exact: true })).toBeVisible();
        await expect(page.getByText(c.disabled, { exact: true })).toBeVisible();
        await expect(page.getByText(c.empty, { exact: true })).toBeVisible();
        const api = await page.request.get(`/api/v1/items/${f.itemId}/valuations`);
        const production = (await api.json()).summary;
        expect(production.external).toMatchObject({
          availability: "DISPLAY_DISABLED",
          groups: [],
          nextGroupCursor: null,
        });
        expect(JSON.stringify(production)).not.toContain(f.providerId);
        const granted = await f.query.getItemValuationSummary(f.itemId, { userId: f.ownerId });
        expect(
          (
            await page.request.get(
              `/api/v1/items/${f.itemId}/valuations?view=source-history&source=${granted.external.groups[0]!.source}`,
            )
          ).status(),
        ).toBe(404);
        await page.getByLabel(c.amount, { exact: true }).focus();
        await page.keyboard.press("Tab");
        await expect(page.getByLabel(c.currency, { exact: true })).toBeFocused();
        await page.getByLabel(c.amount, { exact: true }).fill(locale === "de" ? "1,01" : "1.01");
        await page.getByLabel(c.currency, { exact: true }).selectOption("JPY");
        await page.getByRole("button", { name: c.save, exact: true }).click();
        await expect(
          page.getByRole("form", { name: c.form, exact: true }).getByRole("alert"),
        ).toContainText(locale === "de" ? "Prüfe Betrag" : "Check the amount");
        expect(await db!.valuation.count({ where: { itemId: f.itemId } })).toBe(0);
        await page.getByLabel(c.currency, { exact: true }).selectOption("EUR");
        const zero = await append(page, locale, "0", "SYNTHETIC PRIVATE ZERO");
        const history = page.getByRole("region", { name: c.history, exact: true });
        const latest = page.getByRole("region", { name: c.latest, exact: true });
        await expect(history.locator(`[data-valuation-id="${zero.id}"]`)).toContainText(
          locale === "de" ? "0,00" : "0.00",
        );
        const persisted = await db!.valuation.findUniqueOrThrow({ where: { id: zero.id } });
        expect(persisted.amountMinor).toBe(0n);
        expect(persisted.minorUnitExponent).toBe(2);
        expect(persisted.currency).toBe("EUR");
        expect(persisted.note).toBe("SYNTHETIC PRIVATE ZERO");
        expect(persisted.itemId).toBe(f.itemId);
        const large = await append(
          page,
          locale,
          locale === "de" ? "92.233.720.368.547.758,07" : "92,233,720,368,547,758.07",
          "SYNTHETIC PRIVATE MAX",
        );
        await expect(latest.locator(`[data-valuation-id="${large.id}"]`)).toContainText(
          locale === "de" ? "92.233.720.368.547.758,07" : "92,233,720,368,547,758.07",
        );
        expect(
          (await db!.valuation.findUniqueOrThrow({ where: { id: large.id } })).amountMinor,
        ).toBe(9223372036854775807n);
        const backdated = await append(page, locale, "1", "SYNTHETIC BACKDATE", "2025-01-02");
        await expect(history.locator(`[data-valuation-id="${backdated.id}"]`)).toBeVisible();
        await expect(latest.locator(`[data-valuation-id="${large.id}"]`)).toBeVisible();
        expect(backdated.observedAt).toBe("2025-01-02T03:04:05.006Z");
        await page.reload();
        await expect(latest.locator(`[data-valuation-id="${large.id}"]`)).toBeVisible();
        // In-progress text cannot silently change its numeric meaning in the other locale.
        await page.getByLabel(c.amount, { exact: true }).fill("1,234");
        await page.getByRole("link", { name: new RegExp(c.discard) }).click();
        const other = locale === "de" ? "en" : "de";
        await expect(page.getByLabel(labels[other].amount, { exact: true })).toHaveValue("");
        await expect(page.locator(`[data-valuation-id="${large.id}"]`).first()).toContainText(
          other === "de" ? "92.233.720.368.547.758,07" : "92,233,720,368,547,758.07",
        );
        const shell = page.getByRole("navigation", {
          name: other === "de" ? "Sprache" : "Language",
          exact: true,
        });
        await shell
          .getByRole("link", { name: locale === "de" ? "Deutsch" : "English", exact: true })
          .click();
        await expect(page).toHaveURL(new RegExp(`/${locale}$`));
        await page.goto(`/${locale}/items/${f.itemId}/values`);
        const service = createValuationService(db!, f.ownerId);
        for (let n = 0; n < 22; n++)
          await service.addManualValuation(f.itemId, {
            amountMinor: BigInt(n),
            currency: "EUR",
            observedAt: `2024-01-${String(n + 1).padStart(2, "0")}T00:00:00.000Z`,
            note: `Synthetic older ${n}`,
          });
        await page.getByRole("button", { name: c.refresh, exact: true }).click();
        await expect(history.locator("[data-valuation-id]")).toHaveCount(20);
        await history.getByRole("button", { name: c.older, exact: true }).click();
        await expect(history.locator("[data-valuation-id]")).toHaveCount(5);
        await expect(latest.locator(`[data-valuation-id="${large.id}"]`)).toBeVisible();
        await history.getByRole("button", { name: c.newest, exact: true }).click();
        await expect(history.locator("[data-valuation-id]")).toHaveCount(20);
        const split = await createItemService(db!, f.ownerId).splitQuantityItem(f.itemId, 1);
        const items = await db!.collectibleItem.findMany({ where: { ownerId: f.ownerId } });
        const target = items.find((i) => i.id !== f.itemId)!;
        expect(split).toBeTruthy();
        expect(await db!.valuation.count({ where: { itemId: f.itemId } })).toBe(25);
        expect(await db!.valuation.count({ where: { itemId: target.id } })).toBe(0);
        await page.getByRole("button", { name: c.refresh, exact: true }).click();
        await expect(
          page.getByText(locale === "de" ? "Menge: 2" : "Quantity: 2", { exact: true }),
        ).toBeVisible();
        if (
          (locale === "de" && info.project.name === "desktop") ||
          (locale === "en" && info.project.name === "mobile")
        ) {
          const dir = resolve(process.cwd(), "../../../sammlerraum-values-preview");
          await mkdir(dir, { recursive: true });
          await page.screenshot({
            path: resolve(dir, `${locale}-${info.project.name}-production.png`),
            fullPage: true,
          });
        }
        await db!.collection.update({
          where: { id: f.collectionId },
          data: { visibility: "PUBLIC" },
        });
        await db!.collectibleItem.update({
          where: { id: f.itemId },
          data: { visibility: "PUBLIC" },
        });
        anonymous = await browser.newContext();
        const publicPage = await anonymous.newPage();
        await publicPage.goto(`/${locale}/items/${f.itemId}`);
        await expect(
          publicPage.getByRole("heading", { name: "Synthetic collector's card", exact: true }),
        ).toBeVisible();
        await expect(publicPage.getByRole("link", { name: c.title, exact: true })).toHaveCount(0);
        await expect(publicPage.getByText("SYNTHETIC PRIVATE MAX", { exact: true })).toHaveCount(0);
        await createItemService(db!, f.ownerId).archiveItem(f.itemId);
        await page.getByRole("button", { name: c.refresh, exact: true }).click();
        await expect(page.getByRole("form", { name: c.form, exact: true })).toHaveCount(0);
        await expect(latest.locator(`[data-valuation-id="${large.id}"]`)).toBeVisible();
        expect(
          (
            await page.request.post(`/api/v1/items/${f.itemId}/valuations`, {
              data: { amountMinor: "1", currency: "EUR" },
              headers: { origin },
            })
          ).status(),
        ).toBe(409);
        anonymous ??= await browser.newContext();
        const anon = await anonymous.newPage();
        await anon.goto(`/${locale}/items/${f.itemId}/values`);
        await expect(anon.getByText("SYNTHETIC PRIVATE MAX")).toHaveCount(0);
        expect((await anon.request.get(`/api/v1/items/${f.itemId}/valuations`)).status()).toBe(401);
        // A different authenticated owner is hidden, even for a public personal item.
        const stranger = await db!.user.create({
          data: {
            id: `values_stranger_${f.ownerId}`,
            name: "Synthetic stranger",
            email: `stranger-${f.email}`,
            emailVerified: true,
            accounts: {
              create: {
                id: `account_${f.ownerId}`,
                accountId: `values_stranger_${f.ownerId}`,
                providerId: "credential",
                password: (await db!.account.findFirstOrThrow({ where: { userId: f.ownerId } }))
                  .password!,
              },
            },
          },
        });
        try {
          expect(
            (
              await anon.request.post("/api/auth/sign-in/email", {
                data: { email: stranger.email, password: f.password },
                headers: { origin, "x-forwarded-for": f.ip },
              })
            ).status(),
          ).toBe(200);
          expect((await anon.request.get(`/api/v1/items/${f.itemId}/valuations`)).status()).toBe(
            404,
          );
          await anon.goto(`/${locale}/items/${f.itemId}/values`);
          await expect(anon.getByText("SYNTHETIC PRIVATE MAX")).toHaveCount(0);
        } finally {
          await db!.user.delete({ where: { id: stranger.id } });
        }
        await db!.collectibleItem.update({
          where: { id: f.itemId },
          data: { disposedAt: new Date() },
        });
        await page.getByRole("button", { name: c.refresh, exact: true }).click();
        await expect(
          page.getByText(
            locale === "de"
              ? "Abgegebenes Stück: Der Verlauf ist schreibgeschützt."
              : "Disposed item: history is read-only.",
            { exact: true },
          ),
        ).toBeVisible();
        await db!.collection.update({
          where: { id: f.collectionId },
          data: { deletedAt: new Date() },
        });
        await page.getByRole("button", { name: c.refresh, exact: true }).click();
        await expect(page.locator("[data-valuation-id]")).toHaveCount(0);
      } finally {
        try {
          await page.unrouteAll({ behavior: "wait" });
        } finally {
          try {
            await anonymous?.close();
          } finally {
            await cleanupValuationFixture(f);
          }
        }
      }
    });
    test(`external UI transport rendering from real ingestion and query (${locale})`, async ({
      page,
    }, info) => {
      const f = await valuationFixture();
      const c = labels[locale];
      const queriedIds = new Set<string>();
      const scopeRelease = gate(),
        scopeCaptured = gate();
      const recheckRelease = gate(),
        recheckCaptured = gate();
      let gets = 0,
        denySource = false,
        failRecheck = false,
        holdHistorical = false;
      const disabledHandlers = createValuationRouteHandlers(
        createValuationRouteDependencies(
          db!,
          { api: { getSession: async () => ({ user: { id: f.ownerId } }) } },
          origin,
        ),
      );
      try {
        await signIn(page, f);
        await page.route(`**/api/v1/items/${f.itemId}/valuations?*`, async (route) => {
          const request = route.request(),
            url = new URL(request.url());
          expect(request.method()).toBe("GET");
          expect(url.pathname).toBe(`/api/v1/items/${f.itemId}/valuations`);
          const options = ValuationQuerySchema.parse(Object.fromEntries(url.searchParams));
          gets++;
          if (options.view === "summary") {
            if (failRecheck) {
              failRecheck = false;
              recheckCaptured.release();
              await recheckRelease.promise;
              await route.abort("failed");
              return;
            }
            const summary = ValuationSummarySchema.parse(
              await f.query.getItemValuationSummary(f.itemId, { userId: f.ownerId }, options),
            );
            for (const group of summary.external.groups)
              for (const row of group.history.records) {
                queriedIds.add(row.id);
                const stored = await db!.marketObservation.findUniqueOrThrow({
                  where: { id: row.id },
                });
                expect(stored.currency).toBe(row.source.currency);
                expect(stored.minorUnitExponent).toBe(row.minorUnitExponent);
                if (row.price.type === "POINT")
                  expect(stored.amountMinor?.toString()).toBe(row.price.amountMinor);
              }
            if (holdHistorical && options.scope === "HISTORICAL_MAPPING") {
              holdHistorical = false;
              scopeCaptured.release();
              await scopeRelease.promise;
            }
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ summary }),
            });
          } else {
            if (denySource) {
              denySource = false;
              const unavailable = await disabledHandlers.GET(new Request(url), f.itemId);
              expect(unavailable.status).toBe(404);
              await route.fulfill({
                status: unavailable.status,
                headers: Object.fromEntries(unavailable.headers),
                body: await unavailable.text(),
              });
              return;
            }
            const sourceHistory = SourceHistorySchema.parse(
              await f.query.getItemValuationSourceHistory(f.itemId, { userId: f.ownerId }, options),
            );
            sourceHistory.history.records.forEach((row) => queriedIds.add(row.id));
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify({ sourceHistory }),
            });
          }
        });
        await page.goto(`/${locale}/items/${f.itemId}/values`);
        const external = page.getByRole("region", { name: c.external, exact: true });
        for (const kind of [c.kinds[3], c.kinds[5], c.kinds[6], c.kinds[0]])
          await expect(
            external.getByRole("heading", { name: new RegExp(`^${kind} ·`) }),
          ).toBeVisible();
        await expect(
          external.getByText(
            locale === "de"
              ? /Mehrere Währungen; keine Umrechnung/
              : /Multiple currencies; no conversion/,
          ),
        ).toBeVisible();
        const asking = external
          .getByRole("region")
          .filter({ has: page.getByRole("heading", { name: new RegExp(`^${c.kinds[0]} ·`) }) });
        await expect(asking.locator("[data-observation-id]")).toHaveCount(5);
        await expect(asking.locator("[data-observation-id]").first()).toContainText(
          locale === "de" ? "90.071.992.547.409,93" : "90,071,992,547,409.93",
        );
        await asking.locator("article details summary").first().focus();
        await page.keyboard.press("Enter");
        await expect(
          asking.locator("article").first().getByText("0", { exact: true }),
        ).toBeVisible();
        await expect(
          asking
            .locator("article")
            .first()
            .getByText(locale === "de" ? "Nein" : "No", { exact: true }),
        ).toBeVisible();
        await expect(
          asking.locator("article").first().getByText("synthetic-asking_price", { exact: true }),
        ).toBeVisible();
        await expect(
          asking.locator("article").first().getByText("Synthetic sample", { exact: true }),
        ).toBeVisible();
        await expect(
          asking
            .locator("article")
            .first()
            .getByText("Fixture observations, not live quotes", { exact: true }),
        ).toBeVisible();
        const sourceDay = external
          .locator(".value-source")
          .filter({ has: page.getByRole("heading", { name: new RegExp(`^${c.kinds[3]} ·`) }) })
          .locator("article")
          .first()
          .locator("time")
          .first();
        await expect(sourceDay).toHaveAttribute("datetime", "2025-01-02T00:00:00.000Z");
        await expect(sourceDay).not.toContainText(":");
        const sourceSecond = external
          .locator(".value-source")
          .filter({ has: page.getByRole("heading", { name: new RegExp(`^${c.kinds[5]} ·`) }) })
          .locator("article")
          .first()
          .locator("time")
          .first();
        await expect(sourceSecond).toHaveAttribute("datetime", "2025-01-02T03:04:05.000Z");
        await expect(sourceSecond).not.toContainText(locale === "de" ? ",000" : ".000");
        await expect(asking.locator("article").first().locator("time").first()).toContainText(
          locale === "de" ? ",123" : ".123",
        );
        expect(
          (await page
            .locator("html")
            .evaluate((element) => (element as unknown as { scrollWidth: number }).scrollWidth)) <=
            page.viewportSize()!.width,
        ).toBe(true);
        const link = asking.getByRole("link", { name: /example.org/ }).first();
        await expect(link).toHaveAttribute("rel", "noopener noreferrer");
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("href", "https://example.org/card/001");
        await asking
          .getByRole("button", {
            name: locale === "de" ? "Quellverlauf anzeigen" : "View source history",
            exact: true,
          })
          .click();
        await expect(asking.locator("[data-observation-id]")).toHaveCount(20);
        await asking.getByRole("button", { name: c.older, exact: true }).click();
        await expect(asking.locator("[data-observation-id]")).toHaveCount(3);
        const retainedManual = await append(
          page,
          locale,
          "0",
          "Synthetic retained manual during source rejection",
        );
        await expect(
          page
            .getByRole("region", { name: c.latest, exact: true })
            .locator(`[data-valuation-id="${retainedManual.id}"]`),
        ).toBeVisible();
        const rejectionDraft = locale === "de" ? "1,23" : "1.23";
        await page.getByLabel(c.amount, { exact: true }).fill(rejectionDraft);
        await page.getByLabel(c.note, { exact: true }).fill("Synthetic source-rejection draft");
        denySource = true;
        failRecheck = true;
        await asking
          .getByRole("button", {
            name: locale === "de" ? "Quellverlauf anzeigen" : "View source history",
            exact: true,
          })
          .click();
        await recheckCaptured.promise;
        await expect(external.locator("[data-observation-id]")).toHaveCount(0);
        await expect(external.locator(".value-source")).toHaveCount(0);
        await expect(
          external.getByText(
            locale === "de"
              ? /Mehrere Währungen; keine Umrechnung/
              : /Multiple currencies; no conversion/,
          ),
        ).toHaveCount(0);
        await expect(external.getByRole("button", { name: c.next, exact: true })).toHaveCount(0);
        await expect(external.getByRole("button", { name: c.first, exact: true })).toHaveCount(0);
        await expect(page.getByLabel(c.amount, { exact: true })).toHaveValue(rejectionDraft);
        await expect(page.getByLabel(c.note, { exact: true })).toHaveValue(
          "Synthetic source-rejection draft",
        );
        await expect(
          page
            .getByRole("region", { name: c.latest, exact: true })
            .locator(`[data-valuation-id="${retainedManual.id}"]`),
        ).toBeVisible();
        recheckRelease.release();
        await expect(
          page.getByText(
            locale === "de"
              ? "Die Quellzuordnung wurde geändert oder ist nicht verfügbar. Der Verlauf wurde erneut geprüft; bei Bedarf erneut laden."
              : "Source mapping changed or is unavailable. History was checked again; retry if needed.",
            { exact: true },
          ),
        ).toBeVisible();
        await expect(external.locator(".value-source")).toHaveCount(0);
        await expect(
          external.getByText(
            locale === "de"
              ? /Mehrere Währungen; keine Umrechnung/
              : /Multiple currencies; no conversion/,
          ),
        ).toHaveCount(0);
        await expect(page.getByLabel(c.note, { exact: true })).toHaveValue(
          "Synthetic source-rejection draft",
        );
        await page.getByRole("button", { name: c.refresh, exact: true }).click();
        await expect(external.locator(".value-source")).toHaveCount(4);
        await expect(
          external.getByText(
            locale === "de"
              ? /Mehrere Währungen; keine Umrechnung/
              : /Multiple currencies; no conversion/,
          ),
        ).toBeVisible();
        await expect(page.getByLabel(c.amount, { exact: true })).toHaveValue(rejectionDraft);
        await expect(page.getByLabel(c.note, { exact: true })).toHaveValue(
          "Synthetic source-rejection draft",
        );
        await external.getByRole("button", { name: c.next, exact: true }).focus();
        await page.keyboard.press("Enter");
        for (const kind of [c.kinds[4], c.kinds[1], c.kinds[2]])
          await expect(
            external.getByRole("heading", { name: new RegExp(`^${kind} ·`) }),
          ).toBeVisible();
        const range = external
          .locator(".value-source")
          .filter({ has: page.getByRole("heading", { name: new RegExp(`^${c.kinds[4]} ·`) }) });
        await expect(range.locator(".value-amount").first()).toContainText(
          locale === "de" ? "1,00" : "1.00",
        );
        await expect(range.locator(".value-amount").first()).toContainText(
          locale === "de" ? "2,50" : "2.50",
        );
        for (const row of await external.locator("[data-observation-id]").all()) {
          const id = await row.getAttribute("data-observation-id");
          expect(queriedIds.has(id!)).toBe(true);
        }
        const scopeDraft = locale === "de" ? "1,23" : "1.23";
        await page.getByLabel(c.amount, { exact: true }).fill(scopeDraft);
        await page.getByLabel(c.note, { exact: true }).fill("Synthetic scope draft");
        holdHistorical = true;
        await external.getByLabel(c.scope, { exact: true }).selectOption("HISTORICAL_MAPPING");
        await scopeCaptured.promise;
        await expect(external.locator("[data-observation-id]")).toHaveCount(0);
        await expect(page.getByLabel(c.amount, { exact: true })).toHaveValue(scopeDraft);
        await expect(page.getByLabel(c.note, { exact: true })).toHaveValue("Synthetic scope draft");
        scopeRelease.release();
        await expect(external.getByLabel(c.scope, { exact: true })).toHaveValue(
          "HISTORICAL_MAPPING",
        );
        await expect(external.locator(".value-source")).toHaveCount(4);
        const state = await db!.catalogEntry.findUniqueOrThrow({ where: { id: f.entryId } });
        await createCatalogMaintenanceService(db!).updateCatalogEntry(f.entryId, state.revision, {
          text: { language: "en", title: "Synthetic revised reference" },
        });
        await page.getByRole("button", { name: c.refresh, exact: true }).click();
        await expect(page.getByRole("button", { name: c.refresh, exact: true })).toBeEnabled();
        await external.locator("article details summary").first().click();
        await expect(
          external
            .getByText(
              locale === "de"
                ? "Die Katalogrevision hat sich seit dieser Beobachtung geändert."
                : "Catalog revision has changed since this observation.",
              { exact: true },
            )
            .first(),
        ).toBeVisible();
        if (
          (locale === "de" && info.project.name === "desktop") ||
          (locale === "en" && info.project.name === "mobile")
        ) {
          const dir = resolve(process.cwd(), "../../../sammlerraum-values-preview");
          await mkdir(dir, { recursive: true });
          await page.screenshot({
            path: resolve(dir, `${locale}-${info.project.name}-external-transport.png`),
            fullPage: true,
          });
        }
        const catalog = createCatalogMaintenanceService(db!);
        const current = await db!.catalogEntry.findUniqueOrThrow({ where: { id: f.entryId } });
        const identifier = await db!.catalogExternalIdentifier.findFirstOrThrow({
          where: { entryId: f.entryId, active: true },
        });
        const retired = await catalog.removeExternalIdentifier(
          f.entryId,
          current.revision,
          identifier.id,
        );
        await external.getByLabel(c.scope, { exact: true }).selectOption("CURRENT_MAPPING");
        await expect(
          external.getByText(
            locale === "de"
              ? "Keine unterstützte Quellzuordnung für diese Katalogreferenz."
              : "No supported source mapping for this catalog reference.",
            { exact: true },
          ),
        ).toBeVisible();
        await external.getByLabel(c.scope, { exact: true }).selectOption("HISTORICAL_MAPPING");
        await expect(external.locator(".value-source")).toHaveCount(4);
        await external.locator("article details summary").first().click();
        await expect(
          external
            .getByText(
              locale === "de"
                ? "Diese Quellzuordnung ist stillgelegt."
                : "This source mapping is retired.",
              { exact: true },
            )
            .first(),
        ).toBeVisible();
        const variant = await catalog.addCatalogVariant(f.entryId, retired.revision, {
          text: { language: "en", title: "Synthetic variant" },
        });
        const mapping = await catalog.addExternalIdentifier(f.entryId, variant.revision, {
          variantId: variant.id,
          namespace: f.providerId,
          type: "product",
          value: "variant-001",
        });
        await createItemService(db!, f.ownerId).linkItemToCatalog(f.itemId, f.entryId, variant.id);
        await external.getByLabel(c.scope, { exact: true }).selectOption("CURRENT_MAPPING");
        await expect(
          external.getByText(
            locale === "de"
              ? "Keine geeigneten Beobachtungen in diesem Zuordnungsbereich."
              : "No eligible observations in this mapping scope.",
            { exact: true },
          ),
        ).toBeVisible();
        await catalog.rollbackCatalogEntry(f.entryId, mapping.revision, retired.revision);
        await page.getByRole("button", { name: c.refresh, exact: true }).click();
        await expect(
          external.getByText(
            locale === "de"
              ? "Diese Katalogvariante ist stillgelegt. Aktuelle Quellen sind nicht verfügbar. Eigene Schätzungen bleiben unabhängig."
              : "This catalog variant is retired. Current sources are unavailable. Personal estimates remain independent.",
            { exact: true },
          ),
        ).toBeVisible();
        await expect(page.getByLabel(c.amount, { exact: true })).toBeEnabled();
        const variantManual = await append(
          page,
          locale,
          "1",
          "Synthetic manual on retired variant",
        );
        expect(
          (await db!.valuation.findUniqueOrThrow({ where: { id: variantManual.id } })).amountMinor,
        ).toBe(100n);
        await createItemService(db!, f.ownerId).unlinkItemFromCatalog(f.itemId);
        await page.getByRole("button", { name: c.refresh, exact: true }).click();
        await expect(
          external.getByText(
            locale === "de"
              ? "Keine Katalogreferenz verknüpft. Du kannst sie im Stückeditor zuordnen."
              : "No catalog reference linked. You can link one in the item editor.",
            { exact: true },
          ),
        ).toBeVisible();
        expect(gets).toBeGreaterThan(4);
        expect(
          (await page
            .locator("html")
            .evaluate((element) => (element as unknown as { scrollWidth: number }).scrollWidth)) <=
            page.viewportSize()!.width,
        ).toBe(true);
      } finally {
        scopeRelease.release();
        scopeCaptured.release();
        recheckRelease.release();
        recheckCaptured.release();
        try {
          await page.unrouteAll({ behavior: "wait" });
        } finally {
          await cleanupValuationFixture(f);
        }
      }
    });
  }
  test("production confirmed save, failed refresh, invalid read and session expiry", async ({
    page,
  }) => {
    const f = await valuationFixture();
    let posts = 0;
    try {
      await signIn(page, f);
      await page.goto(`/en/items/${f.itemId}/values`);
      await expect(page.getByLabel(labels.en.amount, { exact: true })).toBeEnabled();
      page.on("request", (request) => {
        if (
          request.method() === "POST" &&
          new URL(request.url()).pathname === `/api/v1/items/${f.itemId}/valuations`
        )
          posts++;
      });
      await page.route(`**/api/v1/items/${f.itemId}/valuations?*`, (route) =>
        route.abort("failed"),
      );
      const saved = await append(page, "en", "10.00", "Synthetic confirmed private note");
      await expect(
        page.getByText(
          "Saved; history could not be refreshed. The confirmed entry is shown below.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        page
          .getByRole("region", { name: "Confirmed saved entry", exact: true })
          .locator(`[data-valuation-id="${saved.id}"]`),
      ).toContainText("EUR");
      await expect(page.getByLabel(labels.en.note, { exact: true })).toHaveValue("");
      await page.unrouteAll({ behavior: "wait" });
      await page.getByRole("button", { name: labels.en.refresh, exact: true }).click();
      await expect(
        page
          .getByRole("region", { name: labels.en.latest, exact: true })
          .locator(`[data-valuation-id="${saved.id}"]`),
      ).toBeVisible();
      expect(posts).toBe(1);
      await page.route(`**/api/v1/items/${f.itemId}/valuations?*`, async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        body.summary.aggregate = 0;
        await route.fulfill({ response, body: JSON.stringify(body) });
      });
      await page.getByRole("button", { name: labels.en.refresh, exact: true }).click();
      await expect(
        page.getByText("History could not be loaded. Try reading it again.", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Displayed history may be out of date.", { exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("region", { name: labels.en.latest, exact: true })
          .locator(`[data-valuation-id="${saved.id}"]`),
      ).toBeVisible();
      await page.unrouteAll({ behavior: "wait" });
      await db!.session.deleteMany({ where: { userId: f.ownerId } });
      await page.getByRole("button", { name: labels.en.refresh, exact: true }).click();
      await expect(
        page.getByText("Your session ended. Sign in again to view this private history.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator("[data-valuation-id]")).toHaveCount(0);
      await expect(page.getByText("Synthetic confirmed private note", { exact: true })).toHaveCount(
        0,
      );
      await expect(page.getByRole("form", { name: labels.en.form, exact: true })).toHaveCount(0);
    } finally {
      try {
        await page.unrouteAll({ behavior: "wait" });
      } finally {
        await cleanupValuationFixture(f);
      }
    }
  });
  test("production response races and unknown save outcome never replay writes", async ({
    page,
  }) => {
    const f = await valuationFixture();
    const old = gate(),
      oldDone = gate(),
      dropped = gate(),
      captured = gate();
    let delayed = false,
      posts = 0;
    try {
      await signIn(page, f);
      await page.goto(`/en/items/${f.itemId}/values`);
      await expect(page.getByLabel(labels.en.amount, { exact: true })).toBeEnabled();
      await page.route(`**/api/v1/items/${f.itemId}/valuations?*`, async (route) => {
        if (!delayed) {
          delayed = true;
          const response = await route.fetch();
          captured.release();
          try {
            await old.promise;
            await route.fulfill({ response });
          } finally {
            oldDone.release();
          }
        } else await route.continue();
      });
      await page.getByRole("button", { name: labels.en.refresh, exact: true }).click();
      await captured.promise;
      const ack = await append(page, "en", "12.34", "Synthetic race ACK");
      await expect(
        page
          .getByRole("region", { name: labels.en.latest, exact: true })
          .locator(`[data-valuation-id="${ack.id}"]`),
      ).toBeVisible();
      old.release();
      await oldDone.promise;
      await expect(
        page
          .getByRole("region", { name: labels.en.latest, exact: true })
          .locator(`[data-valuation-id="${ack.id}"]`),
      ).toBeVisible();
      await page.unrouteAll({ behavior: "wait" });
      await page.route(`**/api/v1/items/${f.itemId}/valuations`, async (route) => {
        expect(route.request().method()).toBe("POST");
        posts++;
        try {
          const response = await route.fetch();
          expect(response.status()).toBe(201);
          await route.abort("failed");
        } finally {
          dropped.release();
        }
      });
      await page.getByLabel(labels.en.amount, { exact: true }).fill("56.78");
      await page.getByLabel(labels.en.note, { exact: true }).fill("Synthetic lost ACK");
      await page.getByRole("button", { name: labels.en.save, exact: true }).click();
      await expect.poll(() => posts).toBe(1);
      await dropped.promise;
      await expect(page.getByText(new RegExp(labels.en.unknown))).toBeVisible();
      await expect(page.getByRole("button", { name: labels.en.save, exact: true })).toBeDisabled();
      await page.getByRole("button", { name: labels.en.refresh, exact: true }).click();
      await expect(
        page
          .getByRole("region", { name: labels.en.history, exact: true })
          .getByText("Synthetic lost ACK", { exact: true }),
      ).toBeVisible();
      expect(posts).toBe(1);
      expect(
        await db!.valuation.count({ where: { itemId: f.itemId, note: "Synthetic lost ACK" } }),
      ).toBe(1);
      await expect(page.getByRole("button", { name: labels.en.save, exact: true })).toBeDisabled();
    } finally {
      old.release();
      captured.release();
      oldDone.release();
      dropped.release();
      try {
        await page.unrouteAll({ behavior: "wait" });
      } finally {
        await cleanupValuationFixture(f);
      }
    }
  });
});
