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
      name: "auth",
      testMatch: "**/auth.spec.ts",
    },
    {
      name: "desktop",
      testMatch: "**/collections-items.spec.ts",
      use: { viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile",
      testMatch: "**/collections-items.spec.ts",
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
