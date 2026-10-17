import { expect, test } from "@playwright/test";
import { catalogFixture, cleanupCatalog, db, enabled, origin } from "./support/catalog-fixture";

test.beforeEach(async () => {
  if (enabled) await db.rateLimit.deleteMany();
});
test.afterAll(async () => {
  if (enabled) await db.rateLimit.deleteMany();
  await db.$disconnect();
});

test.describe("catalog, personal condition and external grading", () => {
  test.skip(!enabled, "requires migrated test database");
  for (const locale of ["de", "en"] as const) {
    test(`unsaved condition survives a grading refresh (${locale})`, async ({ page }) => {
      const fixture = await catalogFixture();
      try {
        expect(
          (
            await page.request.post("/api/auth/sign-in/email", {
              data: { email: fixture.email, password: fixture.password },
              headers: { origin },
            })
          ).status(),
        ).toBe(200);
        await page.goto(`/${locale}/items/${fixture.item.id}`);
        const condition = page.getByLabel(
          locale === "de" ? "Eigener Zustand" : "Personal condition",
          { exact: true },
        );
        await expect(condition).toHaveValue(fixture.scheme.options[0]!.id);
        await condition.selectOption(fixture.scheme.options[1]!.id);
        const grading = page.getByRole("region", {
          name: locale === "de" ? "Externes Grading" : "External grading",
          exact: true,
        });
        await grading
          .getByLabel(locale === "de" ? "Grading-Anbieter" : "Grading provider", { exact: true })
          .fill("Draft check");
        await grading
          .getByLabel(locale === "de" ? "Grade / Bewertungsangabe" : "Grade / assessment", {
            exact: true,
          })
          .fill("A");
        await grading
          .getByRole("button", {
            name: locale === "de" ? "Grading speichern" : "Save grading",
            exact: true,
          })
          .click();
        await expect(grading.getByRole("status")).toContainText(
          locale === "de" ? "Grading gespeichert" : "Grading saved",
        );
        await expect(condition).toHaveValue(fixture.scheme.options[1]!.id);
        expect(
          (await (await page.request.get(`/api/v1/items/${fixture.item.id}/condition`)).json())
            .condition.conditionOption.id,
        ).toBe(fixture.scheme.options[0]!.id);
        const save = page.getByRole("button", {
          name: locale === "de" ? "Zustand speichern" : "Save condition",
          exact: true,
        });
        await save.click();
        await expect(
          page.getByRole("status").filter({
            hasText: locale === "de" ? "Zustand gespeichert" : "Condition saved",
          }),
        ).toBeVisible();
        await expect(save).toBeDisabled();
        expect(
          (await (await page.request.get(`/api/v1/items/${fixture.item.id}/condition`)).json())
            .condition.conditionOption.id,
        ).toBe(fixture.scheme.options[1]!.id);
        // A genuinely changed saved condition remains authoritative on the next sibling refresh.
        expect(
          (
            await page.request.put(`/api/v1/items/${fixture.item.id}/condition`, {
              data: { optionId: fixture.scheme.options[0]!.id },
              headers: { origin },
            })
          ).status(),
        ).toBe(200);
        await grading
          .getByLabel(locale === "de" ? "Grading-Anbieter" : "Grading provider", { exact: true })
          .fill("Saved facts check");
        await grading
          .getByLabel(locale === "de" ? "Grade / Bewertungsangabe" : "Grade / assessment", {
            exact: true,
          })
          .fill("B");
        await grading
          .getByRole("button", {
            name: locale === "de" ? "Grading speichern" : "Save grading",
            exact: true,
          })
          .click();
        await expect(condition).toHaveValue(fixture.scheme.options[0]!.id);
      } finally {
        await cleanupCatalog(fixture);
      }
    });
    test(`unsaved category and explicit clear survive link refreshes (${locale})`, async ({
      page,
    }) => {
      const fixture = await catalogFixture();
      try {
        const { createCatalogMaintenanceService } = await import(
          "@sammlerraum/domain/catalog/catalog-service"
        );
        const entry = await createCatalogMaintenanceService(db).createCatalogEntry({
          categoryTemplateId: fixture.category.id,
          text: { language: "en", title: `Draft reference ${fixture.id}` },
        });
        expect(
          (
            await page.request.post("/api/auth/sign-in/email", {
              data: { email: fixture.email, password: fixture.password },
              headers: { origin },
            })
          ).status(),
        ).toBe(200);
        await page.goto(`/${locale}/items/${fixture.item.id}`);
        const category = page.getByLabel(locale === "de" ? "Kategorie" : "Category", {
          exact: true,
        });
        await expect(category).toHaveValue(fixture.category.id);
        await category.selectOption("");
        const clear = page.getByLabel(
          locale === "de"
            ? "Den aktuellen Zustand beim Kategorienwechsel entfernen"
            : "Clear the current condition when changing category",
          { exact: true },
        );
        await clear.check();
        const link = page.getByRole("region", {
          name: locale === "de" ? "Katalogverknüpfung" : "Catalog reference",
          exact: true,
        });
        await link
          .getByLabel(locale === "de" ? "Katalog durchsuchen" : "Search catalog", { exact: true })
          .fill(`Draft reference ${fixture.id}`);
        await link
          .getByRole("button", { name: locale === "de" ? "Suchen" : "Search", exact: true })
          .click();
        await link
          .getByRole("button", {
            name: locale === "de" ? "Referenz auswählen" : "Choose reference",
            exact: true,
          })
          .click();
        await link
          .getByRole("button", {
            name: locale === "de" ? "Mit diesem Stück verknüpfen" : "Link to this item",
            exact: true,
          })
          .click();
        await expect(link.getByRole("status")).toContainText(
          locale === "de" ? "Katalogverknüpfung gespeichert" : "Catalog reference saved",
        );
        await expect(category).toHaveValue("");
        await expect(clear).toBeChecked();
        expect(
          (await (await page.request.get(`/api/v1/items/${fixture.item.id}`)).json()).item,
        ).toMatchObject({
          categoryTemplateId: fixture.category.id,
          conditionOptionId: fixture.scheme.options[0]!.id,
          catalogEntryId: entry.state.id,
        });
        await link
          .getByRole("button", {
            name: locale === "de" ? "Verknüpfung lösen" : "Unlink reference",
            exact: true,
          })
          .click();
        await expect(link.getByRole("status")).toContainText(
          locale === "de" ? "Verknüpfung gelöst" : "Reference unlinked",
        );
        await expect(category).toHaveValue("");
        await expect(clear).toBeChecked();
        await page
          .getByRole("button", {
            name: locale === "de" ? "Kategorie speichern" : "Save category",
            exact: true,
          })
          .click();
        await expect(clear).toHaveCount(0);
        await expect(
          page.getByLabel(locale === "de" ? "Eigener Zustand" : "Personal condition", {
            exact: true,
          }),
        ).toHaveValue("");
        expect(
          (await (await page.request.get(`/api/v1/items/${fixture.item.id}`)).json()).item,
        ).toMatchObject({
          categoryTemplateId: null,
          conditionOptionId: null,
          catalogEntryId: null,
        });
      } finally {
        await cleanupCatalog(fixture);
      }
    });
    test(`changing own condition preserves external grading (${locale})`, async ({ page }) => {
      const fixture = await catalogFixture();
      try {
        expect(
          (
            await page.request.post("/api/auth/sign-in/email", {
              data: { email: fixture.email, password: fixture.password },
              headers: { origin },
            })
          ).status(),
        ).toBe(200);
        const condition = await page.request.get(`/api/v1/items/${fixture.item.id}/condition`);
        expect(condition.status()).toBe(200);
        expect((await condition.json()).condition.conditionOption.labels.en).toBe("Mint");
        const grades = await page.request.get(`/api/v1/items/${fixture.item.id}/gradings`);
        expect(grades.status()).toBe(200);
        expect((await grades.json()).gradings[0]).toMatchObject({ provider: "PSA", grade: "9" });
        await page.goto(`/${locale}/items/${fixture.item.id}`);
        await expect(
          page.getByRole("heading", { name: "My graded card", exact: true }),
        ).toBeVisible();
        await expect(page.getByText("PSA 9", { exact: true })).toBeVisible();
        await page
          .getByLabel(locale === "de" ? "Eigener Zustand" : "Personal condition", { exact: true })
          .selectOption(fixture.scheme.options[1]!.id);
        await page
          .getByRole("button", {
            name: locale === "de" ? "Zustand speichern" : "Save condition",
            exact: true,
          })
          .click();
        await expect(
          page
            .getByRole("status")
            .filter({ hasText: locale === "de" ? "Zustand gespeichert" : "Condition saved" }),
        ).toBeVisible();
        await page.reload();
        await expect(page.getByText("PSA 9", { exact: true })).toBeVisible();
        await expect(
          page.getByLabel(locale === "de" ? "Eigener Zustand" : "Personal condition", {
            exact: true,
          }),
        ).toHaveValue(fixture.scheme.options[1]!.id);
        expect(
          (await (await page.request.get(`/api/v1/items/${fixture.item.id}/gradings`)).json())
            .gradings[0],
        ).toMatchObject({ provider: "PSA", grade: "9", certificateNo: "000123" });
      } finally {
        await cleanupCatalog(fixture);
      }
    });
  }
});

