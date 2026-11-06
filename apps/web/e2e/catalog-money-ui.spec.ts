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

for (const locale of ["de", "en"] as const) {
  test(`${locale}: a persisted moderator documents and withdraws one canonical assertion through the private UI`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI database");
    const h = await fixture(page, false),
      m = (locale === "de" ? de : en).LegacyMoney;
    await page.goto(`/${locale}/catalog/${h.entry.state.id}`);
    await page.getByRole("button", { name: m.review, exact: true }).click({ timeout: 3000 });
    const review = page.getByRole("region", { name: m.review, exact: true });
    await review.getByRole("textbox", { name: m.scale, exact: true }).fill("0");
    await review
      .getByRole("combobox", { name: m.unitMeaning, exact: true })
      .selectOption("SUPPORTED");
    await review
      .getByRole("combobox", { name: m.evidenceCategory, exact: true })
      .selectOption("OPERATOR_VERIFIED_RECORD");
    await review
      .getByRole("textbox", { name: m.evidenceReason, exact: true })
      .fill("PRIVATE-CANONICAL-UI-REASON");
    await review
      .getByRole("textbox", { name: m.evidenceReference, exact: true })
      .fill("PRIVATE-CANONICAL-UI-REF");
    await review.getByRole("checkbox").first().check();
    await review.getByRole("button", { name: m.confirmMeaning, exact: true }).click();
    await expect(review.getByText(m.savedSeparately, { exact: true })).toBeVisible();
    const classified = CatalogMoneyRevisionResultSchema.parse(
      await (await page.request.get(h.base)).json(),
    );
    expect(classified.money[0]!.raw).toEqual(h.before.money[0]!.raw);
    expect(classified.money[0]!.interpretation).toMatchObject({
      kind: "INTERPRETED",
      decimal: "100",
      exponent: 0,
      evidenceCategory: "OPERATOR_VERIFIED_RECORD",
    });
    await review.locator("summary").filter({ hasText: m.history }).click();
    await expect(review.getByText("PRIVATE-CANONICAL-UI-REASON", { exact: true })).toBeVisible();
    await review.getByRole("button", { name: m.revoke, exact: true }).click();
    const group = review.getByRole("group", { name: m.revoke, exact: true });
    await group
      .getByRole("textbox", { name: m.revokeReason, exact: true })
      .fill("PRIVATE-EXACT-WITHDRAWAL");
    await group.getByRole("checkbox").check();
    await group.getByRole("button", { name: m.confirmRevoke, exact: true }).click();
    await expect(review.getByRole("group", { name: m.revoke, exact: true })).toHaveCount(0);
    const after = CatalogMoneyRevisionResultSchema.parse(
      await (await page.request.get(h.base)).json(),
    );
    expect(after.money[0]!.raw).toEqual(h.before.money[0]!.raw);
    expect(after.money[0]!.interpretation).toMatchObject({ kind: "UNKNOWN", reason: "REVOKED" });
    const regular = await searchFixture();
    expect(
      (
        await page.request.post("/api/auth/sign-in/email", {
          headers: { origin, "x-forwarded-for": regular.ip },
          data: { email: regular.email, password: regular.password },
        })
      ).status(),
    ).toBe(200);
    await page.goto(`/${locale}/catalog/${h.entry.state.id}`);
    await expect(page.getByRole("button", { name: m.review, exact: true })).toHaveCount(0);
    await expect(page.getByText("PRIVATE-CANONICAL-UI-REASON", { exact: true })).toHaveCount(0);
    expect(
      (
        await page.request.get(
          `${h.base}/classifications?target=ENTRY&definitionId=${h.definitionId}`,
        )
      ).status(),
    ).toBe(403);
    await page.waitForLoadState("networkidle", { timeout: 5000 });
  });
}

