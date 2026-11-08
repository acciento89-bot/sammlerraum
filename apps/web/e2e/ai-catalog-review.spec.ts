import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { aiCaptureFixture } from "./support/ai-capture-fixture";
import { db, enabled } from "./support/search-fixture";
import de from "../messages/de.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
test.afterAll(async () => {
  await db?.$disconnect();
});
for (const locale of ["de", "en"] as const) {
  test(`${locale}: visible identifiers offer explicit catalog choices without a fake model score`, async ({
    page,
  }) => {
    test.skip(!enabled || process.env.RUN_AI_E2E !== "1", "Requires owned AI browser fixture");
    const code = `photo-${randomUUID()}`,
      f = await aiCaptureFixture(page, true, { identifierValue: code }),
      copy = locale === "de" ? de.AI : en.AI;
    let categoryId: string | undefined, entryId: string | undefined;
    try {
      const category = await db!.categoryTemplate.create({
        data: { key: `ai_ui_${randomUUID().replaceAll("-", "")}` },
      });
      categoryId = category.id;
      const title = `Visible workshop reference ${randomUUID().slice(0, 8)}`,
        entry = await db!.catalogEntry.create({
          data: {
            categoryTemplateId: category.id,
            authored: { text: { language: "en", title, translations: [] }, sources: [] },
          },
        });
      entryId = entry.id;
      await db!.catalogExternalIdentifier.create({
        data: {
          entryId: entry.id,
          namespace: "fixture",
          type: "marking",
          value: code,
          sources: [],
        },
      });
      await page.goto(`/${locale}/items/${f.itemId}/ai`);
      const section = page
        .locator(".ai-suggestion")
        .filter({ has: page.getByRole("heading", { name: copy.catalog, exact: true }) });
      await expect(section).toContainText(copy.identifierMatch);
      await expect(section.getByText(/Modellhinweis:|Model hint:/u)).toHaveCount(0);
      expect(
        (await db!.collectibleItem.findUniqueOrThrow({ where: { id: f.itemId } })).catalogEntryId,
      ).toBeNull();
      await page.getByRole("radio", { name: title, exact: true }).check();
      await page.getByRole("button", { name: copy.apply, exact: true }).click();
      await expect(page.getByTestId("ai-decision")).toBeVisible();
      expect(
        (await db!.collectibleItem.findUniqueOrThrow({ where: { id: f.itemId } })).catalogEntryId,
      ).toBe(entry.id);
      expect(
        (await f.service.getAnalysis({ userId: f.ownerId }, f.jobId!)).analysis!.catalogCandidates,
      ).toEqual([]);
    } finally {
      await f.cleanup();
      if (entryId) {
        await db!.catalogExternalIdentifier.deleteMany({ where: { entryId } });
        await db!.catalogEntry.deleteMany({ where: { id: entryId } });
      }
      if (categoryId) await db!.categoryTemplate.deleteMany({ where: { id: categoryId } });
    }
  });
}