// These journeys use actual owner sessions, canonical services and separately granted review authority.
for (const locale of ["de", "en"] as const) {
  test.describe(`catalog reference workflow ${locale}`, () => {
    test.skip(!enabled, "requires migrated test database");
    test("owner chooses a disambiguated variant, unlinks and keeps personal facts", async ({
      page,
    }, info) => {
      const fixture = await catalogFixture();
      try {
        const { createCatalogMaintenanceService } = await import(
          "@sammlerraum/domain/catalog/catalog-service"
        );
        const service = createCatalogMaintenanceService(db);
        const entry = await service.createCatalogEntry({
          categoryTemplateId: fixture.category.id,
          text: { language: "en", title: `Reference ${fixture.id}` },
        });
        await service.addCatalogVariant(entry.state.id, 1, {
          text: { language: "en", title: "Same card" },
          language: "de",
          edition: "First edition",
          reference: "DE-001",
        });
        await service.addCatalogVariant(entry.state.id, 2, {
          text: { language: "en", title: "Same card" },
          language: "en",
          edition: "Second edition",
          reference: "EN-002",
        });
        expect(
          (
            await page.request.post("/api/auth/sign-in/email", {
              data: { email: fixture.email, password: fixture.password },
              headers: { origin },
            })
          ).status(),
        ).toBe(200);
        await page.goto(`/${locale}/items/${fixture.item.id}`);
        const region = page.getByRole("region", {
          name: locale === "de" ? "Katalogverknüpfung" : "Catalog reference",
          exact: true,
        });
        await region
          .getByLabel(locale === "de" ? "Katalog durchsuchen" : "Search catalog", { exact: true })
          .fill(`Reference ${fixture.id}`);
        await region
          .getByRole("button", { name: locale === "de" ? "Suchen" : "Search", exact: true })
          .click();
        await region
          .getByRole("button", {
            name: locale === "de" ? "Referenz auswählen" : "Choose reference",
            exact: true,
          })
          .click();
        const variants = region.getByLabel(
          locale === "de" ? "Variante auswählen" : "Choose variant",
          { exact: true },
        );
        await expect(variants).toContainText("de · First edition · DE-001");
        await expect(variants).toContainText("en · Second edition · EN-002");
        await variants.selectOption({ label: "Same card · en · Second edition · EN-002" });
        await region
          .getByRole("button", {
            name: locale === "de" ? "Mit diesem Stück verknüpfen" : "Link to this item",
            exact: true,
          })
          .click();
        await expect(
          region.getByRole("status").filter({
            hasText: locale === "de" ? "Katalogverknüpfung gespeichert" : "Catalog reference saved",
          }),
        ).toBeVisible();
        await expect(
          region
            .getByText("Same card · en · Second edition · EN-002", { exact: true })
            .filter({ visible: true }),
        ).toBeVisible();
        await page.getByRole("banner").scrollIntoViewIfNeeded();
        await page.screenshot({
          path: info.outputPath(`catalog-owner-${info.project.name}-${locale}.png`),
          fullPage: true,
        });
        const deletion = page.waitForResponse(
          (response) =>
            response.request().method() === "DELETE" && response.url().endsWith("/catalog-link"),
        );
        await region
          .getByRole("button", {
            name: locale === "de" ? "Verknüpfung lösen" : "Unlink reference",
            exact: true,
          })
          .click();
        const deleted = await deletion;
        expect(deleted.status(), await deleted.text()).toBe(200);
        await expect(region.getByRole("status")).toContainText(
          locale === "de" ? "Verknüpfung gelöst" : "Reference unlinked",
        );
        const saved = await (await page.request.get(`/api/v1/items/${fixture.item.id}`)).json();
        expect(saved.item).toMatchObject({
          catalogEntryId: null,
          catalogVariantId: null,
          categoryTemplateId: fixture.category.id,
          conditionOptionId: fixture.scheme.options[0]!.id,
          privateNotes: "PRIVATE CATALOG SECRET",
          purchaseAmountMinor: 12345,
        });
        await expect(page.getByText("PSA 9", { exact: true })).toBeVisible();
      } finally {
        await cleanupCatalog(fixture);
      }
    });
    test("ordinary proposal is reviewed using a real grant and a reasoned revision rollback", async ({
      page,
      browser,
    }, info) => {
      const owner = await catalogFixture();
      const moderator = await catalogFixture();
      const review = await browser.newContext();
      const reviewer = await review.newPage();
      try {
        await page.request.post("/api/auth/sign-in/email", {
          data: { email: owner.email, password: owner.password },
          headers: { origin },
        });
        expect((await page.request.get("/api/v1/catalog/moderation/proposals")).status()).toBe(403);
        await page.goto(`/${locale}/catalog`);
        await page
          .getByRole("button", {
            name: locale === "de" ? "Neuen Eintrag vorschlagen" : "Propose new entry",
            exact: true,
          })
          .click();
        const form = page.getByRole("form", {
          name: locale === "de" ? "Katalogvorschlag" : "Catalog proposal",
          exact: true,
        });
        await form
          .getByLabel(locale === "de" ? "Kategorie" : "Category", { exact: true })
          .selectOption(owner.category.id);
        await form
          .getByLabel(locale === "de" ? "Titel" : "Title", { exact: true })
          .fill(`Community ${owner.id}`);
        await form
          .getByLabel(locale === "de" ? "Änderungszusammenfassung" : "Change summary", {
            exact: true,
          })
          .fill("Authored community entry");
        await form
          .getByRole("button", {
            name: locale === "de" ? "Vorschlag absenden" : "Submit proposal",
            exact: true,
          })
          .click();
        await expect(
          page
            .getByRole("status")
            .filter({ hasText: locale === "de" ? "Vorschlag eingereicht" : "Proposal submitted" }),
        ).toBeVisible();
        const pending = await (await page.request.get("/api/v1/catalog/proposals")).json();
        expect(pending.proposals[0].state).toBe("PENDING");
        expect(JSON.stringify(pending)).not.toContain("PRIVATE CATALOG SECRET");
        expect(JSON.stringify(pending)).not.toContain("12345");
        await db.applicationRoleGrant.create({
          data: {
            userId: moderator.id,
            role: "MODERATOR",
            grantedBy: "synthetic e2e fixture",
            reason: "Test-only review journey",
          },
        });
        await reviewer.request.post("/api/auth/sign-in/email", {
          data: { email: moderator.email, password: moderator.password },
          headers: { origin },
        });
        await reviewer.goto(`/${locale}/catalog/moderation`);
        await reviewer
          .getByRole("button", { name: "Authored community entry", exact: true })
          .click();
        await reviewer
          .getByLabel(locale === "de" ? "Begründung" : "Decision reason", { exact: true })
          .fill("Checked authored reference facts");
        await reviewer
          .getByRole("button", { name: locale === "de" ? "Annehmen" : "Approve", exact: true })
          .click();
        await expect(
          reviewer.getByRole("status").filter({
            hasText: locale === "de" ? "Entscheidung gespeichert" : "Decision recorded",
          }),
        ).toBeVisible();
        const approved = await (
          await page.request.get(`/api/v1/catalog/proposals/${pending.proposals[0].id}`)
        ).json();
        expect(approved.proposal.state).toBe("APPROVED");
        const entryId = approved.proposal.resultEntryId;
        await page.goto(`/${locale}/catalog/${entryId}`);
        await page
          .getByRole("button", {
            name: locale === "de" ? "Korrektur vorschlagen" : "Propose correction",
            exact: true,
          })
          .click();
        const correction = page.getByRole("form", {
          name: locale === "de" ? "Katalogvorschlag" : "Catalog proposal",
          exact: true,
        });
        await correction
          .getByLabel(locale === "de" ? "Titel" : "Title", { exact: true })
          .fill(`Corrected ${owner.id}`);
        await correction
          .getByLabel(locale === "de" ? "Änderungszusammenfassung" : "Change summary", {
            exact: true,
          })
          .fill("Correct title");
        await correction
          .getByRole("button", {
            name: locale === "de" ? "Vorschlag absenden" : "Submit proposal",
            exact: true,
          })
          .click();
        await expect(
          page
            .getByRole("status")
            .filter({ hasText: locale === "de" ? "Vorschlag eingereicht" : "Proposal submitted" }),
        ).toBeVisible();
        await reviewer.goto(`/${locale}/catalog/moderation`);
        await reviewer.getByRole("button", { name: "Correct title", exact: true }).click();
        await reviewer
          .getByLabel(locale === "de" ? "Begründung" : "Decision reason", { exact: true })
          .fill("Reviewed correction");
        await reviewer
          .getByRole("button", { name: locale === "de" ? "Annehmen" : "Approve", exact: true })
          .click();
        await expect(
          reviewer.getByRole("status").filter({
            hasText: locale === "de" ? "Entscheidung gespeichert" : "Decision recorded",
          }),
        ).toBeVisible();
        await reviewer.goto(`/${locale}/catalog/${entryId}`);
        await reviewer
          .getByRole("button", {
            name: locale === "de" ? "Version 1 ansehen" : "Preview revision 1",
            exact: true,
          })
          .click();
        await reviewer
          .getByLabel(locale === "de" ? "Begründung der Wiederherstellung" : "Restoration reason", {
            exact: true,
          })
          .fill("Restore original authored title");
        await reviewer
          .getByLabel(
            locale === "de"
              ? "Diese Version als aktuellen Stand wiederherstellen"
              : "Restore this revision as the current entry",
            { exact: true },
          )
          .check();
        await reviewer
          .getByRole("button", {
            name: locale === "de" ? "Wiederherstellung bestätigen" : "Confirm restoration",
            exact: true,
          })
          .click();
        await expect(
          reviewer.getByRole("status").filter({
            hasText: locale === "de" ? "Version wiederhergestellt" : "Revision restored",
          }),
        ).toBeVisible();
        expect(
          (await (await reviewer.request.get(`/api/v1/catalog/entries/${entryId}`)).json()).entry,
        ).toMatchObject({ revision: 3, state: { text: { title: `Community ${owner.id}` } } });
        expect(
          await reviewer.evaluate(
            () =>
              (globalThis as unknown as { document: { documentElement: { scrollWidth: number } } })
                .document.documentElement.scrollWidth,
          ),
        ).toBeLessThanOrEqual(reviewer.viewportSize()!.width + 1);
        await reviewer.getByRole("banner").scrollIntoViewIfNeeded();
        await reviewer.screenshot({
          path: info.outputPath(`catalog-review-${info.project.name}-${locale}.png`),
          fullPage: true,
        });
      } finally {
        await review.close();
        await cleanupCatalog(owner);
        await cleanupCatalog(moderator);
      }
    });
  });
}

