import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Both fixture workers and the spawned app use explicit synthetic product policy.
// The real application still fails closed when its own policy is missing.
process.env.BILLING_PLAN_LIMITS ??= readFileSync(
  new URL(
    process.env.RUN_SECURITY_E2E === "1"
      ? "../../packages/testing/fixtures/security-billing-policy.json"
      : process.env.RUN_BILLING_E2E === "1"
        ? "../../packages/testing/fixtures/billing-browser-policy.json"
        : "../../packages/testing/fixtures/legacy-billing-policy.json",
    import.meta.url,
  ),
  "utf8",
);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
  },
  projects: [
    {
      name: "admin-desktop",
      testMatch: "**/admin-users.spec.ts",
      use: { viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "admin-mobile",
      testMatch: "**/admin-users.spec.ts",
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    { name: "seo-release-api", testMatch: "**/seo-release-verifier.spec.ts" },
    {
      name: "seo-desktop",
      testMatch: [
        "**/search-indexing-control.spec.ts",
        "**/public-indexability.spec.ts",
        "**/sitemaps.spec.ts",
        "**/category-pages.spec.ts",
        "**/structured-previews.spec.ts",
      ],
      use: { viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "seo-mobile",
      testMatch: [
        "**/search-indexing-control.spec.ts",
        "**/public-indexability.spec.ts",
        "**/sitemaps.spec.ts",
        "**/category-pages.spec.ts",
        "**/structured-previews.spec.ts",
      ],
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    {
      name: "marketing-desktop",
      testMatch: ["**/marketing-seo.spec.ts", "**/legal-information.spec.ts"],
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "marketing-mobile",
      testMatch: ["**/marketing-seo.spec.ts", "**/legal-information.spec.ts"],
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    { name: "security-api", testMatch: "**/security-permissions.spec.ts" },
    {
      name: "v1-desktop",
      testMatch: "**/v1-critical-paths.spec.ts",
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "v1-mobile",
      testMatch: "**/v1-critical-paths.spec.ts",
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
    {
      name: "billing-desktop",
      testMatch: "**/billing.spec.ts",
      use: { viewport: { width: 1440, height: 1000 } },
    },
    { name: "billing-mobile", testMatch: "**/billing.spec.ts", use: { ...devices["Pixel 7"] } },
    {
      name: "ai-desktop",
      testMatch: ["**/ai-capture.spec.ts", "**/ai-catalog-review.spec.ts"],
      use: { viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "ai-mobile",
      testMatch: ["**/ai-capture.spec.ts", "**/ai-catalog-review.spec.ts"],
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "community-ui-desktop",
      testMatch: ["**/community.spec.ts", "**/public-profile.spec.ts"],
      use: { viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "community-ui-mobile",
      testMatch: ["**/community.spec.ts", "**/public-profile.spec.ts"],
      use: { ...devices["Pixel 7"] },
    },
    { name: "community-api", testMatch: "**/community-api.spec.ts" },
    {
      name: "collaboration-ui-desktop",
      testMatch: ["**/collaboration-sharing.spec.ts", "**/collaboration-management.spec.ts"],
      use: { viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "collaboration-ui-mobile",
      testMatch: ["**/collaboration-sharing.spec.ts", "**/collaboration-management.spec.ts"],
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "sharing-desktop",
      testMatch: "**/sharing.spec.ts",
      use: { viewport: { width: 1440, height: 1000 } },
    },
    { name: "sharing-mobile", testMatch: "**/sharing.spec.ts", use: { ...devices["Pixel 7"] } },
    { name: "collaboration-api", testMatch: "**/collaboration-api.spec.ts" },
    ...(process.env.RUN_MONEY_CONSUMERS_E2E === "1"
      ? [
          {
            name: "money-consumers-desktop",
            testMatch: "**/money-consumers.spec.ts",
            use: { viewport: { width: 1440, height: 1000 } },
          },
          {
            name: "money-consumers-mobile",
            testMatch: "**/money-consumers.spec.ts",
            use: { ...devices["Pixel 7"] },
          },
        ]
      : []),
    ...(process.env.RUN_MONEY_UI_E2E === "1"
      ? [
          {
            name: "money-ui-desktop",
            testMatch: ["**/legacy-money.spec.ts", "**/catalog-money-ui.spec.ts"],
            use: { viewport: { width: 1440, height: 1000 } },
          },
          {
            name: "money-ui-mobile",
            testMatch: ["**/legacy-money.spec.ts", "**/catalog-money-ui.spec.ts"],
            use: { ...devices["Pixel 7"] },
          },
        ]
      : []),
    ...(process.env.RUN_CATALOG_MONEY_E2E === "1"
      ? [
          {
            name: "catalog-money-desktop",
            testMatch: "**/catalog-money-api.spec.ts",
            use: { viewport: { width: 1440, height: 1000 } },
          },
          {
            name: "catalog-money-mobile",
            testMatch: "**/catalog-money-api.spec.ts",
            use: { ...devices["Pixel 7"] },
          },
        ]
      : []),
    {
      name: "auth",
      testMatch: "**/auth.spec.ts",
    },
    { name: "media", testMatch: "**/media-read.spec.ts" },
    {
      name: "desktop",
      testMatch: [
        "**/catalog-grading.spec.ts",
        "**/valuations.spec.ts",
        "**/search-dashboard.spec.ts",
        "**/scoped-search.spec.ts",
        "**/personal-milestone-api.spec.ts",
        "**/personal-milestones.spec.ts",
        "**/collections-items.spec.ts",
        "**/import-report.spec.ts",
        "**/location-labels.spec.ts",
        "**/media-documents.spec.ts",
      ],
      use: { viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile",
      testMatch: [
        "**/catalog-grading.spec.ts",
        "**/valuations.spec.ts",
        "**/search-dashboard.spec.ts",
        "**/scoped-search.spec.ts",
        "**/personal-milestone-api.spec.ts",
        "**/personal-milestones.spec.ts",
        "**/collections-items.spec.ts",
        "**/import-report.spec.ts",
        "**/location-labels.spec.ts",
        "**/media-documents.spec.ts",
      ],
      use: { ...devices["Pixel 7"] },
    },
  ],
  ...(process.env.RUN_AUTH_E2E === "1"
    ? {
        webServer: {
          command: "node e2e/support/browser-test-server.mjs",
          env: {
            E2E_MAILBOX_PATH: "/tmp/sammlerraum-auth-e2e-mailbox.json",
            RUN_AUTH_E2E: "1",
          },
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          url: "http://localhost:3000/de",
        },
      }
    : {}),
});