for (const locale of ["de", "en"] as const) {
  test(`${locale}: a copied canonical assertion opens its actual origin scope and is withdrawn there`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI database");
    const h = await fixture(page, true),
      m = (locale === "de" ? de : en).LegacyMoney;
    const submitted = await page.request.post("/api/v1/catalog/money-proposals", {
      headers: { origin },
      data: {
        proposal: {
          targetEntryId: h.entry.state.id,
          baseRevision: 1,
          summary: "Create a direct evidence copy for origin navigation",
          patch: {
            kind: "UPDATE_ENTRY",
            input: {
              text: { language: "en", title: "Current copied revision" },
              attributes: [
                { definitionId: h.definitionId, value: { amountMinor: 100, currency: "AFN" } },
              ],
            },
          },
        },
        money: {
          schemaVersion: 1,
          intents: [
            {
              target: "ENTRY",
              definitionId: h.definitionId,
              intent: { op: "RETAIN", expectedFactToken: h.before.money[0]!.factToken },
            },
          ],
        },
      },
    });
    expect(submitted.status()).toBe(201);
    const proposal = await submitted.json();
    expect(
      (
        await page.request.post(`/api/v1/catalog/proposals/${proposal.proposal.id}/decision`, {
          headers: { origin },
          data: { decision: "APPROVE", reason: "Synthetic copy lifecycle" },
        })
      ).status(),
    ).toBe(200);
    await page.goto(`/${locale}/catalog/${h.entry.state.id}`);
    await page.getByRole("button", { name: m.review, exact: true }).click();
    const review = page.getByRole("region", { name: m.review, exact: true });
    await review.locator("summary").filter({ hasText: m.history }).click();
    await expect(review.getByRole("button", { name: m.revoke, exact: true })).toHaveCount(0);
    const originHistory = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        new URL(r.url()).pathname.endsWith(`/revisions/1/money/classifications`),
    );
    await review.getByRole("button", { name: `${m.openOrigin} · 1`, exact: true }).click();
    expect((await originHistory).status()).toBe(200);
    await review.locator("summary").filter({ hasText: m.history }).click();
    await review.getByRole("button", { name: m.revoke, exact: true }).click();
    const revoke = review.getByRole("group", { name: m.revoke, exact: true });
    await revoke
      .getByRole("textbox", { name: m.revokeReason, exact: true })
      .fill("Withdraw the actual original assertion");
    await revoke.getByRole("checkbox").check();
    await revoke.getByRole("button", { name: m.confirmRevoke, exact: true }).click();
    await expect(revoke).toHaveCount(0);
    const copied = CatalogMoneyRevisionResultSchema.parse(
      await (
        await page.request.get(`/api/v1/catalog/entries/${h.entry.state.id}/revisions/2/money`)
      ).json(),
    );
    expect(copied.money[0]!.raw).toEqual(h.before.money[0]!.raw);
    expect(copied.money[0]!.interpretation).toMatchObject({ kind: "UNKNOWN", reason: "REVOKED" });
    await page.waitForLoadState("networkidle", { timeout: 5000 });
  });
}

