# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: catalog-grading.spec.ts >> catalog, personal condition and external grading >> unsaved condition survives a grading refresh (de)
- Location: e2e/catalog-grading.spec.ts:15:5

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator:  getByLabel('Eigener Zustand', { exact: true })
Expected: "278e99a6-3b8b-4c6c-b09b-6ce47c3e5708"
Received: "a003fd14-84e4-4a16-8ba6-ee6fdc6fb01b"
Timeout:  5000ms

Call log:
  - Expect "toHaveValue" getByLabel('Eigener Zustand', { exact: true }) with timeout 5000ms
  - waiting for getByLabel('Eigener Zustand', { exact: true })
    14 × locator resolved to <select aria-label="Eigener Zustand">…</select>
       - unexpected value "a003fd14-84e4-4a16-8ba6-ee6fdc6fb01b"

```

```yaml
- combobox "Eigener Zustand":
  - option "Nicht angegeben"
  - option "Mint" [selected]
  - option "Near Mint"
```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test";
  2   | import { catalogFixture, cleanupCatalog, db, enabled, origin } from "./support/catalog-fixture";
  3   | 
  4   | test.beforeEach(async () => {
  5   |   if (enabled) await db.rateLimit.deleteMany();
  6   | });
  7   | test.afterAll(async () => {
  8   |   if (enabled) await db.rateLimit.deleteMany();
  9   |   await db.$disconnect();
  10  | });
  11  | 
  12  | test.describe("catalog, personal condition and external grading", () => {
  13  |   test.skip(!enabled, "requires migrated test database");
  14  |   for (const locale of ["de", "en"] as const) {
  15  |     test(`unsaved condition survives a grading refresh (${locale})`, async ({ page }) => {
  16  |       const fixture = await catalogFixture();
  17  |       try {
  18  |         expect(
  19  |           (
  20  |             await page.request.post("/api/auth/sign-in/email", {
  21  |               data: { email: fixture.email, password: fixture.password },
  22  |               headers: { origin },
  23  |             })
  24  |           ).status(),
  25  |         ).toBe(200);
  26  |         await page.goto(`/${locale}/items/${fixture.item.id}`);
  27  |         const condition = page.getByLabel(
  28  |           locale === "de" ? "Eigener Zustand" : "Personal condition",
  29  |           { exact: true },
  30  |         );
  31  |         await expect(condition).toHaveValue(fixture.scheme.options[0]!.id);
  32  |         await condition.selectOption(fixture.scheme.options[1]!.id);
  33  |         const grading = page.getByRole("region", {
  34  |           name: locale === "de" ? "Externes Grading" : "External grading",
  35  |           exact: true,
  36  |         });
  37  |         await grading
  38  |           .getByLabel(locale === "de" ? "Grading-Anbieter" : "Grading provider", { exact: true })
  39  |           .fill("Draft check");
  40  |         await grading
  41  |           .getByLabel(locale === "de" ? "Grade / Bewertungsangabe" : "Grade / assessment", {
  42  |             exact: true,
  43  |           })
  44  |           .fill("A");
  45  |         await grading
  46  |           .getByRole("button", {
  47  |             name: locale === "de" ? "Grading speichern" : "Save grading",
  48  |             exact: true,
  49  |           })
  50  |           .click();
  51  |         await expect(grading.getByRole("status")).toContainText(
  52  |           locale === "de" ? "Grading gespeichert" : "Grading saved",
  53  |         );
> 54  |         await expect(condition).toHaveValue(fixture.scheme.options[1]!.id);
      |                                 ^ Error: expect(locator).toHaveValue(expected) failed
  55  |         expect(
  56  |           (await (await page.request.get(`/api/v1/items/${fixture.item.id}/condition`)).json())
  57  |             .condition.conditionOption.id,
  58  |         ).toBe(fixture.scheme.options[0]!.id);
  59  |         const save = page.getByRole("button", {
  60  |           name: locale === "de" ? "Zustand speichern" : "Save condition",
  61  |           exact: true,
  62  |         });
  63  |         await save.click();
  64  |         await expect(save).toBeDisabled();
  65  |         expect(
  66  |           (await (await page.request.get(`/api/v1/items/${fixture.item.id}/condition`)).json())
  67  |             .condition.conditionOption.id,
  68  |         ).toBe(fixture.scheme.options[1]!.id);
  69  |         // A genuinely changed saved condition remains authoritative on the next sibling refresh.
  70  |         expect(
  71  |           (
  72  |             await page.request.put(`/api/v1/items/${fixture.item.id}/condition`, {
  73  |               data: { optionId: fixture.scheme.options[0]!.id },
  74  |               headers: { origin },
  75  |             })
  76  |           ).status(),
  77  |         ).toBe(200);
  78  |         await grading
  79  |           .getByLabel(locale === "de" ? "Grading-Anbieter" : "Grading provider", { exact: true })
  80  |           .fill("Saved facts check");
  81  |         await grading
  82  |           .getByLabel(locale === "de" ? "Grade / Bewertungsangabe" : "Grade / assessment", {
  83  |             exact: true,
  84  |           })
  85  |           .fill("B");
  86  |         await grading
  87  |           .getByRole("button", {
  88  |             name: locale === "de" ? "Grading speichern" : "Save grading",
  89  |             exact: true,
  90  |           })
  91  |           .click();
  92  |         await expect(condition).toHaveValue(fixture.scheme.options[0]!.id);
  93  |       } finally {
  94  |         await cleanupCatalog(fixture);
  95  |       }
  96  |     });
  97  |     test(`unsaved category and explicit clear survive link refreshes (${locale})`, async ({
  98  |       page,
  99  |     }) => {
  100 |       const fixture = await catalogFixture();
  101 |       try {
  102 |         const { createCatalogMaintenanceService } = await import(
  103 |           "@sammlerraum/domain/catalog/catalog-service"
  104 |         );
  105 |         const entry = await createCatalogMaintenanceService(db).createCatalogEntry({
  106 |           categoryTemplateId: fixture.category.id,
  107 |           text: { language: "en", title: `Draft reference ${fixture.id}` },
  108 |         });
  109 |         expect(
  110 |           (
  111 |             await page.request.post("/api/auth/sign-in/email", {
  112 |               data: { email: fixture.email, password: fixture.password },
  113 |               headers: { origin },
  114 |             })
  115 |           ).status(),
  116 |         ).toBe(200);
  117 |         await page.goto(`/${locale}/items/${fixture.item.id}`);
  118 |         const category = page.getByLabel(locale === "de" ? "Kategorie" : "Category", {
  119 |           exact: true,
  120 |         });
  121 |         await expect(category).toHaveValue(fixture.category.id);
  122 |         await category.selectOption("");
  123 |         const clear = page.getByLabel(
  124 |           locale === "de"
  125 |             ? "Den aktuellen Zustand beim Kategorienwechsel entfernen"
  126 |             : "Clear the current condition when changing category",
  127 |           { exact: true },
  128 |         );
  129 |         await clear.check();
  130 |         const link = page.getByRole("region", {
  131 |           name: locale === "de" ? "Katalogverknüpfung" : "Catalog reference",
  132 |           exact: true,
  133 |         });
  134 |         await link
  135 |           .getByLabel(locale === "de" ? "Katalog durchsuchen" : "Search catalog", { exact: true })
  136 |           .fill(`Draft reference ${fixture.id}`);
  137 |         await link
  138 |           .getByRole("button", { name: locale === "de" ? "Suchen" : "Search", exact: true })
  139 |           .click();
  140 |         await link
  141 |           .getByRole("button", {
  142 |             name: locale === "de" ? "Referenz auswählen" : "Choose reference",
  143 |             exact: true,
  144 |           })
  145 |           .click();
  146 |         await link
  147 |           .getByRole("button", {
  148 |             name: locale === "de" ? "Mit diesem Stück verknüpfen" : "Link to this item",
  149 |             exact: true,
  150 |           })
  151 |           .click();
  152 |         await expect(link.getByRole("status")).toContainText(
  153 |           locale === "de" ? "Katalogverknüpfung gespeichert" : "Catalog reference saved",
  154 |         );
```