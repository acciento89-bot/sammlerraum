import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

for (const locale of ["de", "en"] as const) {
  test(`${locale}: anonymous public information, footer, language and safe metadata`, async ({
    page,
  }, info) => {
    test.skip(process.env.RUN_MARKETING_E2E !== "1", "Read-only compiled public release check");
    const privacy = locale === "de" ? "Datenschutzerklärung" : "Privacy notice";
    const imprint = locale === "de" ? "Impressum" : "Legal notice";
    await page.goto(`/${locale}`);
    await expect(
      page.getByRole("contentinfo").getByRole("link", { name: privacy, exact: true }),
    ).toHaveAttribute("href", `/legal/${locale}/privacy`);
    await page.getByRole("contentinfo").getByRole("link", { name: privacy, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: privacy, exact: true })).toBeVisible();
    const titleLines = await page
      .getByRole("heading", { level: 1, name: privacy, exact: true })
      .evaluate((heading) => {
        const range = document.createRange();
        range.selectNodeContents(heading);
        return new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size;
      });
    expect(
      titleLines,
      "The privacy heading must not break its word on the supported viewport",
    ).toBe(1);
    await expect(page.getByText("contact@kamilunavo.com", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Resend DPA", exact: true })).toHaveAttribute(
      "href",
      "https://resend.com/legal/dpa",
    );
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const folder = resolve(
      "../../.superpowers/sdd/2026-11-08-release-public-information/screenshots",
    );
    await mkdir(folder, { recursive: true });
    await page.screenshot({
      path: resolve(folder, `${locale}-${info.project.name}-privacy.png`),
      fullPage: true,
    });
    await page.goto(`/legal/${locale}/privacy?token=private-fixture`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://runtime-seo.example.test/legal/${locale}/privacy`,
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
    const other = locale === "de" ? "en" : "de";
    await page
      .getByRole("navigation", { name: locale === "de" ? "Sprache" : "Language" })
      .getByRole("link", { name: other === "de" ? "Deutsch" : "English", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/legal/${other}/privacy$`));
    await page.goto(`/legal/${locale}/imprint`);
    await expect(page.getByRole("heading", { name: imprint, level: 1, exact: true })).toBeVisible();
    await expect(
      page.getByText("Piotr Kaminski – Kamilunavo", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("contentinfo").getByRole("link", { name: imprint, exact: true }),
    ).toHaveAttribute("href", `/legal/${locale}/imprint`);
    expect((await page.goto(`/legal/${locale}/unknown`))?.status()).toBe(404);
    expect((await page.goto("/legal/fr/privacy"))?.status()).toBe(404);
  });
}
