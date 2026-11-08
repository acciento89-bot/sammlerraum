import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { aiCaptureFixture } from "./support/ai-capture-fixture";
import { db, enabled } from "./support/search-fixture";
test.afterAll(async () => {
  await db?.$disconnect();
});
for (const locale of ["de", "en"] as const) {
  test(`${locale}: real photo suggestions change the item only after explicit field confirmation`, async ({
    page,
  }, testInfo) => {
    test.skip(!enabled || process.env.RUN_AI_E2E !== "1", "Requires owned AI browser fixture");
    const f = await aiCaptureFixture(page);
    try {
      await page.goto(`/${locale}/items/${f.itemId}/ai`);
      await expect(
        page.getByRole("heading", {
          name: locale === "de" ? "Fotoanalyse" : "Photo analysis",
          exact: true,
          level: 1,
        }),
      ).toBeVisible({ timeout: 3000 });
      await expect(page.getByTestId("ai-review")).toBeVisible();
      expect((await db!.collectibleItem.findUniqueOrThrow({ where: { id: f.itemId } })).title).toBe(
        "Synthetic untagged card",
      );
      await expect(page.getByTestId("ai-warning")).toContainText("Please check");
      await expect(
        page.getByLabel(locale === "de" ? "Titel übernehmen" : "Accept title", { exact: true }),
      ).not.toBeChecked();
      await page
        .getByLabel(locale === "de" ? "Titel übernehmen" : "Accept title", { exact: true })
        .check();
      await page.screenshot({
        path: resolve(
          `../../.superpowers/sdd/2026-09-19-11-ai-assisted-capture/screenshots/${locale}-${testInfo.project.name}-review.png`,
        ),
        fullPage: true,
      });
      await page
        .getByRole("button", {
          name: locale === "de" ? "Auswahl übernehmen" : "Apply selection",
          exact: true,
        })
        .click();
      await expect(page.getByTestId("ai-decision")).toBeVisible();
      expect((await db!.collectibleItem.findUniqueOrThrow({ where: { id: f.itemId } })).title).toBe(
        "Green ceramic vase",
      );
      expect(await db!.customFieldValue.count({ where: { itemId: f.itemId } })).toBe(0);
    } finally {
      await f.cleanup();
    }
  });
}

