import { expect, test, type Page } from "@playwright/test";
import { createCategoryTemplateMaintenanceService } from "@sammlerraum/domain/catalog/category-template-service";
import { createCatalogMaintenanceService } from "@sammlerraum/domain/catalog/catalog-service";
import { CatalogMoneyRevisionResultSchema } from "@sammlerraum/contracts/catalog-money";
import de from "../messages/de.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import { searchFixture, db, enabled, origin } from "./support/search-fixture";
const active = enabled && process.env.RUN_MONEY_UI_E2E === "1";
if (
  active &&
  !/^sammlerraum_m4_browser_[0-9]+_test$/u.test(
    new URL(process.env.DATABASE_URL ?? "").pathname.slice(1),
  )
)
  throw Error("Owned monetary UI database required");
test.afterAll(async () => {
  await db?.$disconnect();
});
// Immutable canonical evidence and its synthetic actors live until this entire owned database is dropped.
async function fixture(page: Page, known: boolean) {
  const f = await searchFixture();
  await db!.applicationRoleGrant.create({
    data: {
      userId: f.ownerId,
      role: "MODERATOR",
      grantedBy: "synthetic fixture",
      reason: "Canonical UI proof",
    },
  });
  const category = await createCategoryTemplateMaintenanceService(db!).createCategoryTemplate({
    key: `ui_money_${f.ownerId.replaceAll("-", "")}`,
    labels: { de: `Preis ${f.ownerId}`, en: `Price ${f.ownerId}` },
    definitions: [
      {
        key: "price",
        type: "MONEY",
        labels: { de: "Historischer Katalogpreis", en: "Historical catalog price" },
      },
    ],
  });
  const definitionId = category.definitions[0]!.id;
  const entry = await createCatalogMaintenanceService(db!).createCatalogEntry({
    categoryTemplateId: category.id,
    text: { language: "en", title: `Canonical original ${f.ownerId}` },
    attributes: [{ definitionId, value: { amountMinor: 100, currency: "AFN" } }],
  });
  expect(
    (
      await page.request.post("/api/auth/sign-in/email", {
        headers: { origin, "x-forwarded-for": f.ip },
        data: { email: f.email, password: f.password },
      })
    ).status(),
  ).toBe(200);
  const base = `/api/v1/catalog/entries/${entry.state.id}/revisions/1/money`;
  if (known) {
    const original = CatalogMoneyRevisionResultSchema.parse(
      await (await page.request.get(base)).json(),
    );
    expect(
      (
        await page.request.post(`${base}/classifications`, {
          headers: { origin },
          data: {
            schemaVersion: 1,
            target: { kind: "ENTRY" },
            definitionId,
            input: {
              expectedFactToken: original.money[0]!.factToken,
              exponent: 0,
              unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
              evidence: {
                category: "OPERATOR_VERIFIED_RECORD",
                reason: "Synthetic private historical catalog record",
                reference: "PRIVATE-UI-RECORD",
              },
            },
          },
        })
      ).status(),
    ).toBe(201);
  }
  const before = CatalogMoneyRevisionResultSchema.parse(
    await (await page.request.get(base)).json(),
  );
  return { f, category, definitionId, entry, base, before };
}
for (const locale of ["de", "en"] as const)
  for (const known of [false, true]) {
    test(`${locale}: a text-only catalog proposal retains ${known ? "known historical" : "unresolved"} money using its exact frozen source`, async ({
      page,
    }) => {
      test.skip(!active, "Requires owned monetary UI database");
      const h = await fixture(page, known),
        t = (locale === "de" ? de : en).Catalog;
      await page.goto(`/${locale}/catalog/${h.entry.state.id}`);
      await page.getByRole("button", { name: t.proposeCorrection, exact: true }).click();
      const form = page
        .locator("form")
        .filter({ has: page.getByRole("button", { name: t.submitProposal, exact: true }) });
      await form
        .getByRole("textbox", { name: t.title, exact: true })
        .fill("Text-only canonical correction");
      await form
        .getByRole("textbox", { name: t.changeSummary, exact: true })
        .fill("Synthetic title-only correction preserves money");
      const response = page.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          /\/api\/v1\/catalog\/(money-)?proposals$/u.test(new URL(r.url()).pathname),
      );
      await form.getByRole("button", { name: t.submitProposal, exact: true }).click();
      const submitted = await response;
      expect(submitted.status()).toBe(201);
      expect(new URL(submitted.url()).pathname).toBe("/api/v1/catalog/money-proposals");
      const body = await submitted.json();
      expect(body.proposal.moneyInterpretation.paths).toEqual([
        {
          target: "ENTRY",
          definitionId: h.definitionId,
          kind: "RETAIN",
          factToken: h.before.money[0]!.factToken,
        },
      ]);
      expect(
        (
          await page.request.post(`/api/v1/catalog/proposals/${body.proposal.id}/decision`, {
            headers: { origin },
            data: { decision: "APPROVE", reason: "Synthetic exact canonical UI proof" },
          })
        ).status(),
      ).toBe(200);
      const after = CatalogMoneyRevisionResultSchema.parse(
        await (
          await page.request.get(`/api/v1/catalog/entries/${h.entry.state.id}/revisions/2/money`)
        ).json(),
      );
      expect(after.money[0]!.raw).toEqual(h.before.money[0]!.raw);
      expect(after.money[0]!.interpretation).toMatchObject(
        known ? { kind: "INTERPRETED", decimal: "100", exponent: 0 } : { kind: "UNKNOWN" },
      );
      expect(
        CatalogMoneyRevisionResultSchema.parse(await (await page.request.get(h.base)).json())
          .money[0]!.factToken,
      ).toBe(h.before.money[0]!.factToken);
      await page.waitForLoadState("networkidle", { timeout: 5000 });
    });
  }

