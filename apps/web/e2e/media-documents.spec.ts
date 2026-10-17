import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createPrismaClient } from "@sammlerraum/db/create-client";
import { LocalPersistentStorage } from "@sammlerraum/storage";
import { hashPassword } from "better-auth/crypto";

const enabled = process.env.RUN_AUTH_E2E === "1";
const url = process.env.DATABASE_URL ?? "";
if (enabled && !new URL(url).pathname.endsWith("_test"))
  throw new Error("Media fixtures require _test database");
const db = createPrismaClient(url);
const origin = "http://localhost:3000";
const png = Buffer.from(
  "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",
  "base64",
);
const pdf = Buffer.from("%PDF-1.7\n1 0 obj <<>> endobj\n%%EOF");
const copy = {
  de: {
    upload: "Galeriebild hochladen",
    doc: "Dokument hochladen",
    title: "Als Titelbild verwenden",
    up: "Nach vorne",
    down: "Nach hinten",
    category: "Dokumentart",
    visibility: "Dokumentsichtbarkeit",
    cancel: "Upload abbrechen",
    canceled: "Upload abgebrochen.",
    uploaded: "Upload mit diesem Stück verknüpft.",
    typeError: "Nicht unterstützte oder ungültige Datei.",
    tooLarge: "Diese Datei ist zu groß.",
    error: "Die Aktion ist fehlgeschlagen.",
    failed: "Verarbeitung fehlgeschlagen",
    pending: "Wartet auf Verarbeitung",
  },
  en: {
    upload: "Upload gallery image",
    doc: "Upload document",
    title: "Use as title image",
    up: "Move earlier",
    down: "Move later",
    category: "Document category",
    visibility: "Document visibility",
    cancel: "Cancel upload",
    canceled: "Upload canceled.",
    uploaded: "Upload linked to this item.",
    typeError: "Unsupported or invalid file.",
    tooLarge: "This file is too large.",
    error: "The action failed.",
    failed: "Processing failed",
    pending: "Waiting for processing",
  },
};
async function collector() {
  const id = randomUUID();
  const email = `${id}@example.test`;
  const password = "correct-horse-battery-staple";
  await db.user.create({
    data: {
      id,
      name: "Media Collector",
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
    },
  });
  return { id, email, password };
}
async function cleanup(ownerId: string) {
  await expect
    .poll(
      () => db.mediaAsset.count({ where: { ownerId, status: { in: ["PENDING", "PROCESSING"] } } }),
      { timeout: 60_000 },
    )
    .toBe(0);
  const assets = await db.mediaAsset.findMany({ where: { ownerId }, include: { variants: true } });
  await db.mediaLink.deleteMany({ where: { ownerId } });
  await db.documentLink.deleteMany({ where: { ownerId } });
  await db.mediaVariant.deleteMany({ where: { asset: { ownerId } } });
  await db.mediaAsset.deleteMany({ where: { ownerId } });
  await db.user.delete({ where: { id: ownerId } });
  const storage = new LocalPersistentStorage(process.env.UPLOADS_DIR!);
  await Promise.all(
    assets
      .flatMap((asset) => [
        asset.storageKey,
        ...asset.variants.map((variant) => variant.storageKey),
      ])
      .map((key) => storage.delete(key)),
  );
}

