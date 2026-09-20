import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
  },
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
