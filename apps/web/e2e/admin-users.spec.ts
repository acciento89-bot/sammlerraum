import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { hashPassword } from "better-auth/crypto";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { test, expect } from "@playwright/test";

const enabled = process.env.RUN_AUTH_E2E === "1";
for (const locale of ["de", "en"] as const) {
  test(`${locale}: owner can inspect registrations; anonymous and revoked accounts cannot`, async ({
    page,
  }, info) => {
    test.skip(!enabled, "Owned browser test only");
    const db = createTestDatabaseClient();
    const id = randomUUID(),
      email = `${id}@example.test`,
      password = `Synthetic-admin-${randomUUID()}`;
    try {
      expect((await page.request.get("/api/v1/admin/users")).status()).toBe(401);
      await page.goto(`/${locale}/admin`);
      await expect(page).toHaveURL(new RegExp(`/${locale}/login`));
      await db.user.create({
        data: {
          id,
          name: "Synthetic owner",
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
          applicationRoleGrant: {
            create: {
              role: "ADMIN",
              grantedBy: "synthetic-browser",
              reason: "Private admin browser fixture",
            },
          },
        },
      });
      expect(
        (
          await page.request.post("/api/auth/sign-in/email", {
            data: { email, password },
            headers: { origin: "http://localhost:3000", "x-forwarded-for": "198.18.202.11" },
          })
        ).status(),
      ).toBe(200);
      await page.goto(`/${locale}/admin?q=${encodeURIComponent(email)}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        locale === "de" ? "Nutzer & Registrierungen" : "Users & registrations",
      );
      await expect(page.getByRole("cell", { name: email, exact: true })).toBeVisible();
      if ((page.viewportSize()?.width ?? 1440) < 800) {
        await page.locator(".workspace-mobile-menu summary").click();
        await expect(
          page
            .locator(".workspace-mobile-menu")
            .getByRole("link", { name: "Administration", exact: true }),
        ).toBeVisible();
        await page.locator(".workspace-mobile-menu summary").click();
      } else {
        await expect(
          page.getByRole("link", { name: "Administration", exact: true }).first(),
        ).toBeVisible();
      }
      await expect(page.getByText("Europe/Berlin", { exact: false })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      const reports = "../../.superpowers/sdd/2026-11-11-admin-users";
      await mkdir(reports, { recursive: true });
      await page.screenshot({
        path: `${reports}/${locale}-${info.project.name}.png`,
        fullPage: true,
      });
      await page.getByRole("searchbox").fill("no-such-synthetic-account");
      await page
        .getByRole("button", { name: locale === "de" ? "Suchen" : "Search", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText(
        locale === "de" ? "Keine Konten" : "No accounts",
      );
      await db.applicationRoleGrant.delete({ where: { userId: id } });
      expect((await page.request.get("/api/v1/admin/users")).status()).toBe(403);
      expect((await page.goto(`/${locale}/admin`))?.status()).toBe(404);
    } finally {
      await db.applicationRoleGrant.deleteMany({ where: { userId: id } });
      await db.user.deleteMany({ where: { id } });
      await db.rateLimit.deleteMany({ where: { key: "198.18.202.11|/sign-in/email" } });
      await db.$disconnect();
    }
  });
}