for (const locale of ["de", "en"] as const) {
  test.describe(`independent personal metadata ${locale}`, () => {
    test.skip(!enabled, "requires migrated test database");
    test("explicit category clearing, authored grading, retained archive facts and owner privacy", async ({
      page,
      browser,
    }, info) => {
      const owner = await catalogFixture();
      const foreign = await catalogFixture();
      const context = await browser.newContext();
      try {
        expect(
          (
            await page.request.post("/api/auth/sign-in/email", {
              data: { email: owner.email, password: owner.password },
              headers: { origin },
            })
          ).status(),
        ).toBe(200);
        await page.goto(`/${locale}/items/${owner.item.id}`);
        const grade = page.getByRole("region", {
          name: locale === "de" ? "Externes Grading" : "External grading",
          exact: true,
        });
        await grade
          .getByLabel(locale === "de" ? "Grading-Anbieter" : "Grading provider", { exact: true })
          .fill("Authored provider");
        await grade
          .getByLabel(locale === "de" ? "Grade / Bewertungsangabe" : "Grade / assessment", {
            exact: true,
          })
          .fill("A+");
        await grade
          .getByLabel(locale === "de" ? "Zertifikatsnummer" : "Certificate number", { exact: true })
          .fill("000ABC");
        await grade
          .getByText(
            locale === "de"
              ? "Optionaler numerischer Wert mit eigener Skala"
              : "Optional numeric value and authored scale",
            { exact: true },
          )
          .click();
        await grade
          .getByLabel(locale === "de" ? "Numerischer Wert" : "Numeric value", { exact: true })
          .fill("9.5");
        await grade
          .getByLabel(
            locale === "de"
              ? "Zugehörige Skala (von dir angegeben)"
              : "Associated scale (supplied by you)",
            { exact: true },
          )
          .fill("Collector authored scale");
        await grade
          .getByRole("button", {
            name: locale === "de" ? "Grading speichern" : "Save grading",
            exact: true,
          })
          .click();
        await expect(grade.getByRole("status")).toContainText(
          locale === "de" ? "Grading gespeichert" : "Grading saved",
        );
        const condition = page.getByRole("region", {
          name:
            locale === "de" ? "Kategorie und eigener Zustand" : "Category and personal condition",
          exact: true,
        });
        await condition
          .getByLabel(locale === "de" ? "Kategorie" : "Category", { exact: true })
          .selectOption(foreign.category.id);
        await expect(
          condition.getByRole("button", {
            name: locale === "de" ? "Kategorie speichern" : "Save category",
            exact: true,
          }),
        ).toBeDisabled();
        expect(
          (await (await page.request.get(`/api/v1/items/${owner.item.id}/condition`)).json())
            .condition.conditionOption.id,
        ).toBe(owner.scheme.options[0]!.id);
        await condition
          .getByLabel(
            locale === "de"
              ? "Den aktuellen Zustand beim Kategorienwechsel entfernen"
              : "Clear the current condition when changing category",
            { exact: true },
          )
          .check();
        await condition
          .getByRole("button", {
            name: locale === "de" ? "Kategorie speichern" : "Save category",
            exact: true,
          })
          .click();
        await expect(condition.getByRole("status")).toContainText(
          locale === "de" ? "Kategorie gespeichert" : "Category saved",
        );
        await condition
          .getByLabel(locale === "de" ? "Eigener Zustand" : "Personal condition", { exact: true })
          .selectOption(foreign.scheme.options[1]!.id);
        await condition
          .getByRole("button", {
            name: locale === "de" ? "Zustand speichern" : "Save condition",
            exact: true,
          })
          .click();
        await expect(condition.getByRole("status")).toContainText(
          locale === "de" ? "Zustand gespeichert" : "Condition saved",
        );
        const { createConditionMaintenanceService } = await import(
          "@sammlerraum/domain/condition/condition-service"
        );
        await createConditionMaintenanceService(db).setConditionOptionActive(
          foreign.scheme.options[1]!.id,
          false,
        );
        await page.reload();
        await expect(
          condition.getByText(
            locale === "de"
              ? "Die gespeicherte Zustandsangabe ist für neue Auswahlen nicht mehr verfügbar."
              : "The saved condition is no longer available for new selections.",
            { exact: true },
          ),
        ).toBeVisible();
        await expect(page.getByText("PSA 9", { exact: true })).toBeVisible();
        expect(
          (await (await page.request.get(`/api/v1/items/${owner.item.id}/gradings`)).json())
            .gradings,
        ).toHaveLength(2);
        expect(
          (
            await context.request.post("/api/auth/sign-in/email", {
              data: { email: foreign.email, password: foreign.password },
              headers: { origin },
            })
          ).status(),
        ).toBe(200);
        for (const suffix of ["condition", "gradings", "catalog-link"])
          expect(
            (await context.request.get(`/api/v1/items/${owner.item.id}/${suffix}`)).status(),
          ).toBe(404);
        expect(
          (
            await context.request.put(`/api/v1/items/${owner.item.id}/condition`, {
              data: { optionId: null },
              headers: { origin },
            })
          ).status(),
        ).toBe(404);
        expect(
          (
            await page.request.post(`/api/v1/items/${owner.item.id}/archive`, {
              headers: { origin },
            })
          ).status(),
        ).toBe(200);
        await page.reload();
        await expect(page.getByText("PSA 9", { exact: true })).toBeVisible();
        await expect(page.getByText("Authored provider A+", { exact: true })).toBeVisible();
        await expect(condition.getByText("Near Mint", { exact: true })).toBeVisible();
        await expect(
          grade.getByRole("button", {
            name: locale === "de" ? "Grading speichern" : "Save grading",
            exact: true,
          }),
        ).toHaveCount(0);
        await page.getByRole("banner").scrollIntoViewIfNeeded();
        await page.screenshot({
          path: info.outputPath(`catalog-retained-${info.project.name}-${locale}.png`),
          fullPage: true,
        });
      } finally {
        await context.close();
        await cleanupCatalog(owner);
        await cleanupCatalog(foreign);
      }
    });
  });
}

