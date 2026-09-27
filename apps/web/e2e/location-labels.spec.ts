import { randomUUID } from "node:crypto";

import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createPrismaClient } from "@sammlerraum/db/create-client";
import { hashPassword } from "better-auth/crypto";

const enabled = process.env.RUN_AUTH_E2E === "1";
const databaseUrl = process.env.DATABASE_URL ?? "";
if (enabled && !new URL(databaseUrl).pathname.endsWith("_test")) {
  throw new Error("Label browser fixtures require a _test database");
}
if (enabled && process.env.NODE_ENV === "production") {
  throw new Error("Label browser fixtures are disabled in production");
}
const prisma = createPrismaClient(databaseUrl);

async function seedCollector() {
  const id = randomUUID();
  const email = `label-browser-${id}@example.test`;
  const password = "correct-horse-battery-staple";
  await prisma.user.create({
    data: {
      id,
      name: "Label Collector",
      email,
      emailVerified: true,
      accounts: {
        create: {
          id: randomUUID(),
          accountId: id,
          providerId: "credential",
          password: await hashPassword(password),
        },
      },
    },
  });
  return { id, email, password };
}

async function login(page: Page, locale: "de" | "en", user: { email: string; password: string }) {
  await page.goto(`/${locale}/login`);
  await page.getByLabel(locale === "de" ? "E-Mail-Adresse" : "Email address").fill(user.email);
  await page.getByLabel(locale === "de" ? "Passwort" : "Password").fill(user.password);
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/auth/sign-in/email") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: locale === "de" ? "Anmelden" : "Sign in", exact: true })
    .click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(`/${locale}/account/profile$`));
}

async function post<T>(page: Page, path: string, data: unknown): Promise<T> {
  const response = await page.request.post(path, {
    data,
    headers: { origin: new URL(page.url()).origin },
  });
  expect(response.status(), path).toBe(201);
  return response.json() as Promise<T>;
}

test.describe("storage QR labels", () => {
  test.skip(!enabled, "requires the migrated PostgreSQL database and Chromium");
  test.beforeAll(async () => {
    await prisma.$connect();
  });
  test.beforeEach(async () => {
    await prisma.rateLimit.deleteMany();
  });
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("owner prints a private label and scans to localized contents; anonymous and other owner cannot see it", async ({
    page,
    browser,
  }, info: TestInfo) => {
    const locale = info.project.name === "mobile" ? "en" : "de";
    const owner = await seedCollector();
    const outsider = await seedCollector();
    try {
      await login(page, locale, owner);
      const { collection } = await post<{ collection: { id: string } }>(
        page,
        "/api/v1/collections",
        { name: "Label collection", visibility: "PRIVATE" },
      );
      const { location } = await post<{ location: { id: string; qrToken: string } }>(
        page,
        "/api/v1/locations",
        { name: "Blue drawer", type: "DRAWER", visibility: "PRIVATE" },
      );
      const { item } = await post<{ item: { id: string } }>(page, "/api/v1/items", {
        collectionId: collection.id,
        title: "Rare item",
        privateNotes: "Only owner knows this secret",
      });
      const assign = await page.request.put(`/api/v1/items/${item.id}/location`, {
        data: { locationId: location.id },
        headers: { origin: new URL(page.url()).origin },
      });
      expect(assign.status()).toBe(200);

      await page.goto(`/${locale}/collections/${collection.id}`);
      const locationRow = page
        .locator("details")
        .filter({ has: page.locator("summary", { hasText: "Blue drawer" }) });
      await locationRow.locator("summary").click();
      await locationRow
        .getByRole("link", { name: locale === "de" ? "Etikett drucken" : "Print label" })
        .click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/locations/${location.id}/label$`));
      await expect(page.getByRole("heading", { name: "Blue drawer" })).toBeVisible();
      await expect(page.locator(".printable-label img")).toHaveAttribute(
        "src",
        /^data:image\/gif;base64,/,
      );
      await expect(page.locator(".printable-label")).toContainText(
        location.id.slice(0, 8).toUpperCase(),
      );
      await expect(page.locator(".printable-label")).not.toContainText("Rare item");
      await expect(page.locator(".printable-label")).not.toContainText(
        "Only owner knows this secret",
      );
      expect(await page.locator('meta[name="robots"]').getAttribute("content")).toContain(
        "noindex",
      );
      const labelResponse = await page.request.get(`/${locale}/locations/${location.id}/label`);
      expect(labelResponse.headers()["cache-control"]).toContain("no-store");

      const scanUrl = `/l/${location.qrToken}`;
      await page.goto(scanUrl);
      await expect(page).toHaveURL(new RegExp(`/${locale}/locations/${location.id}$`));
      await expect(page.getByRole("heading", { name: "Blue drawer" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Rare item" })).toBeVisible();
      await expect(page.locator("main")).not.toContainText("Only owner knows this secret");

      const anonymous = await browser.newContext({ locale });
      try {
        const valid = await anonymous.request.get(scanUrl, { maxRedirects: 0 });
        const invalid = await anonymous.request.get(`/l/${"z".repeat(43)}`, { maxRedirects: 0 });
        expect(valid.status()).toBe(307);
        expect(invalid.status()).toBe(valid.status());
        expect(valid.headers().location).toBe(invalid.headers().location);
        expect(valid.headers().location).toMatch(new RegExp(`/${locale}/login$`));
        expect(valid.headers()["x-robots-tag"]).toContain("noindex");
      } finally {
        await anonymous.close();
      }

      const otherContext = await browser.newContext({ locale });
      try {
        const otherPage = await otherContext.newPage();
        await login(otherPage, locale, outsider);
        const foreign = await otherPage.request.get(scanUrl);
        const missing = await otherPage.request.get(`/l/${"z".repeat(43)}`);
        expect(foreign.status()).toBe(404);
        expect(missing.status()).toBe(404);
        expect(await foreign.text()).not.toContain("Blue drawer");
        const forbiddenLabel = await otherPage.request.get(
          `/${locale}/locations/${location.id}/label`,
        );
        expect(forbiddenLabel.status()).toBe(404);
      } finally {
        await otherContext.close();
      }
    } finally {
      await prisma.itemLocationHistory.deleteMany({ where: { assignedById: owner.id } });
      await prisma.user.deleteMany({ where: { id: { in: [owner.id, outsider.id] } } });
    }
  });
});
