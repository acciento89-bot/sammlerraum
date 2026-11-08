import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { createBillingSessionService } from "@sammlerraum/domain/billing/session-service";
import { searchFixture, cleanupSearchFixture, db, origin, enabled } from "./support/search-fixture";
// Explicit synthetic product policy, never an application test-mode feature bypass.
process.env.BILLING_PLAN_LIMITS ??= readFileSync(
  new URL("../../../packages/testing/fixtures/billing-browser-policy.json", import.meta.url),
  "utf8",
);
test.afterAll(async () => {
  await db?.$disconnect();
});
for (const locale of ["de", "en"] as const) {
  test(`${locale}: checkout return alone never grants Premium`, async ({ page }) => {
    test.skip(
      !enabled || process.env.RUN_BILLING_E2E !== "1",
      "Requires guarded owned billing browser fixture",
    );
    const f = await searchFixture();
    try {
      const provider = {
        id: "stripe_test",
        createCustomer: async () => `cus_${f.ownerId.replaceAll("-", "")}`,
        createCheckout: async (input: { expiresAt: Date }) => ({
          id: "cs_" + randomUUID().replaceAll("-", ""),
          url: "https://checkout.stripe.com/c/pay/synthetic-only",
          expiresAt: input.expiresAt,
        }),
        createPortalSession: async () => ({
          id: "bps_synthetic",
          url: "https://billing.stripe.com/p/session/synthetic-only",
        }),
      };
      await createBillingSessionService(db!, provider).checkout(
        { userId: f.ownerId },
        { locale, cadence: "MONTHLY", requestKey: randomUUID() },
      );
      const signed = await page.request.post("/api/auth/sign-in/email", {
        headers: { origin, "x-forwarded-for": f.ip },
        data: { email: f.email, password: f.password },
      });
      expect(signed.status()).toBe(200);
      await page.goto(`/${locale}/account/billing?checkout=success`);
      await expect(page.getByTestId("billing-plan")).toHaveText("Free");
      await page.screenshot({
        path: resolve(
          `../../.superpowers/sdd/2026-09-19-12-premium-billing/screenshots/${locale}-${test.info().project.name}-return.png`,
        ),
        fullPage: true,
      });
      await expect(
        page.getByText(locale === "de" ? "Premium aktiv" : "Premium active", { exact: true }),
      ).toHaveCount(0);
      expect(
        await db!
          .$queryRaw`SELECT count(*)::int AS count FROM "BillingSubscription" WHERE "subjectId"=${f.ownerId}`,
      ).toEqual([{ count: 0 }]);
    } finally {
      await cleanupSearchFixture(f);
    }
  });
}