async function captureProposal(page: Page) {
  let receive!: (value: { status: number; body: any }) => void;
  const receipt = new Promise<{ status: number; body: any }>((resolve) => {
    receive = resolve;
  });
  await page.route("**/api/v1/catalog/money-proposals", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    receive({ status: response.status(), body });
    await route.fulfill({ response });
  });
  return { receipt };
}
async function openComposer(page: Page, locale: "de" | "en") {
  const h = await fixture(page, true),
    t = (locale === "de" ? de : en).Catalog,
    m = (locale === "de" ? de : en).LegacyMoney;
  await page.goto(`/${locale}/catalog/${h.entry.state.id}`);
  await page.getByRole("button", { name: t.proposeCorrection, exact: true }).click();
  const form = page.getByRole("form", { name: t.proposalForm, exact: true });
  await expect(form.getByRole("button", { name: t.submitProposal, exact: true })).toBeEnabled();
  return {
    ...h,
    t,
    m,
    form,
    region: form.getByRole("region", {
      name: h.category.definitions[0]!.labels[locale],
      exact: true,
    }),
  };
}
for (const locale of ["de", "en"] as const) {
  for (const mode of ["REPLACE", "CLEAR"] as const)
    test(`${locale}: deliberate canonical ${mode} is separate from retained raw and uses the required proposal summary`, async ({
      page,
    }) => {
      test.skip(!active, "Requires owned monetary UI database");
      const h = await openComposer(page, locale);
      await h.region
        .getByRole("button", { name: mode === "REPLACE" ? h.m.replace : h.m.clear, exact: true })
        .click();
      if (mode === "REPLACE")
        await h.region.getByRole("textbox", { name: h.m.newAmount, exact: true }).fill("1,25");
      await h.form
        .getByRole("textbox", { name: h.t.changeSummary, exact: true })
        .fill("Explicit canonical correction audit");
      await h.form.getByRole("button", { name: h.t.submitProposal, exact: true }).click();
      await expect(h.form.getByText(h.m.confirmRequired, { exact: true })).toBeVisible();
      await h.region.getByRole("checkbox").check();
      const capture = await captureProposal(page);
      await h.form.getByRole("button", { name: h.t.submitProposal, exact: true }).click();
      const { status, body } = await capture.receipt;
      expect(status).toBe(201);
      expect(body.proposal.summary).toBe("Explicit canonical correction audit");
      if (mode === "CLEAR") {
        expect(body.proposal.moneyInterpretation.paths).toEqual([]);
        expect(body.proposal.patch.input.attributes).toEqual([]);
      } else
        expect(body.proposal.moneyInterpretation.paths[0]).toMatchObject({
          kind: "AUTHORED",
          replacesFactToken: h.before.money[0]!.factToken,
          receipt: {
            raw: { amountMinor: "125", currency: "AFN" },
            exponent: 2,
            normalizedDecimal: "1.25",
          },
        });
      expect(
        (
          await page.request.post(`/api/v1/catalog/proposals/${body.proposal.id}/decision`, {
            headers: { origin },
            data: { decision: "APPROVE", reason: "Synthetic deliberate UI correction" },
          })
        ).status(),
      ).toBe(200);
      const after = CatalogMoneyRevisionResultSchema.parse(
        await (
          await page.request.get(`/api/v1/catalog/entries/${h.entry.state.id}/revisions/2/money`)
        ).json(),
      );
      if (mode === "CLEAR") expect(after.money).toEqual([]);
      else
        expect(after.money[0]).toMatchObject({
          raw: { amountMinor: "125", currency: "AFN" },
          interpretation: { kind: "INTERPRETED", exponent: 2, decimal: "1.25" },
        });
      await page.waitForLoadState("networkidle", { timeout: 5000 });
    });
  test(`${locale}: new variant money uses operation-relative NEW intent and only the server assigns its UUID`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI database");
    const h = await openComposer(page, locale);
    await h.form
      .getByRole("combobox", { name: h.t.proposalKind, exact: true })
      .selectOption("ADD_VARIANT");
    await h.form
      .getByRole("textbox", { name: h.t.title, exact: true })
      .fill("Explicit new monetary variant");
    await h.region
      .getByRole("textbox", { name: h.category.definitions[0]!.labels[locale], exact: true })
      .fill("2,50");
    await h.region.getByRole("combobox", { name: h.m.currency, exact: true }).selectOption("AFN");
    await h.form
      .getByRole("textbox", { name: h.t.changeSummary, exact: true })
      .fill("Add a new monetary variant");
    const capture = await captureProposal(page);
    await h.form.getByRole("button", { name: h.t.submitProposal, exact: true }).click();
    const { status, body } = await capture.receipt;
    expect(status).toBe(201);
    expect(body.proposal.patch.input).not.toHaveProperty("id");
    expect(body.proposal.moneyInterpretation.paths[0]).toMatchObject({
      target: "OPERATION_VARIANT",
      kind: "AUTHORED",
      receipt: { raw: { amountMinor: "250", currency: "AFN" }, exponent: 2 },
    });
    expect(
      (
        await page.request.post(`/api/v1/catalog/proposals/${body.proposal.id}/decision`, {
          headers: { origin },
          data: { decision: "APPROVE", reason: "Synthetic generated target proof" },
        })
      ).status(),
    ).toBe(200);
    const after = CatalogMoneyRevisionResultSchema.parse(
      await (
        await page.request.get(`/api/v1/catalog/entries/${h.entry.state.id}/revisions/2/money`)
      ).json(),
    );
    expect(
      after.money.find(
        (view) => view.subject.family === "CATALOG" && view.subject.target.kind === "VARIANT",
      ),
    ).toMatchObject({
      raw: { amountMinor: "250", currency: "AFN" },
      interpretation: { kind: "INTERPRETED", decimal: "2.50" },
    });
    await page.waitForLoadState("networkidle", { timeout: 5000 });
  });
  test(`${locale}: canonical monetary draft and correction summary survive locale navigation`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI database");
    const h = await openComposer(page, locale);
    await h.region.getByRole("button", { name: h.m.replace, exact: true }).click();
    await h.region.getByRole("textbox", { name: h.m.newAmount, exact: true }).fill("1,23");
    await h.region.getByRole("checkbox").check();
    await h.form
      .getByRole("textbox", { name: h.t.changeSummary, exact: true })
      .fill("Private literal correction summary");
    const next = locale === "de" ? "en" : "de",
      shell = (locale === "de" ? de : en).Shell;
    await page
      .getByRole("link", { name: locale === "de" ? shell.english : shell.german, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${next}/catalog/${h.entry.state.id}$`));
    const t = (next === "de" ? de : en).Catalog,
      m = (next === "de" ? de : en).LegacyMoney,
      form = page.getByRole("form", { name: t.proposalForm, exact: true }),
      region = form.getByRole("region", {
        name: h.category.definitions[0]!.labels[next],
        exact: true,
      });
    await expect(region.getByRole("textbox", { name: m.newAmount, exact: true })).toHaveValue(
      "1,23",
    );
    await expect(region.getByRole("checkbox")).toBeChecked();
    await expect(form.getByRole("textbox", { name: t.changeSummary, exact: true })).toHaveValue(
      "Private literal correction summary",
    );
    const capture = await captureProposal(page);
    await form.getByRole("button", { name: t.submitProposal, exact: true }).click();
    const { body } = await capture.receipt;
    expect(body.proposal.moneyInterpretation.paths[0].replacesFactToken).toBe(
      h.before.money[0]!.factToken,
    );
    await page.waitForLoadState("networkidle", { timeout: 5000 });
  });
}

for (const locale of ["de", "en"] as const) {
  test(`${locale}: a committed proposal with lost acknowledgment cannot replay until explicit proposal reconciliation`, async ({
    page,
  }) => {
    test.skip(!active, "Requires owned monetary UI database");
    const h = await openComposer(page, locale);
    await h.form
      .getByRole("textbox", { name: h.t.changeSummary, exact: true })
      .fill("Committed proposal with lost response");
    let posts = 0;
    await page.route("**/api/v1/catalog/money-proposals", async (route) => {
      posts++;
      expect((await route.fetch()).status()).toBe(201);
      await route.abort("failed");
    });
    await h.form.getByRole("button", { name: h.t.submitProposal, exact: true }).click();
    await expect(
      h.form.getByRole("button", { name: h.t.submitProposal, exact: true }),
    ).toBeDisabled();
    await expect(h.form.locator("p.error")).toHaveText(h.m.unknownOutcome);
    await page.unroute("**/api/v1/catalog/money-proposals");
    await h.form
      .getByRole("checkbox", {
        name:
          locale === "de"
            ? "Ich habe meine Vorschläge geprüft und möchte einen getrennten neuen Vorschlag beginnen."
            : "I checked my proposals and want to start a separate proposal.",
        exact: true,
      })
      .check();
    await h.form.getByRole("button", { name: h.m.restartNew, exact: true }).click();
    await expect(h.form).toHaveCount(0);
    await page.getByRole("button", { name: h.t.proposeCorrection, exact: true }).click();
    const form = page.getByRole("form", { name: h.t.proposalForm, exact: true });
    await expect(form.getByRole("textbox", { name: h.t.changeSummary, exact: true })).toHaveValue(
      "",
    );
    expect(posts).toBe(1);
    await form
      .getByRole("textbox", { name: h.t.changeSummary, exact: true })
      .fill("An explicitly separate proposal");
    const capture = await captureProposal(page);
    await form.getByRole("button", { name: h.t.submitProposal, exact: true }).click();
    expect((await capture.receipt).status).toBe(201);
    await page.waitForLoadState("networkidle", { timeout: 5000 });
  });
}
