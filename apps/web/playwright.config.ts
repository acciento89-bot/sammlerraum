import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
  },
  projects: [
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