for (const locale of ["de", "en"] as const) {
  test(`${locale}: public configured offers and own checkout keep prices out of client input`, async ({
    page,
  }, info) => {
    test.skip(
      !enabled || process.env.RUN_BILLING_E2E !== "1",
      "Requires owned offline billing fixture",
    );
    const f = await searchFixture();
    try {
      await page.goto(`/${locale}/pricing`);
      await expect(page.getByTestId("billing-offer-MONTHLY")).toContainText(
        locale === "de" ? "29,00" : "29.00",
      );
      await expect(page.getByTestId("billing-offer-YEARLY")).toContainText(
        locale === "de" ? "290,00" : "290.00",
      );
      const wrapped = await page
        .locator(".billing-comparison thead th, .billing-comparison td")
        .evaluateAll((cells) =>
          cells
            .filter((cell) => cell.closest("thead") || /^[0-9.,]+$/u.test(cell.textContent ?? ""))
            .map((cell) => {
              const range = document.createRange();
              range.selectNodeContents(cell);
              return range.getClientRects().length;
            }),
        );
      expect(
        wrapped.every((lines) => lines === 1),
        "Plan headings and exact numeric allowances must remain unbroken",
      ).toBe(true);

      await page.screenshot({
        path: resolve(
          `../../.superpowers/sdd/2026-09-19-12-premium-billing/screenshots/${locale}-${info.project.name}-pricing.png`,
        ),
        fullPage: true,
      });
      const signed = await page.request.post("/api/auth/sign-in/email", {
        headers: { origin, "x-forwarded-for": f.ip },
        data: { email: f.email, password: f.password },
      });
      expect(signed.status()).toBe(200);
      await page.goto(`/${locale}/account/billing`);
      await expect(page.getByTestId("billing-usage-ITEM_CREATE")).toContainText("1 / 1");
      await page.route("https://checkout.stripe.com/**", (route) =>
        route.fulfill({
          status: 200,
          contentType: "text/plain",
          body: "Offline QA checkout: no payment",
        }),
      );
      const sent = page.waitForRequest(
        (request) =>
          new URL(request.url()).pathname === "/api/v1/billing/checkout" &&
          request.method() === "POST",
      );
      await page.getByTestId("billing-offer-MONTHLY").getByRole("button").click();
      const request = await sent;
      expect(request.postDataJSON()).toEqual({
        locale,
        cadence: "MONTHLY",
        requestKey: expect.any(String),
      });
      await expect(page).toHaveURL(/^https:\/\/checkout\.stripe\.com\/c\/pay\/offline_/u);
      expect(
        await db!
          .$queryRaw`SELECT count(*)::int AS count FROM "BillingSubscription" WHERE "subjectId"=${f.ownerId}`,
      ).toEqual([{ count: 0 }]);
      await page.goto(`/${locale}/account/billing?checkout=success`);
      await expect(page.getByTestId("billing-plan")).toHaveText("Free");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.goto(`/${locale}/dashboard`);
      await expect(page.getByTestId("dashboard-selection-rows")).toHaveText("1");
      await expect(
        page.getByText(
          locale === "de"
            ? "Erweiterte Analysen sind mit Premium verfügbar. Deine grundlegende Sammlungsübersicht bleibt nutzbar."
            : "Advanced analytics are available with Premium. Your basic collection overview remains available.",
          { exact: true },
        ),
      ).toBeVisible();
      await page.screenshot({
        path: resolve(
          `../../.superpowers/sdd/2026-09-19-12-premium-billing/screenshots/${locale}-${info.project.name}-free-dashboard.png`,
        ),
        fullPage: true,
      });
    } finally {
      await cleanupSearchFixture(f);
    }
  });
  test(`${locale}: confirmed cancellation, real portal and downgrade preserve existing inventory`, async ({
    page,
  }, info) => {
    test.skip(
      !enabled || process.env.RUN_BILLING_E2E !== "1",
      "Requires owned offline billing fixture",
    );
    const f = await searchFixture();
    try {
      await db!
        .$executeRaw`INSERT INTO "BillingAccount" ("subjectId",provider,"providerCustomerId") VALUES (${f.ownerId},'stripe_test',${"cus_" + f.ownerId.replaceAll("-", "")})`;
      await db!
        .$executeRaw`INSERT INTO "BillingSubscription" (id,"subjectId",provider,"providerSubscriptionId","planEligible",status,"currentPeriodStart","currentPeriodEnd","cancelAtPeriodEnd","providerUpdatedAt") VALUES (${randomUUID()}::uuid,${f.ownerId},'stripe_test',${"sub_" + randomUUID().replaceAll("-", "")},true,'ACTIVE',timezone('UTC',clock_timestamp())-interval '1 hour',timezone('UTC',clock_timestamp())+interval '1 hour',true,timezone('UTC',clock_timestamp()))`;
      await db!.collectibleItem.create({
        data: { ownerId: f.ownerId, collectionId: f.collectionId, title: "Retained second item" },
      });
      const signed = await page.request.post("/api/auth/sign-in/email", {
        headers: { origin, "x-forwarded-for": f.ip },
        data: { email: f.email, password: f.password },
      });
      expect(signed.status()).toBe(200);
      await page.goto(`/${locale}/account/billing`);
      await expect(page.getByTestId("billing-plan")).toHaveText("Premium");
      await expect(page.getByTestId("billing-period")).toContainText(
        locale === "de" ? "Gekündigt" : "Cancellation",
      );
      await page.screenshot({
        path: resolve(
          `../../.superpowers/sdd/2026-09-19-12-premium-billing/screenshots/${locale}-${info.project.name}-premium.png`,
        ),
        fullPage: true,
      });
      await page.route("https://billing.stripe.com/**", (route) =>
        route.fulfill({
          status: 200,
          contentType: "text/plain",
          body: "Offline QA portal: no payment",
        }),
      );
      await page
        .getByRole("button", {
          name:
            locale === "de" ? "Abo und Rechnungen verwalten" : "Manage subscription and invoices",
          exact: true,
        })
        .click();
      await expect(page).toHaveURL(/^https:\/\/billing\.stripe\.com\/p\/session\/offline_/u);
      await db!
        .$executeRaw`UPDATE "BillingSubscription" SET status='CANCELED' WHERE "subjectId"=${f.ownerId}`;
      await page.goto(`/${locale}/account/billing`);
      await expect(page.getByTestId("billing-plan")).toHaveText("Free");
      await expect(page.getByTestId("billing-retained-excess")).toBeVisible();
      await expect(page.getByTestId("billing-usage-ITEM_CREATE")).toContainText("2 / 1");
      expect(await db!.collectibleItem.count({ where: { ownerId: f.ownerId } })).toBe(2);
      await page.screenshot({
        path: resolve(
          `../../.superpowers/sdd/2026-09-19-12-premium-billing/screenshots/${locale}-${info.project.name}-downgrade.png`,
        ),
        fullPage: true,
      });
      const nextLocale = locale === "de" ? "en" : "de";
      await page
        .getByRole("link", { name: locale === "de" ? "English" : "Deutsch", exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp("/" + nextLocale + "/account/billing$"));
      await expect(page.getByTestId("billing-plan")).toHaveText("Free");
    } finally {
      await cleanupSearchFixture(f);
    }
  });
}
