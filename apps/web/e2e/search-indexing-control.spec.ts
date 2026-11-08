import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { searchFixture, cleanupSearchFixture, db, origin, enabled } from "./support/search-fixture";
import de from "../messages/de.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
test.afterAll(async () => {
  await db?.$disconnect();
});
for (const locale of ["de", "en"] as const)
  test(`${locale}: explicit search consent, stale tab, withdrawal and ordinary profile edit`, async ({
    page,
    context,
  }, info) => {
    test.skip(!enabled || process.env.RUN_SEO_E2E !== "1", "Guarded owned SEO browser fixture");
    const f = await searchFixture(),
      copy = (locale === "de" ? de : en).SearchIndexing;
    try {
      await db!.userProfile.create({
        data: { userId: f.ownerId, handle: `seo-${f.ownerId}`, displayName: "SEO collector" },
      });
      expect(
        (
          await page.request.post("/api/auth/sign-in/email", {
            headers: { origin, "x-forwarded-for": f.ip },
            data: { email: f.email, password: f.password },
          })
        ).status(),
      ).toBe(200);
      await page.goto(`/${locale}/account/profile`);
      const box = page.getByRole("checkbox", { name: copy.allow });
      await expect(box).toBeVisible({ timeout: 5000 });
      await expect(box).not.toBeChecked();
      await expect(page.getByText(copy.explanation, { exact: true })).toBeVisible();
      const stale = await context.newPage();
      await stale.goto(`/${locale}/account/profile`);
      await box.check();
      await page.getByLabel(copy.language).selectOption("en");
      await page.getByRole("button", { name: copy.save, exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: copy.saved })).toBeVisible();
      await page.reload();
      await expect(box).toBeChecked();
      await expect(page.getByLabel(copy.language)).toHaveValue("en");
      await box.uncheck();
      await page.getByRole("button", { name: copy.save, exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: copy.saved })).toBeVisible();
      await stale.getByRole("checkbox", { name: copy.allow }).check();
      await stale.getByRole("button", { name: copy.save, exact: true }).click();
      await expect(stale.getByRole("region", { name: copy.title }).getByRole("alert")).toHaveText(
        copy.conflict,
      );
      await expect(stale.getByRole("checkbox", { name: copy.allow })).not.toBeChecked();
      await stale.close();
      const profileCopy = (locale === "de" ? de : en).Profile;
      await page.getByLabel(profileCopy.displayName, { exact: true }).fill("Edited SEO collector");
      await page.getByRole("button", { name: profileCopy.save, exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: profileCopy.saved })).toBeVisible();
      await page.reload();
      await expect(box).not.toBeChecked();
      const response = await page.request.get("/api/v1/account/search-indexing");
      expect(response.headers()["cache-control"]).toBe("no-store");
      expect(await response.json()).toMatchObject({
        preference: { searchEngineIndexingEnabled: false, publicLocale: "en", revision: 2 },
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const folder = resolve("../../.superpowers/sdd/2026-09-19-14-seo-search-console/screenshots");
      await mkdir(folder, { recursive: true });
      await page.screenshot({
        path: resolve(folder, `task3-${locale}-${info.project.name}-withdrawn.png`),
        fullPage: true,
      });
    } finally {
      await cleanupSearchFixture(f);
    }
  });
