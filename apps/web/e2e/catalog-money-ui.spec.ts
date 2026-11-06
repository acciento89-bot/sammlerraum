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