test.describe("item media and private documents", () => {
  test.skip(!enabled, "requires migrated test database");
  test.setTimeout(180_000);
  test.beforeEach(async () => {
    // Match management fixtures: each isolated test collector starts with fresh test-only limits.
    if (enabled) await db.rateLimit.deleteMany();
  });
  test.afterAll(async () => {
    // Do not carry synthetic sign-in attempts into the later auth journey command.
    if (enabled) await db.rateLimit.deleteMany();
    await db.$disconnect();
  });
  test("Unicode upload filenames preserve literal percent sequences", async ({ page }) => {
    const owner = await collector();
    const collection = await db.collection.create({
      data: { ownerId: owner.id, name: "Unicode media", visibility: "PRIVATE" },
    });
    const item = await db.collectibleItem.create({
      data: { ownerId: owner.id, collectionId: collection.id, title: "Unicode media" },
    });
    const name = "Łódź – coin 🪙 100%25.png";
    try {
      expect(
        (
          await page.request.post("/api/auth/sign-in/email", {
            data: { email: owner.email, password: owner.password },
            headers: { origin },
          })
        ).status(),
      ).toBe(200);
      await page.goto(`/en/items/${item.id}`);
      const input = page.getByLabel("Upload gallery image", { exact: true });
      await expect(input).toBeEnabled();
      await input.setInputFiles({ name, mimeType: "image/png", buffer: png });
      await expect(page.getByText("Upload linked to this item.", { exact: true })).toBeVisible();
      const listing = await (await page.request.get(`/api/v1/items/${item.id}/media`)).json();
      expect(listing.images[0].asset.originalFileName).toBe(name);
      await expect(page.getByRole("img", { name, exact: true })).toBeVisible({ timeout: 50_000 });
    } finally {
      await cleanup(owner.id);
    }
  });
  for (const locale of ["de", "en"] as const) {
    test(`public item can have a purchase receipt that remains private (${locale})`, async ({
      page,
      browser,
    }, info) => {
      const t = copy[locale];
      const owner = await collector();
      const visitor = await collector();
      const collection = await db.collection.create({
        data: { ownerId: owner.id, name: "Public", visibility: "PUBLIC" },
      });
      const item = await db.collectibleItem.create({
        data: {
          ownerId: owner.id,
          collectionId: collection.id,
          title: "Sammlerstück",
          visibility: "PUBLIC",
          privateNotes: "SECRET NOTE",
          purchaseAmountMinor: 12345,
          purchaseCurrency: "EUR",
        },
      });
      const base = `/api/v1/items/${item.id}`;
      const foreign = await browser.newContext();
      try {
        expect(
          (
            await page.request.post("/api/auth/sign-in/email", {
              data: { email: owner.email, password: owner.password },
              headers: { origin },
            })
          ).status(),
        ).toBe(200);
        await page.goto(`/${locale}/items/${item.id}`);
        const upload = page.getByLabel(t.upload, { exact: true });
        await expect(upload).toBeVisible();
        await expect(upload).toBeEnabled();
        await upload.setInputFiles({ name: "spoof.png", mimeType: "image/png", buffer: pdf });
        await expect(page.locator(".item-media p[role=alert]")).toContainText(t.typeError);
        await expect(upload).toBeEnabled();
        await upload.setInputFiles({
          name: "oversize.png",
          mimeType: "image/png",
          buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
        });
        await expect(page.locator(".item-media p[role=alert]")).toContainText(t.tooLarge);
        await page.route("**/api/v1/media/images", (route) => route.abort("failed"));
        await expect(upload).toBeEnabled();
        await upload.setInputFiles({ name: "network.png", mimeType: "image/png", buffer: png });
        await expect(page.locator(".item-media p[role=alert]")).toContainText(t.error);
        await page.unroute("**/api/v1/media/images");
        for (const name of ["first.png", "second.png"]) {
          await expect(upload).toBeEnabled();
          await upload.setInputFiles({ name, mimeType: "image/png", buffer: png });
          await expect(page.getByRole("img", { name, exact: true })).toBeVisible({
            timeout: 50_000,
          });
        }
        let listed = await (await page.request.get(`${base}/media`)).json();
        expect(listed.images).toHaveLength(2);
        const firstId = listed.images[0].id;
        const secondId = listed.images[1].id;
        const imageId = listed.images[0].asset.id;
        expect(await db.mediaVariant.count({ where: { assetId: imageId } })).toBe(3);
        expect(
          (await page.request.get(`/api/v1/media/${imageId}/medium`)).headers()["content-type"],
        ).toContain("image/webp");
        const gallery = page.locator(".media-grid");
        await gallery
          .locator("li")
          .nth(1)
          .getByRole("button", { name: t.title, exact: true })
          .click();
        await expect(gallery.locator("li").first()).toContainText("second.png");
        if (info.project.name === "desktop") {
          await gallery.locator("li").first().dragTo(gallery.locator("li").nth(1));
        } else {
          const down = page.getByRole("button", { name: `${t.down}: second.png`, exact: true });
          await down.focus();
          await page.keyboard.press("Enter");
        }
        await expect(gallery.locator("li").first()).toContainText("first.png");
        await page.getByRole("button", { name: `${t.up}: second.png`, exact: true }).click();
        await expect(gallery.locator("li").first()).toContainText("second.png");
        await page.reload();
        await expect(gallery.locator("li").first()).toContainText("second.png");
        listed = await (await page.request.get(`${base}/media`)).json();
        expect(listed.images.map((link: { id: string }) => link.id)).toEqual([secondId, firstId]);
        expect(JSON.stringify(listed)).not.toMatch(/storageKey|originals\/|ownerId|checksumSha256/);
        // Exercise cancellation while the link response and while the subsequent refresh are in flight.
        for (const cancelStage of ["link", "reload"]) {
          let releaseRequest = () => {};
          let reachedStage = () => {};
          let didLink = false;
          const atStage = new Promise<void>((resolve) => {
            reachedStage = resolve;
          });
          const release = new Promise<void>((resolve) => {
            releaseRequest = resolve;
          });
          await page.route(`**${base}/media`, async (route) => {
            const method = route.request().method();
            if (method === "POST") {
              const response = await route.fetch();
              didLink = true;
              if (cancelStage === "link") {
                reachedStage();
                await release;
              }
              await route.fulfill({ response });
            } else if (method === "GET" && didLink && cancelStage === "reload") {
              const response = await route.fetch();
              reachedStage();
              await release;
              await route.fulfill({ response });
            } else await route.continue();
          });
          await expect(upload).toBeEnabled();
          const name = `cancel-${cancelStage}.png`;
          await upload.setInputFiles({ name, mimeType: "image/png", buffer: png });
          await atStage;
          await page.getByRole("button", { name: t.cancel, exact: true }).click();
          releaseRequest();
          await expect(page.getByText(t.canceled, { exact: true })).toBeVisible();
          await expect(page.getByText(t.uploaded, { exact: true })).toHaveCount(0);
          await expect.poll(() => db.mediaLink.count({ where: { itemId: item.id } })).toBe(2);
          await page.unroute(`**${base}/media`);
          const canceledAsset = await db.mediaAsset.findFirst({
            where: { ownerId: owner.id, originalFileName: name },
          });
          expect(canceledAsset).not.toBeNull();
          expect(canceledAsset?.orphanedAt).not.toBeNull();
        }
        const receiptInput = page.getByLabel(t.doc, { exact: true });
        await expect(page.getByLabel(t.visibility, { exact: true })).toHaveValue("PRIVATE");
        await receiptInput.setInputFiles({
          name: "receipt.pdf",
          mimeType: "application/pdf",
          buffer: pdf,
        });
        await expect(
          page.getByRole("link", {
            name: locale === "de" ? "Dokument herunterladen" : "Download document",
          }),
        ).toBeVisible();
        listed = await (await page.request.get(`${base}/media`)).json();
        const receipt = listed.documents[0];
        expect(receipt).toMatchObject({ category: "PURCHASE_RECEIPT", visibility: "PRIVATE" });
        const receiptUrl = `/api/v1/media/${receipt.asset.id}/original`;
        await expect(receiptInput).toBeEnabled();
        await receiptInput.setInputFiles({
          name: "temporary.pdf",
          mimeType: "application/pdf",
          buffer: pdf,
        });
        const temporary = page.locator(".media-documents li").filter({ hasText: "temporary.pdf" });
        await expect(temporary).toBeVisible();
        await temporary
          .getByRole("button", {
            name: locale === "de" ? "Verknüpfung entfernen" : "Remove link",
            exact: true,
          })
          .click();
        await expect(temporary).toHaveCount(0);
        const receiptOwner = await page.request.get(receiptUrl);
        expect(receiptOwner.status()).toBe(200);
        expect(receiptOwner.headers()["cache-control"]).toContain("no-store");
        await page
          .getByLabel(`${t.category}: receipt.pdf`, { exact: true })
          .selectOption("INVOICE");
        await expect
          .poll(
            async () =>
              (await (await page.request.get(`${base}/media`)).json()).documents[0].category,
          )
          .toBe("INVOICE");
        await page
          .getByLabel(`${t.visibility}: receipt.pdf`, { exact: true })
          .selectOption("PUBLIC");
        await expect
          .poll(
            async () =>
              (await (await page.request.get(`${base}/media`)).json()).documents[0].visibility,
          )
          .toBe("PUBLIC");
        expect((await foreign.request.get(origin + receiptUrl)).status()).toBe(200);
        await page
          .getByLabel(`${t.visibility}: receipt.pdf`, { exact: true })
          .selectOption("PRIVATE");
        await expect
          .poll(
            async () =>
              (await (await page.request.get(`${base}/media`)).json()).documents[0].visibility,
          )
          .toBe("PRIVATE");
        await page.reload();
        await expect(page.getByLabel(`${t.visibility}: receipt.pdf`, { exact: true })).toHaveValue(
          "PRIVATE",
        );
        expect(
          (
            await page.request.put(`${base}/media`, {
              data: { linkIds: [firstId, secondId] },
              headers: { origin: "https://evil.invalid" },
            })
          ).status(),
        ).toBe(403);
        expect(
          (
            await page.request.patch(`${base}/documents/${receipt.id}`, {
              data: { category: "INVOICE", visibility: "PUBLIC" },
              headers: { origin: "https://evil.invalid" },
            })
          ).status(),
        ).toBe(403);
        expect(
          (
            await page.request.put(`${base}/media`, {
              data: { linkIds: [firstId, randomUUID()] },
              headers: { origin },
            })
          ).status(),
        ).toBe(404);
        expect(
          (
            await foreign.request.post(`${origin}/api/auth/sign-in/email`, {
              data: { email: visitor.email, password: visitor.password },
              headers: { origin },
            })
          ).status(),
        ).toBe(200);
        expect((await foreign.request.get(origin + `${base}/media`)).status()).toBe(404);
        expect(
          (
            await foreign.request.put(origin + `${base}/media`, {
              data: { linkIds: [firstId, secondId] },
              headers: { origin },
            })
          ).status(),
        ).toBe(404);
        expect(
          (
            await foreign.request.patch(origin + `${base}/documents/${receipt.id}`, {
              data: { category: "INVOICE", visibility: "PUBLIC" },
              headers: { origin },
            })
          ).status(),
        ).toBe(404);
        expect(
          (
            await foreign.request.post(origin + `${base}/media`, {
              data: { assetId: imageId, purpose: "GALLERY" },
              headers: { origin },
            })
          ).status(),
        ).toBe(404);
        expect(
          (
            await foreign.request.delete(origin + `${base}/media/${firstId}`, {
              headers: { origin },
            })
          ).status(),
        ).toBe(404);
        expect((await foreign.request.get(origin + receiptUrl)).status()).toBe(404);
        // Force the actual worker's missing-source path for an uploaded image. No READY variants are seeded.
        const pendingUpload = await page.request.post("/api/v1/media/images", {
          data: png,
          headers: { origin, "content-type": "image/png", "x-file-name": "missing.png" },
        });
        expect(pendingUpload.status()).toBe(201);
        const missing = (await pendingUpload.json()).asset;
        await new LocalPersistentStorage(process.env.UPLOADS_DIR!).delete(
          `originals/${missing.id}`,
        );
        expect(
          (
            await page.request.post(`${base}/media`, {
              data: { assetId: missing.id, purpose: "GALLERY" },
              headers: { origin },
            })
          ).status(),
        ).toBe(201);
        await page.reload();
        const failed = gallery.locator("li").filter({ hasText: "missing.png" });
        await expect(failed).toContainText(t.failed, { timeout: 50_000 });
        await expect(failed).toContainText(
          locale === "de" ? "lade das Bild erneut hoch" : "upload the image again",
        );
        await failed
          .getByRole("button", {
            name: locale === "de" ? "Verknüpfung entfernen" : "Remove link",
            exact: true,
          })
          .click();
        await expect(failed).toHaveCount(0);
        await page.screenshot({
          path: info.outputPath(`sammlerraum-media-owner-${info.project.name}-${locale}.png`),
          fullPage: true,
        });
        expect(
          (
            await page.request.post("/api/auth/sign-out", { data: {}, headers: { origin } })
          ).status(),
        ).toBe(200);
        await page.goto(`/${locale}/items/${item.id}`);
        await expect(page.getByAltText("Sammlerstück").first()).toBeVisible();
        const deniedReceipt = await page.request.get(receiptUrl);
        expect(deniedReceipt.status()).toBe(404);
        expect(deniedReceipt.headers()["cache-control"]).toContain("no-store");
        expect((await page.request.get(`/api/v1/media/${imageId}/original`)).status()).toBe(404);
        expect((await page.request.get(`${base}/media`)).status()).toBe(401);
        expect(await page.locator("body").innerText()).not.toMatch(/SECRET NOTE|receipt.pdf|12345/);
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
        await expect(upload).toHaveCount(0);
        await page.screenshot({
          path: info.outputPath(`sammlerraum-media-public-${info.project.name}-${locale}.png`),
          fullPage: true,
        });
        await db.collection.update({
          where: { id: collection.id },
          data: { visibility: "PRIVATE" },
        });
        expect((await page.request.get(`/${locale}/items/${item.id}`)).status()).toBe(404);
      } finally {
        await foreign.close();
        await cleanup(owner.id);
        await cleanup(visitor.id);
      }
    });
  }
});