for (const locale of ["de", "en"] as const) {
  test.describe(`authored catalog operation forms ${locale}`, () => {
    test.skip(!enabled, "requires migrated test database");
    test("ordinary forms submit variants, references, translations and sources without private item facts", async ({
      page,
    }) => {
      const owner = await catalogFixture();
      try {
        const { createCatalogMaintenanceService } = await import(
          "@sammlerraum/domain/catalog/catalog-service"
        );
        const service = createCatalogMaintenanceService(db);
        const entry = await service.createCatalogEntry({
          categoryTemplateId: owner.category.id,
          text: { language: "en", title: "Authored reference" },
        });
        await service.addCatalogVariant(entry.state.id, 1, {
          text: { language: "en", title: "First variant" },
          language: "en",
          edition: "First edition",
          reference: "001",
        });
        await service.addExternalIdentifier(entry.state.id, 2, {
          namespace: "publisher",
          type: "catalogue",
          value: "00001",
        });
        expect(
          (
            await page.request.post("/api/auth/sign-in/email", {
              data: { email: owner.email, password: owner.password },
              headers: { origin },
            })
          ).status(),
        ).toBe(200);
        const kinds = [
          "UPDATE_ENTRY",
          "ADD_VARIANT",
          "UPDATE_VARIANT",
          "ADD_IDENTIFIER",
          "UPDATE_IDENTIFIER",
          "REMOVE_IDENTIFIER",
        ] as const;
        for (const kind of kinds) {
          await page.goto(`/${locale}/catalog/${entry.state.id}`);
          await page
            .getByRole("button", {
              name: locale === "de" ? "Korrektur vorschlagen" : "Propose correction",
              exact: true,
            })
            .click();
          const form = page.getByRole("form", {
            name: locale === "de" ? "Katalogvorschlag" : "Catalog proposal",
            exact: true,
          });
          await form
            .getByLabel(locale === "de" ? "Art des Vorschlags" : "Proposal type", { exact: true })
            .selectOption(kind);
          if (kind === "UPDATE_ENTRY") {
            await form
              .getByText(locale === "de" ? "Verfasste Übersetzungen" : "Authored translations", {
                exact: true,
              })
              .click();
            await form
              .getByRole("button", {
                name: locale === "de" ? "Übersetzung hinzufügen" : "Add translation",
                exact: true,
              })
              .click();
            await form
              .getByLabel(locale === "de" ? "Sprache der Übersetzung" : "Translation language", {
                exact: true,
              })
              .fill("de");
            await form
              .getByLabel(locale === "de" ? "Übersetzter Titel" : "Translated title", {
                exact: true,
              })
              .fill("Verfasste Referenz");
            await form
              .getByLabel(locale === "de" ? "Angabe verwenden — Set" : "Include attribute — Set", {
                exact: true,
              })
              .check();
            await form.getByLabel("Set", { exact: true }).fill("Authored set");
            await form
              .getByRole("button", {
                name: locale === "de" ? "Quelle hinzufügen" : "Add source",
                exact: true,
              })
              .click();
            await form
              .getByLabel(locale === "de" ? "Quell-URL" : "Source URL", { exact: true })
              .fill("https://example.test/authored-source");
          }
          if (kind === "ADD_VARIANT" || kind === "UPDATE_VARIANT") {
            await form
              .getByLabel(locale === "de" ? "Titel" : "Title", { exact: true })
              .fill(kind === "ADD_VARIANT" ? "Proposed variant" : "Corrected variant");
            await form
              .getByLabel(locale === "de" ? "Ausgabe / Edition" : "Edition", { exact: true })
              .fill("Authored edition");
          }
          if (kind === "ADD_IDENTIFIER" || kind === "UPDATE_IDENTIFIER") {
            await form
              .getByRole("textbox", {
                name: locale === "de" ? "Referenzsystem" : "Reference system",
                exact: false,
              })
              .fill("publisher");
            await form
              .getByLabel(locale === "de" ? "Art der Referenz" : "Reference type", { exact: true })
              .fill("catalogue");
            await form
              .getByLabel(locale === "de" ? "Referenznummer / Wert" : "Reference number / value", {
                exact: true,
              })
              .fill("00002");
          }
          await form
            .getByLabel(locale === "de" ? "Änderungszusammenfassung" : "Change summary", {
              exact: true,
            })
            .fill(`Authored ${kind}`);
          await form
            .getByRole("button", {
              name: locale === "de" ? "Vorschlag absenden" : "Submit proposal",
              exact: true,
            })
            .click();
          await expect(
            page.getByRole("status").filter({
              hasText: locale === "de" ? "Vorschlag eingereicht" : "Proposal submitted",
            }),
          ).toBeVisible();
        }
        const proposals = (await (await page.request.get("/api/v1/catalog/proposals")).json())
          .proposals;
        expect(proposals).toHaveLength(6);
        expect(proposals.every((row: { state: string }) => row.state === "PENDING")).toBe(true);
        const update = proposals.find(
          (row: { patch: { kind: string } }) => row.patch.kind === "UPDATE_ENTRY",
        );
        expect(update.patch.input.text.translations).toEqual([
          { language: "de", title: "Verfasste Referenz", description: "" },
        ]);
        expect(update.patch.input.sources).toEqual([
          { url: "https://example.test/authored-source" },
        ]);
        expect(update.patch.input.attributes[0].value).toBe("Authored set");
        expect(JSON.stringify(proposals)).not.toMatch(
          /PRIVATE CATALOG SECRET|privateNotes|purchaseAmountMinor|certificateNo|conditionOptionId/,
        );
        expect(
          (await (await page.request.get(`/api/v1/catalog/entries/${entry.state.id}`)).json()).entry
            .revision,
        ).toBe(3);
        await page.goto(`/${locale}/catalog/proposals`);
        await expect(
          page.getByRole("heading", {
            name: locale === "de" ? "Meine Vorschläge" : "My proposals",
            exact: true,
          }),
        ).toBeVisible();
        await page.getByRole("button", { name: "Authored UPDATE_ENTRY", exact: true }).click();
        await page
          .getByRole("region", {
            name: locale === "de" ? "Vorschlagsdetails" : "Proposal details",
            exact: true,
          })
          .getByText(locale === "de" ? "Verfasste Übersetzungen" : "Authored translations", {
            exact: true,
          })
          .click();
        await expect(
          page.getByRole("heading", { name: "de: Verfasste Referenz", exact: true }),
        ).toBeVisible();
      } finally {
        await cleanupCatalog(owner);
      }
    });
  });
}