import de from "../messages/de.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import { AIAnalysisJobSchema } from "@sammlerraum/contracts/ai";
import { createAnalyzeItemJob } from "../../worker/src/jobs/analyze-item";
const copies = { de: de.AI, en: en.AI };
async function startPhoto(
  page: import("@playwright/test").Page,
  locale: "de" | "en",
  itemId: string,
) {
  const copy = copies[locale];
  await page.getByLabel(copy.photo.replace("{number}", "1"), { exact: true }).check();
  await page.getByLabel(copy.consent, { exact: true }).check();
  const queued = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === `/api/v1/items/${itemId}/ai`,
  );
  await page.getByRole("button", { name: copy.analyze, exact: true }).click();
  const response = await queued;
  expect(response.status()).toBe(201);
  return AIAnalysisJobSchema.parse((await response.json()).job);
}
for (const locale of ["de", "en"] as const) {
  const copy = copies[locale];
  test(`${locale}: selected photo travels through actual admission worker polling and review without automatic mutation`, async ({
    page,
  }, testInfo) => {
    test.skip(!enabled || process.env.RUN_AI_E2E !== "1", "Requires owned AI browser fixture");
    const f = await aiCaptureFixture(page, false);
    try {
      await page.goto(`/${locale}/items/${f.itemId}/ai`);
      await expect(page.getByRole("button", { name: copy.analyze, exact: true })).toBeDisabled();
      const job = await startPhoto(page, locale, f.itemId);
      await expect(
        page.getByRole("heading", { name: copy.status.PENDING, exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: resolve(
          `../../.superpowers/sdd/2026-09-19-11-ai-assisted-capture/screenshots/${locale}-${testInfo.project.name}-queued.png`,
        ),
        fullPage: true,
      });
      const handler = createAnalyzeItemJob(
        f.service,
        {
          id: "openai",
          model: "fixture-vision",
          analyzeCollectible: async () => ({
            analysis: f.analysis,
            usage: { inputTokens: 12, outputTokens: 5 },
          }),
        },
        f.storage,
      );
      await handler({ analysisJobId: job.id });
      await expect(page.getByTestId("ai-review")).toBeVisible();
      expect((await db!.collectibleItem.findUniqueOrThrow({ where: { id: f.itemId } })).title).toBe(
        "Synthetic untagged card",
      );
      await page.getByRole("button", { name: copy.rejectAll, exact: true }).click();
      await expect(page.getByTestId("ai-decision")).toContainText(copy.rejected);
      expect((await db!.collectibleItem.findUniqueOrThrow({ where: { id: f.itemId } })).title).toBe(
        "Synthetic untagged card",
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
    } finally {
      await f.cleanup();
    }
  });
  test(`${locale}: recovers a pending job after reload and permits cancellation and a fresh request`, async ({
    page,
  }) => {
    test.skip(!enabled || process.env.RUN_AI_E2E !== "1", "Requires owned AI browser fixture");
    const f = await aiCaptureFixture(page, false);
    try {
      await page.goto(`/${locale}/items/${f.itemId}/ai`);
      const first = await startPhoto(page, locale, f.itemId);
      await page.reload();
      await expect(
        page.getByRole("heading", { name: copy.status.PENDING, exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: copy.cancel, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: copy.status.CANCELLED, exact: true }),
      ).toBeVisible();
      const second = await startPhoto(page, locale, f.itemId);
      expect(second.id).not.toBe(first.id);
      expect((await db!.aIAnalysisJob.findUniqueOrThrow({ where: { id: first.id } })).status).toBe(
        "CANCELLED",
      );
    } finally {
      await f.cleanup();
    }
  });
  test(`${locale}: creates an explicit personal year destination and preserves unselected title`, async ({
    page,
  }) => {
    test.skip(!enabled || process.env.RUN_AI_E2E !== "1", "Requires owned AI browser fixture");
    const f = await aiCaptureFixture(page);
    try {
      await page.goto(`/${locale}/items/${f.itemId}/ai`);
      await expect(page.getByTestId("ai-review")).toBeVisible();
      await page
        .locator(".ai-suggestion")
        .filter({ has: page.getByRole("heading", { name: copy.year, exact: true }) })
        .getByRole("button", { name: copy.createField, exact: true })
        .click();
      await page.getByLabel(copy.fieldName, { exact: true }).fill("Production year");
      const pending = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname ===
            `/api/v1/collections/${f.collectionId}/custom-fields`,
      );
      await page.getByRole("button", { name: copy.saveField, exact: true }).click();
      const response = await pending;
      expect(response.status()).toBe(201);
      await expect(
        page
          .locator(".ai-review select")
          .last()
          .locator("option")
          .filter({ hasText: "Production year" }),
      ).toBeAttached({ timeout: 5000 });
      await expect(
        page
          .getByLabel(copy.destination.replace("{field}", copy.year), { exact: true })
          .getByRole("option", { name: "Production year", exact: true }),
      ).toBeAttached({ timeout: 5000 });
      await page
        .getByLabel(copy.destination.replace("{field}", copy.year), { exact: true })
        .selectOption({ label: "Production year" }, { timeout: 5000 });
      const field = await db!.customFieldDefinition.findUniqueOrThrow({
        where: {
          collectionId_normalizedName: {
            collectionId: f.collectionId,
            normalizedName: "production year",
          },
        },
      });
      expect(field.type).toBe("INTEGER");
      await page.getByRole("button", { name: copy.apply, exact: true }).click();
      await expect(page.getByTestId("ai-decision")).toBeVisible();
      expect(
        (
          await db!.customFieldValue.findUniqueOrThrow({
            where: { itemId_fieldDefinitionId: { itemId: f.itemId, fieldDefinitionId: field.id } },
          })
        ).integerValue,
      ).toBe(2020n);
      expect((await db!.collectibleItem.findUniqueOrThrow({ where: { id: f.itemId } })).title).toBe(
        "Synthetic untagged card",
      );
    } finally {
      await f.cleanup();
    }
  });
  test(`${locale}: stale human edits require a fresh deliberate selection`, async ({ page }) => {
    test.skip(!enabled || process.env.RUN_AI_E2E !== "1", "Requires owned AI browser fixture");
    const f = await aiCaptureFixture(page);
    try {
      await page.goto(`/${locale}/items/${f.itemId}/ai`);
      await page.getByLabel(copy.acceptTitle, { exact: true }).check();
      await db!.collectibleItem.update({
        where: { id: f.itemId },
        data: { title: "New human title" },
      });
      await page.getByRole("button", { name: copy.apply, exact: true }).click();
      await expect(page.getByTestId("ai-review").getByRole("alert")).toContainText(
        copy.errors.AI_ITEM_CHANGED,
      );
      expect((await db!.collectibleItem.findUniqueOrThrow({ where: { id: f.itemId } })).title).toBe(
        "New human title",
      );
      expect(await db!.aIAnalysisDecision.count({ where: { jobId: f.jobId! } })).toBe(0);
      await page.getByRole("button", { name: copy.refresh, exact: true }).click();
      await expect(page.getByTestId("ai-current-title")).toHaveText("New human title");
      await expect(page.getByLabel(copy.acceptTitle, { exact: true })).not.toBeChecked();
    } finally {
      await f.cleanup();
    }
  });
}

test("a recovered polling outage disappears when the actual job becomes ready", async ({
  page,
}) => {
  test.skip(!enabled || process.env.RUN_AI_E2E !== "1", "Requires owned AI browser fixture");
  const f = await aiCaptureFixture(page, false);
  try {
    const job = await f.service.requestItemAnalysis(
      { userId: f.ownerId },
      f.itemId,
      [f.asset.id],
      crypto.randomUUID(),
    );
    let outage = true;
    await page.route(`**/api/v1/ai/analyses/${job.id}`, async (route) => {
      if (outage) {
        outage = false;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "AI_UNAVAILABLE" } }),
        });
      } else await route.continue();
    });
    await page.goto(`/de/items/${f.itemId}/ai`);
    await expect(page.locator(".ai-shell > [role=alert]")).toContainText(
      de.AI.errors.AI_UNAVAILABLE,
    );
    const handler = createAnalyzeItemJob(
      f.service,
      {
        id: "openai",
        model: "fixture-vision",
        analyzeCollectible: async () => ({
          analysis: f.analysis,
          usage: { inputTokens: 12, outputTokens: 5 },
        }),
      },
      f.storage,
    );
    await handler({ analysisJobId: job.id });
    await expect(page.getByTestId("ai-review")).toBeVisible();
    await expect(page.locator(".ai-shell > [role=alert]")).toHaveCount(0);
  } finally {
    await f.cleanup();
  }
});
test("retrying a finished failed job uses a new nonce without a page reload", async ({ page }) => {
  test.skip(!enabled || process.env.RUN_AI_E2E !== "1", "Requires owned AI browser fixture");
  const f = await aiCaptureFixture(page, false);
  try {
    await page.goto(`/de/items/${f.itemId}/ai`);
    const first = await startPhoto(page, "de", f.itemId),
      claim = await f.service.claimAnalysis(first.id);
    await f.service.failAnalysis(claim!, "AI_INVALID_RESPONSE", false);
    await expect(
      page.getByRole("heading", { name: de.AI.status.FAILED, exact: true }),
    ).toBeVisible();
    const next = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === `/api/v1/items/${f.itemId}/ai`,
    );
    await page.getByRole("button", { name: de.AI.analyze, exact: true }).click();
    const response = await next;
    expect(response.status()).toBe(201);
    const second = AIAnalysisJobSchema.parse((await response.json()).job);
    expect(second.id).not.toBe(first.id);
  } finally {
    await f.cleanup();
  }
});

