import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { hashPassword } from "better-auth/crypto";
import { createPrismaClient } from "@sammlerraum/db/create-client";
import { initializeCatalogDefinitions } from "@sammlerraum/domain/catalog/initialize-catalog";
const db = createPrismaClient(process.env.DATABASE_URL!);
const database = new URL(process.env.DATABASE_URL!);
if (!["localhost", "127.0.0.1"].includes(database.hostname) || !database.pathname.endsWith("_test"))
  throw Error("Owned loopback test database required");
const folder = resolve(
  process.env.COLLECTOR_VISUAL_OUTPUT ??
    ".superpowers/sdd/2026-11-08-sammlerraum-operational-finish/screenshots",
);
test.beforeAll(async () => {
  await initializeCatalogDefinitions(db, { apply: true });
  await mkdir(folder, { recursive: true });
});
test.afterAll(async () => db.$disconnect());
for (const locale of ["de", "en"] as const)
  test(`${locale}: all collecting categories are discoverable and initial category selection persists`, async ({
    page,
  }, info) => {
    await page.goto(`/${locale}`);
    await page
      .getByRole("link", {
        name:
          locale === "de" ? "Alle 36 Sammelgebiete entdecken" : "Explore all 36 collecting areas",
      })
      .click();
    await expect(page.locator("#category-links-heading")).toBeInViewport();
    const directory = page.locator(".category-links-section");
    await expect(directory.locator("li")).toHaveCount(36);
    await expect(
      directory.getByText(locale === "de" ? "Sonstiges" : "Other", { exact: true }),
    ).toBeVisible();
    await expect(
      directory.getByText(locale === "de" ? "Modelleisenbahn" : "Model railways", { exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: resolve(folder, `${info.project.name}-${locale}-kategorien.png`),
      fullPage: true,
    });
    const id = randomUUID(),
      email = `categories-${id}@example.test`,
      password = "owned-category-fixture-password";
    await db.user.create({
      data: {
        id,
        email,
        name: "Owned category test",
        emailVerified: true,
        accounts: {
          create: {
            id: randomUUID(),
            providerId: "credential",
            accountId: id,
            password: await hashPassword(password),
          },
        },
      },
    });
    try {
      const login = await page.request.post("/api/auth/sign-in/email", {
        headers: {
          origin: "http://localhost:3018",
          "x-forwarded-for": `198.18.40.${locale === "de" ? "41" : "42"}`,
        },
        data: { email, password },
      });
      expect(login.status()).toBe(200);
      const response = await page.request.post("/api/v1/collections", {
        headers: { origin: "http://localhost:3018" },
        data: { name: "Mixed category journey" },
      });
      expect(response.status()).toBe(201);
      const collection = (await response.json()).collection;
      for (const key of ["model_railways", "other"]) {
        const category = await db.categoryTemplate.findUniqueOrThrow({ where: { key } });
        await page.goto(`/${locale}/items/new?collectionId=${collection.id}`);
        const picker = page.getByRole("combobox", {
          name: locale === "de" ? "Kategorie" : "Category",
          exact: true,
        });
        await expect(picker).toBeEnabled();
        await expect(picker.locator("option")).toHaveCount(37);
        await picker.selectOption(category.id);
        await page.locator("input[name=title]").fill(`Owned ${key} specimen ${locale}`);
        await page.screenshot({
          path: resolve(folder, `${info.project.name}-${locale}-${key}-erfassen.png`),
          fullPage: false,
        });
        const saveResponse = page.waitForResponse(
          (r) => r.url().endsWith("/api/v1/money/items") && r.request().method() === "POST",
        );
        await page
          .getByRole("button", {
            name: locale === "de" ? "Stück speichern" : "Save item",
            exact: true,
          })
          .click();
        const saved = await saveResponse;
        expect(saved.status(), await saved.text()).toBe(201);
        await expect(page).toHaveURL(new RegExp(`/${locale}/items/[a-f0-9-]+$`));
        const item = await db.collectibleItem.findFirstOrThrow({
          where: { collectionId: collection.id, title: `Owned ${key} specimen ${locale}` },
        });
        expect(item.categoryTemplateId).toBe(category.id);
      }
    } finally {
      await db.user.delete({ where: { id } });
    }
  });