for (const locale of ["de", "en"] as const) {
  test.describe(`moderation conflicts and authority ${locale}`, () => {
    test.skip(!enabled, "requires migrated test database");
    test("review handles stale proposals, rejection, replay and revoked authority", async ({
      page,
      browser,
    }) => {
      const owner = await catalogFixture();
      const moderator = await catalogFixture();
      const review = await browser.newContext();
      const reviewer = await review.newPage();
      const second = await review.newPage();
      try {
        const { createCatalogMaintenanceService } = await import(
          "@sammlerraum/domain/catalog/catalog-service"
        );
        const service = createCatalogMaintenanceService(db);
        const entry = await service.createCatalogEntry({
          categoryTemplateId: owner.category.id,
          text: { language: "en", title: "Original reference" },
        });
        expect(
          (
            await page.request.post("/api/auth/sign-in/email", {
              data: { email: owner.email, password: owner.password },
              headers: { origin },
            })
          ).status(),
        ).toBe(200);
        await page.goto(`/${locale}/catalog/moderation`);
        await expect(page.getByRole("main").getByRole("alert")).toContainText(
          locale === "de" ? "Du hast keinen Zugriff" : "You do not have access",
        );
        for (const title of ["First correction", "Competing correction"]) {
          await page.goto(`/${locale}/catalog/${entry.state.id}`);
          await page
            .getByRole("button", {
              name: locale === "de" ? "Korrektur vorschlagen" : "Propose correction",
              exact: true,
            })
            .click();
          const form = page.getByRole("form", {
            name: locale === "de" ? "Katalogvorschlag" : "Catalog proposal",
            exact: true,
          });
          await form.getByLabel(locale === "de" ? "Titel" : "Title", { exact: true }).fill(title);
          await form
            .getByLabel(locale === "de" ? "Änderungszusammenfassung" : "Change summary", {
              exact: true,
            })
            .fill(title);
          await form
            .getByRole("button", {
              name: locale === "de" ? "Vorschlag absenden" : "Submit proposal",
              exact: true,
            })
            .click();
          await expect(
            page.getByRole("status").filter({
              hasText: locale === "de" ? "Vorschlag eingereicht" : "Proposal submitted",
            }),
          ).toBeVisible();
        }
        await db.applicationRoleGrant.create({
          data: {
            userId: moderator.id,
            role: "MODERATOR",
            grantedBy: "synthetic e2e",
            reason: "Test authority",
          },
        });
        expect(
          (
            await reviewer.request.post("/api/auth/sign-in/email", {
              data: { email: moderator.email, password: moderator.password },
              headers: { origin },
            })
          ).status(),
        ).toBe(200);
        await reviewer.goto(`/${locale}/catalog/moderation`);
        await reviewer.getByRole("button", { name: "First correction", exact: true }).click();
        await reviewer
          .getByLabel(locale === "de" ? "Begründung" : "Decision reason", { exact: true })
          .fill("Reviewed first proposal");
        await reviewer
          .getByRole("button", { name: locale === "de" ? "Annehmen" : "Approve", exact: true })
          .click();
        await expect(
          reviewer.getByRole("status").filter({
            hasText: locale === "de" ? "Entscheidung gespeichert" : "Decision recorded",
          }),
        ).toBeVisible();
        for (const target of [reviewer, second]) {
          await target.goto(`/${locale}/catalog/moderation`);
          await target.getByRole("button", { name: "Competing correction", exact: true }).click();
          await target
            .getByLabel(locale === "de" ? "Begründung" : "Decision reason", { exact: true })
            .fill("Reviewed stale proposal");
        }
        await reviewer
          .getByRole("button", { name: locale === "de" ? "Annehmen" : "Approve", exact: true })
          .click();
        await expect(reviewer.getByRole("main").getByRole("alert")).toContainText(
          locale === "de" ? "Die Referenz wurde geändert" : "The reference changed",
        );
        await second
          .getByRole("button", { name: locale === "de" ? "Ablehnen" : "Reject", exact: true })
          .click();
        await expect(second.getByRole("main").getByRole("alert")).toContainText(
          locale === "de" ? "bereits entschieden" : "already been decided",
        );
        const submitted = await page.request.post("/api/v1/catalog/proposals", {
          data: {
            targetEntryId: entry.state.id,
            baseRevision: 2,
            patch: {
              kind: "UPDATE_ENTRY",
              input: { text: { language: "en", title: "Rejected correction" } },
            },
            summary: "Reject this correction",
          },
          headers: { origin },
        });
        expect(submitted.status()).toBe(201);
        await reviewer.goto(`/${locale}/catalog/moderation`);
        await reviewer.getByRole("button", { name: "Reject this correction", exact: true }).click();
        await reviewer
          .getByLabel(locale === "de" ? "Begründung" : "Decision reason", { exact: true })
          .fill("Insufficient authored evidence");
        await reviewer
          .getByRole("button", { name: locale === "de" ? "Ablehnen" : "Reject", exact: true })
          .click();
        await expect(
          reviewer.getByRole("status").filter({
            hasText: locale === "de" ? "Entscheidung gespeichert" : "Decision recorded",
          }),
        ).toBeVisible();
        await page.goto(`/${locale}/catalog/proposals`);
        await page.getByRole("button", { name: "Reject this correction", exact: true }).click();
        await expect(
          page
            .getByRole("region", {
              name: locale === "de" ? "Vorschlagsdetails" : "Proposal details",
              exact: true,
            })
            .getByText(locale === "de" ? "Abgelehnt" : "Rejected", { exact: true }),
        ).toBeVisible();
        await reviewer.goto(`/${locale}/catalog/${entry.state.id}`);
        await reviewer
          .getByRole("button", {
            name: locale === "de" ? "Version 1 ansehen" : "Preview revision 1",
            exact: true,
          })
          .click();
        await reviewer
          .getByLabel(locale === "de" ? "Begründung der Wiederherstellung" : "Restoration reason", {
            exact: true,
          })
          .fill("Attempt after revocation");
        await reviewer
          .getByLabel(
            locale === "de"
              ? "Diese Version als aktuellen Stand wiederherstellen"
              : "Restore this revision as the current entry",
            { exact: true },
          )
          .check();
        await db.applicationRoleGrant.delete({ where: { userId: moderator.id } });
        await reviewer
          .getByRole("button", {
            name: locale === "de" ? "Wiederherstellung bestätigen" : "Confirm restoration",
            exact: true,
          })
          .click();
        await expect(reviewer.getByRole("main").getByRole("alert")).toContainText(
          locale === "de" ? "Du hast keinen Zugriff" : "You do not have access",
        );
        expect(
          (await (await reviewer.request.get(`/api/v1/catalog/entries/${entry.state.id}`)).json())
            .entry,
        ).toMatchObject({ revision: 2, state: { text: { title: "First correction" } } });
        expect(await (await reviewer.request.get("/api/v1/catalog/capabilities")).json()).toEqual({
          canModerate: false,
        });
      } finally {
        await review.close();
        await cleanupCatalog(owner);
        await cleanupCatalog(moderator);
      }
    });
  });
}