test("a slower ready cancellation acknowledgement cannot orphan an already loading review", async ({
  page,
}) => {
  test.skip(!enabled || process.env.RUN_AI_E2E !== "1", "Requires owned AI browser fixture");
  const f = await aiCaptureFixture(page, false);
  let releaseCancel!: () => void,
    releaseReview!: () => void,
    cancelHeld = false,
    reviewHeld = false,
    holdFirstReview = true;
  const cancelGate = new Promise<void>((resolve) => (releaseCancel = resolve)),
    reviewGate = new Promise<void>((resolve) => (releaseReview = resolve));
  try {
    await page.route(`**/api/v1/ai/analyses/*/cancel`, async (route) => {
      cancelHeld = true;
      await cancelGate;
      const response = await route.fetch();
      await route.fulfill({ response });
    });
    await page.route(`**/api/v1/ai/analyses/*/review`, async (route) => {
      if (holdFirstReview) {
        holdFirstReview = false;
        reviewHeld = true;
        await reviewGate;
      }
      await route.continue().catch(() => undefined);
    });
    await page.goto(`/de/items/${f.itemId}/ai`);
    const job = await startPhoto(page, "de", f.itemId);
    await page.getByRole("button", { name: de.AI.cancel, exact: true }).click();
    await expect.poll(() => cancelHeld).toBe(true);
    const handler = createAnalyzeItemJob(
      f.service,
      {
        id: "openai",
        model: "fixture-vision",
        analyzeCollectible: async () => ({
          analysis: f.analysis,
          usage: { inputTokens: 12, outputTokens: 5 },
        }),
      },
      f.storage,
    );
    await handler({ analysisJobId: job.id });
    await expect.poll(() => reviewHeld).toBe(true);
    releaseCancel();
    await expect(page.getByRole("button", { name: de.AI.analyze, exact: true })).toBeEnabled();
    releaseReview();
    await expect(page.getByTestId("ai-review")).toBeVisible();
    expect((await db!.aIAnalysisJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe(
      "READY",
    );
  } finally {
    releaseCancel();
    releaseReview();
    await page.unrouteAll({ behavior: "wait" });
    await f.cleanup();
  }
});
test("a transient first capture failure can reload and recover the actual pending job in place", async ({
  page,
}) => {
  test.skip(!enabled || process.env.RUN_AI_E2E !== "1", "Requires owned AI browser fixture");
  const f = await aiCaptureFixture(page, false);
  let fail = true;
  try {
    const job = await f.service.requestItemAnalysis(
      { userId: f.ownerId },
      f.itemId,
      [f.asset.id],
      crypto.randomUUID(),
    );
    await page.route(`**/api/v1/items/${f.itemId}/ai`, async (route) => {
      if (fail) {
        fail = false;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "AI_UNAVAILABLE" } }),
        });
      } else await route.continue();
    });
    await page.goto(`/de/items/${f.itemId}/ai`);
    await expect(page.locator(".ai-shell > [role=alert]")).toContainText(
      de.AI.errors.AI_UNAVAILABLE,
    );
    await page.getByRole("button", { name: de.AI.refresh, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: de.AI.status.PENDING, exact: true }),
    ).toBeVisible();
    expect(
      await db!.aIAnalysisJob.count({ where: { requesterId: f.ownerId, itemId: f.itemId } }),
    ).toBe(1);
    expect((await db!.aIAnalysisJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe(
      "PENDING",
    );
  } finally {
    await f.cleanup();
  }
});
