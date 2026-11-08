import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "collector-redesign.spec.ts",
  timeout: 120_000,
  workers: 1,
  use: { baseURL: "http://localhost:3018", actionTimeout: 15_000 },
  projects: [
    { name: "collector-desktop", use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "collector-mobile",
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
});