test.describe("grading save recovery", () => {
  test.skip(!enabled, "requires migrated test database");
  test("retry after a saved grading and failed refresh updates the known record", async ({
    page,
  }) => {
    const owner = await catalogFixture();
    try {
      expect(
        (
          await page.request.post("/api/auth/sign-in/email", {
            data: { email: owner.email, password: owner.password },
            headers: { origin },
          })
        ).status(),
      ).toBe(200);
      await page.goto(`/en/items/${owner.item.id}`);
      await expect(page.getByText("PSA 9", { exact: true })).toBeVisible();
      const grade = page.getByRole("region", { name: "External grading", exact: true });
      await grade.getByLabel("Grading provider", { exact: true }).fill("Retry provider");
      await grade.getByLabel("Grade / assessment", { exact: true }).fill("A");
      let failed = false;
      await page.route(`**/api/v1/items/${owner.item.id}/condition`, async (route) => {
        if (!failed && route.request().method() === "GET") {
          failed = true;
          await route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE" } } });
        } else await route.continue();
      });
      await grade.getByRole("button", { name: "Save grading", exact: true }).click();
      await expect(grade.getByRole("alert")).toContainText("The grading was saved");
      await grade.getByRole("button", { name: "Save grading", exact: true }).click();
      await expect(grade.getByRole("status")).toContainText("Grading saved");
      const rows = (
        await (await page.request.get(`/api/v1/items/${owner.item.id}/gradings`)).json()
      ).gradings;
      expect(
        rows.filter((row: { provider: string }) => row.provider === "Retry provider"),
      ).toHaveLength(1);
      await grade
        .getByRole("button", { name: "Edit grading: Retry provider A", exact: true })
        .click();
      await grade.getByLabel("Grade / assessment", { exact: true }).fill("A+");
      await grade.getByRole("button", { name: "Save grading", exact: true }).click();
      await expect(grade.getByText("Retry provider A+", { exact: true })).toBeVisible();
      page.once("dialog", (dialog) => void dialog.accept());
      await grade
        .getByRole("button", { name: "Remove grading: Retry provider A+", exact: true })
        .click();
      await expect(grade.getByRole("status")).toContainText("Grading removed");
      expect(
        (await (await page.request.get(`/api/v1/items/${owner.item.id}/gradings`)).json()).gradings,
      ).toHaveLength(1);
      expect(
        (await (await page.request.get(`/api/v1/items/${owner.item.id}/condition`)).json())
          .condition.conditionOption.id,
      ).toBe(owner.scheme.options[0]!.id);
    } finally {
      await cleanupCatalog(owner);
    }
  });
});

