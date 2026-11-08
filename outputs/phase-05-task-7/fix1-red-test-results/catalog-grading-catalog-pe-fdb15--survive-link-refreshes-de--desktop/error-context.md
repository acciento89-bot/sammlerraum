# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: catalog-grading.spec.ts >> catalog, personal condition and external grading >> unsaved category and explicit clear survive link refreshes (de)
- Location: e2e/catalog-grading.spec.ts:97:5

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator:  getByLabel('Kategorie', { exact: true })
Expected: ""
Received: "cad44a4f-2284-4b3c-9904-23f157c49782"
Timeout:  5000ms

Call log:
  - Expect "toHaveValue" getByLabel('Kategorie', { exact: true }) with timeout 5000ms
  - waiting for getByLabel('Kategorie', { exact: true })
    14 × locator resolved to <select disabled aria-label="Kategorie">…</select>
       - unexpected value "cad44a4f-2284-4b3c-9904-23f157c49782"

```

```yaml
- combobox "Kategorie" [disabled]:
  - option "Ohne Kategorie"
  - option "Testkarten" [selected]
```

# Test source

```ts
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
> 155 |         await expect(category).toHaveValue("");
      |                                ^ Error: expect(locator).toHaveValue(expected) failed
  156 |         await expect(clear).toBeChecked();
  157 |         expect(
  158 |           (await (await page.request.get(`/api/v1/items/${fixture.item.id}`)).json()).item,
  159 |         ).toMatchObject({
  160 |           categoryTemplateId: fixture.category.id,
  161 |           conditionOptionId: fixture.scheme.options[0]!.id,
  162 |           catalogEntryId: entry.state.id,
  163 |         });
  164 |         await link
  165 |           .getByRole("button", {
  166 |             name: locale === "de" ? "Verknüpfung lösen" : "Unlink reference",
  167 |             exact: true,
  168 |           })
  169 |           .click();
  170 |         await expect(link.getByRole("status")).toContainText(
  171 |           locale === "de" ? "Verknüpfung gelöst" : "Reference unlinked",
  172 |         );
  173 |         await expect(category).toHaveValue("");
  174 |         await expect(clear).toBeChecked();
  175 |         await page
  176 |           .getByRole("button", {
  177 |             name: locale === "de" ? "Kategorie speichern" : "Save category",
  178 |             exact: true,
  179 |           })
  180 |           .click();
  181 |         await expect(clear).toHaveCount(0);
  182 |         await expect(
  183 |           page.getByLabel(locale === "de" ? "Eigener Zustand" : "Personal condition", {
  184 |             exact: true,
  185 |           }),
  186 |         ).toHaveValue("");
  187 |         expect(
  188 |           (await (await page.request.get(`/api/v1/items/${fixture.item.id}`)).json()).item,
  189 |         ).toMatchObject({
  190 |           categoryTemplateId: null,
  191 |           conditionOptionId: null,
  192 |           catalogEntryId: null,
  193 |         });
  194 |       } finally {
  195 |         await cleanupCatalog(fixture);
  196 |       }
  197 |     });
  198 |     test(`changing own condition preserves external grading (${locale})`, async ({ page }) => {
  199 |       const fixture = await catalogFixture();
  200 |       try {
  201 |         expect(
  202 |           (
  203 |             await page.request.post("/api/auth/sign-in/email", {
  204 |               data: { email: fixture.email, password: fixture.password },
  205 |               headers: { origin },
  206 |             })
  207 |           ).status(),
  208 |         ).toBe(200);
  209 |         const condition = await page.request.get(`/api/v1/items/${fixture.item.id}/condition`);
  210 |         expect(condition.status()).toBe(200);
  211 |         expect((await condition.json()).condition.conditionOption.labels.en).toBe("Mint");
  212 |         const grades = await page.request.get(`/api/v1/items/${fixture.item.id}/gradings`);
  213 |         expect(grades.status()).toBe(200);
  214 |         expect((await grades.json()).gradings[0]).toMatchObject({ provider: "PSA", grade: "9" });
  215 |         await page.goto(`/${locale}/items/${fixture.item.id}`);
  216 |         await expect(
  217 |           page.getByRole("heading", { name: "My graded card", exact: true }),
  218 |         ).toBeVisible();
  219 |         await expect(page.getByText("PSA 9", { exact: true })).toBeVisible();
  220 |         await page
  221 |           .getByLabel(locale === "de" ? "Eigener Zustand" : "Personal condition", { exact: true })
  222 |           .selectOption(fixture.scheme.options[1]!.id);
  223 |         await page
  224 |           .getByRole("button", {
  225 |             name: locale === "de" ? "Zustand speichern" : "Save condition",
  226 |             exact: true,
  227 |           })
  228 |           .click();
  229 |         await expect(
  230 |           page
  231 |             .getByRole("status")
  232 |             .filter({ hasText: locale === "de" ? "Zustand gespeichert" : "Condition saved" }),
  233 |         ).toBeVisible();
  234 |         await page.reload();
  235 |         await expect(page.getByText("PSA 9", { exact: true })).toBeVisible();
  236 |         await expect(
  237 |           page.getByLabel(locale === "de" ? "Eigener Zustand" : "Personal condition", {
  238 |             exact: true,
  239 |           }),
  240 |         ).toHaveValue(fixture.scheme.options[1]!.id);
  241 |         expect(
  242 |           (await (await page.request.get(`/api/v1/items/${fixture.item.id}/gradings`)).json())
  243 |             .gradings[0],
  244 |         ).toMatchObject({ provider: "PSA", grade: "9", certificateNo: "000123" });
  245 |       } finally {
  246 |         await cleanupCatalog(fixture);
  247 |       }
  248 |     });
  249 |   }
  250 | });
  251 | 
  252 | // These journeys use actual owner sessions, canonical services and separately granted review authority.
  253 | for (const locale of ["de", "en"] as const) {
  254 |   test.describe(`catalog reference workflow ${locale}`, () => {
  255 |     test.skip(!enabled, "requires migrated test database");
```