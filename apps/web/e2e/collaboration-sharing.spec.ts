import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { hashPassword } from "better-auth/crypto";
import { createPrismaClient } from "@sammlerraum/db/create-client";
import { test, expect } from "@playwright/test";
import { credentialRateLimitFixture } from "./support/credential-rate-limit-fixture";
const enabled = process.env.RUN_AUTH_E2E === "1",
  databaseUrl = process.env.DATABASE_URL ?? "";
if (enabled && !new URL(databaseUrl).pathname.endsWith("_test"))
  throw Error("Owned collaboration UI test database required");
for (const locale of ["de", "en"] as const) {
  test(`${locale} owner creates and revokes a share through management UI and the guest immediately loses access`, async ({
    page,
    context,
    browser,
  }, testInfo) => {
    test.skip(!enabled, "Owned local cookie fixtures only");
    const db = createPrismaClient(databaseUrl),
      owner = randomUUID(),
      password = "own-collaboration-ui-password",
      address = await credentialRateLimitFixture(db),
      guest = await browser.newContext();
    try {
      await db.user.create({
        data: {
          id: owner,
          name: "Own collaboration UI fixture",
          email: `${owner}@example.invalid`,
          emailVerified: true,
          accounts: {
            create: {
              id: randomUUID(),
              accountId: owner,
              providerId: "credential",
              password: await hashPassword(password),
            },
          },
        },
      });
      const collection = await db.collection.create({
          data: {
            ownerId: owner,
            name: locale === "de" ? "Atelier und Keramik" : "Studio ceramics",
          },
        }),
        item = await db.collectibleItem.create({
          data: {
            ownerId: owner,
            collectionId: collection.id,
            title: locale === "de" ? "Schale aus dem Atelier" : "Handmade studio bowl",
            privateNotes: "private-collaboration-ui-sentinel",
          },
        });
      expect(
        (
          await context.request.post("/api/auth/sign-in/email", {
            headers: { origin: "http://localhost:3000", "x-forwarded-for": address.ip },
            data: { email: `${owner}@example.invalid`, password },
          })
        ).status(),
      ).toBe(200);
      await page.goto(`/${locale}/collections/${collection.id}/sharing`);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: locale === "de" ? "Freigaben verwalten" : "Manage sharing",
        }),
      ).toBeVisible({ timeout: 5000 });
      await page.getByLabel(locale === "de" ? "Bilder" : "Images", { exact: true }).check();
      await page
        .getByRole("button", {
          name: locale === "de" ? "Freigabe erstellen" : "Create share",
          exact: true,
        })
        .click();
      const link = page.getByRole("link", {
        name: locale === "de" ? "Freigabelink öffnen" : "Open share link",
        exact: true,
      });
      await expect(link).toBeVisible();
      const href = await link.getAttribute("href");
      expect(href).toMatch(/\/share\/[A-Za-z0-9_-]{43}$/);
      const guestPage = await guest.newPage();
      await guestPage.goto(href!.startsWith("http") ? href! : `http://localhost:3000${href}`);
      await expect(guestPage.getByRole("heading", { name: item.title, exact: true })).toBeVisible();
      await expect(guestPage.locator("body")).not.toContainText(
        "private-collaboration-ui-sentinel",
      );
      const dir = resolve(
        process.cwd(),
        "../../.superpowers/sdd/2026-09-19-09-collaboration-sharing-audit/reports",
      );
      await mkdir(dir, { recursive: true });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: resolve(dir, `task-7-sharing-${locale}-${testInfo.project.name}.png`),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: locale === "de" ? "Widerrufen" : "Revoke", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText(
        locale === "de" ? "widerrufen" : "revoked",
      );
      await guestPage.reload();
      await expect(
        guestPage.getByRole("heading", { name: item.title, exact: true }),
      ).not.toBeVisible();
    } finally {
      await guest.close();
      await db.user.deleteMany({ where: { id: owner } });
      await address.cleanup();
      await db.$disconnect();
    }
  });
}