test.describe("proposal read cancellation", () => {
  test.skip(!enabled, "requires migrated test database");
  test("changing proposal state filter releases a superseded detail request", async ({ page }) => {
    const owner = await catalogFixture();
    let release = () => {};
    try {
      const { createCatalogMaintenanceService } = await import(
        "@sammlerraum/domain/catalog/catalog-service"
      );
      const entry = await createCatalogMaintenanceService(db).createCatalogEntry({
        categoryTemplateId: owner.category.id,
        text: { language: "en", title: "Delayed reference" },
      });
      expect(
        (
          await page.request.post("/api/auth/sign-in/email", {
            data: { email: owner.email, password: owner.password },
            headers: { origin },
          })
        ).status(),
      ).toBe(200);
      const submitted = await page.request.post("/api/v1/catalog/proposals", {
        data: {
          targetEntryId: entry.state.id,
          baseRevision: 1,
          patch: {
            kind: "UPDATE_ENTRY",
            input: { text: { language: "en", title: "Delayed correction" } },
          },
          summary: "Delayed detail",
        },
        headers: { origin },
      });
      expect(submitted.status()).toBe(201);
      const proposal = (await submitted.json()).proposal;
      await page.goto("/en/catalog/proposals");
      const button = page.getByRole("button", { name: "Delayed detail", exact: true });
      await expect(button).toBeEnabled();
      let started = () => {};
      const began = new Promise<void>((resolve) => {
        started = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route(`**/api/v1/catalog/proposals/${proposal.id}`, async (route) => {
        started();
        await gate;
        await route.continue();
      });
      await button.click();
      await began;
      await page.getByLabel("Proposal status", { exact: true }).selectOption("PENDING");
      release();
      await expect(button).toBeEnabled();
      await page.unrouteAll({ behavior: "wait" });
      await button.click();
      await expect(
        page.getByRole("region", { name: "Proposal details", exact: true }),
      ).toBeVisible();
    } finally {
      release();
      await page.unrouteAll({ behavior: "wait" });
      await cleanupCatalog(owner);
    }
  });
});