for (const locale of ["de", "en"] as const) {
  test(`${locale}: canonical readout uses the exact evidenced stored scale instead of the current locale currency scale`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI database");
    const h = await fixture(page, false),
      m = (locale === "de" ? de : en).LegacyMoney;
    expect(
      (
        await page.request.post(`${h.base}/classifications`, {
          headers: { origin },
          data: {
            schemaVersion: 1,
            target: { kind: "ENTRY" },
            definitionId: h.definitionId,
            input: {
              expectedFactToken: h.before.money[0]!.factToken,
              exponent: 2,
              unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
              evidence: {
                category: "OPERATOR_VERIFIED_RECORD",
                reason: "Synthetic evidenced hundredths",
                reference: "PRIVATE-SCALE-RECORD",
              },
            },
          },
        })
      ).status(),
    ).toBe(201);
    await page.goto(`/${locale}/catalog/${h.entry.state.id}`);
    const readout = page.getByRole("status", {
      name: `${h.category.definitions[0]!.labels[locale]} · ${m.storedValue}`,
      exact: true,
    });
    await expect(readout).toContainText(locale === "de" ? "1,00 AFN" : "1.00 AFN", {
      timeout: 3000,
    });
    await page.waitForLoadState("networkidle", { timeout: 5000 });
  });
}

for (const locale of ["de", "en"] as const)
  for (const retained of [false, true]) {
    test(`${locale}: frozen ${retained ? "retained" : "authored"} proposal facts never borrow a newer source meaning`, async ({
      page,
    }) => {
      test.skip(!active, "Requires owned monetary UI database");
      const h = await fixture(page, true),
        t = (locale === "de" ? de : en).Catalog,
        m = (locale === "de" ? de : en).LegacyMoney;
      const summary = `Frozen ${retained ? "retained" : "authored"} facts ${h.f.ownerId}`;
      const intent = retained
        ? { op: "RETAIN", expectedFactToken: h.before.money[0]!.factToken }
        : {
            op: "REPLACE",
            expectedFactToken: h.before.money[0]!.factToken,
            authoring: {
              kind: "DECIMAL",
              profileId: "legacy-money-iso-2026-09-17-v1",
              currency: "AFN",
              decimal: "1",
            },
          };
      const submitted = await page.request.post("/api/v1/catalog/money-proposals", {
        headers: { origin },
        data: {
          proposal: {
            targetEntryId: h.entry.state.id,
            baseRevision: 1,
            summary,
            patch: {
              kind: "UPDATE_ENTRY",
              input: {
                attributes: [
                  { definitionId: h.definitionId, value: { amountMinor: 100, currency: "AFN" } },
                ],
              },
            },
          },
          money: {
            schemaVersion: 1,
            intents: [{ target: "ENTRY", definitionId: h.definitionId, intent }],
          },
        },
      });
      expect(submitted.status()).toBe(201);
      expect(
        (
          await page.request.post(`${h.base}/classifications`, {
            headers: { origin },
            data: {
              schemaVersion: 1,
              target: { kind: "ENTRY" },
              definitionId: h.definitionId,
              input: {
                expectedFactToken: h.before.money[0]!.factToken,
                exponent: 1,
                unit: { kind: "SUPPORTED", unitKey: "iso4217-2026-09-17:AFN" },
                evidence: {
                  category: "OPERATOR_VERIFIED_RECORD",
                  reason: "Newer actual evidence after proposal froze",
                  reference: "PRIVATE-NEWER-RECORD",
                },
              },
            },
          })
        ).status(),
      ).toBe(201);
      await page.goto(`/${locale}/catalog/proposals`);
      await page.getByRole("button", { name: summary, exact: true }).click();
      const detail = page.getByRole("region", { name: t.proposalDetail, exact: true });
      await expect(
        detail
          .getByText(retained ? m.proposalSourceChanged : m.capturedProposal, { exact: true })
          .first(),
      ).toBeVisible({ timeout: 3000 });
      await detail.locator("summary").filter({ hasText: t.beforeChange }).click();
      const amounts = detail.getByRole("status", {
        name: `${h.category.definitions[0]!.labels[locale]} · ${m.storedValue}`,
        exact: true,
      });
      await expect(amounts).toHaveCount(2);
      await expect(amounts.nth(0)).toHaveText(
        retained ? "100 AFN" : locale === "de" ? "1,00 AFN" : "1.00 AFN",
      );
      await expect(amounts.nth(1)).toHaveText("100 AFN");
      await expect(
        detail.getByText(locale === "de" ? "10,0 AFN" : "10.0 AFN", { exact: true }),
      ).toHaveCount(0);
      await page.waitForLoadState("networkidle", { timeout: 5000 });
    });
  }
