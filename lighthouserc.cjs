const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const fromWeb = createRequire(resolve(__dirname, "apps/web/package.json"));
const outputDir = resolve(
  __dirname,
  ".superpowers/sdd/2026-09-19-14-seo-search-console/lighthouse",
  new Date().toISOString().replace(/[:.]/g, "-"),
);
module.exports = {
  ci: {
    collect: {
      startServerCommand: "node scripts/start-seo-audit.mjs",
      startServerReadyPattern: "SEO_AUDIT_READY",
      startServerReadyTimeout: 60000,
      chromePath: process.env.CHROME_PATH || fromWeb("@playwright/test").chromium.executablePath(),
      url: [
        "/de",
        "/en",
        "/de/funktionen",
        "/de/preise",
        "/de/sammeln/muenzen",
        "/en/collecting/coins",
      ].map((path) => "http://localhost:3017" + path),
      numberOfRuns: 3,
      settings: {
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
        chromeFlags: process.env.CI
          ? "--no-sandbox --disable-dev-shm-usage"
          : "--disable-dev-shm-usage",
      },
    },
    assert: {
      assertions: {
        "categories:seo": ["error", { minScore: 0.95 }],
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "categories:best-practices": ["error", { minScore: 0.95 }],
        "categories:performance": ["error", { minScore: 0.85 }],
      },
    },
    // Never upload source, cookies, user content or audit results to a third-party service.
    upload: { target: "filesystem", outputDir },
  },
};
