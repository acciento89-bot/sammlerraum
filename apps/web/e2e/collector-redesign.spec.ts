import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createPrismaClient } from "@sammlerraum/db/create-client";
import { hashPassword } from "better-auth/crypto";
const origin = "http://localhost:3018";
const folder = resolve(
  process.env.COLLECTOR_VISUAL_OUTPUT ??
    ".superpowers/sdd/2026-11-08-sammlerraum-visual-finish/screenshots",
);
const db = createPrismaClient(process.env.DATABASE_URL!);
const owned = new URL(process.env.DATABASE_URL!);
if (!["localhost", "127.0.0.1"].includes(owned.hostname) || !owned.pathname.endsWith("_test"))
  throw Error("Owned loopback test database only");
test.afterAll(async () => db.$disconnect());
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
test("reference layout, public destinations, DE/EN and mobile navigation", async ({
  page,
}, info) => {
  await mkdir(folder, { recursive: true });
  for (const locale of ["de", "en"]) {
    await page.goto(`/${locale}`);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: locale === "de" ? "Willkommen im Sammlerraum!" : "Welcome to Sammlerraum!",
      }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(".hub-welcome > img")
          .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      )
      .toBe(true);
    await expect(
      page.getByRole("navigation", {
        name: locale === "de" ? "Hauptnavigation" : "Main navigation",
      }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: locale === "de" ? "Sprache" : "Language" })
        .getByRole("link", { name: locale === "de" ? "English" : "Deutsch", exact: true }),
    ).toBeVisible();
    await noOverflow(page);
    expect(
      await page
        .locator(".hub-sidebar nav a")
        .evaluateAll((links) => links.map((a) => a.getAttribute("href"))),
    ).toContain(`/${locale}/collections`);
    await page.screenshot({
      path: resolve(folder, `${info.project.name}-${locale}-startseite.png`),
      fullPage: true,
    });
  }
  for (const [name, path] of [
    ["funktionen", "/de/funktionen"],
    ["preise", "/de/preise"],
    ["kategorie", "/de/sammeln/sammelkarten"],
    ["registrieren", "/de/register"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await noOverflow(page);
    await page.screenshot({
      path: resolve(folder, `${info.project.name}-${name}-overview.png`),
      fullPage: false,
    });
  }
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/de");
  await noOverflow(page);
  await expect(
    page
      .getByRole("navigation", { name: "Sprache" })
      .getByRole("link", { name: "English", exact: true }),
  ).toBeVisible();
  await page.setViewportSize(info.project.use.viewport!);
  await page.goto("/de/login");
  await expect(page.getByLabel("E-Mail-Adresse", { exact: true })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: resolve(folder, `${info.project.name}-anmelden.png`),
    fullPage: true,
  });
});
test("real owned collections, photo upload, responsive workspace and dashboard", async ({
  page,
}, info) => {
  const id = randomUUID(),
    email = `visual-${id}@example.test`,
    password = "owned-visual-fixture-password";
  await db.user.create({
    data: {
      id,
      email,
      name: "Sammlerraum Ansichtstest",
      emailVerified: true,
      accounts: {
        create: {
          id: randomUUID(),
          providerId: "credential",
          accountId: id,
          password: await hashPassword(password),
        },
      },
    },
  });
  const response = await page.request.post("/api/auth/sign-in/email", {
    headers: {
      origin,
      "x-forwarded-for": `198.18.33.${info.project.name.includes("mobile") ? "42" : "41"}`,
    },
    data: { email, password },
  });
  expect(response.status()).toBe(200);
  async function post(path: string, data: unknown) {
    const r = await page.request.post(path, { headers: { origin }, data });
    expect(r.status(), `${path}: ${await r.text()}`).toBe(201);
    return r.json();
  }
  const collections: Array<{ id: string }> = [];
  for (const name of [
    "Meine Lieblingsstücke",
    "Meine Kartenkollektion",
    "Uhren mit Geschichte",
    "Vinyl & Lieblingsalben",
  ])
    collections.push(
      (await post("/api/v1/collections", { name, visibility: "PRIVATE" })).collection,
    );
  const firstCollection = collections[0];
  if (!firstCollection) throw new Error("Fixture collection missing");
  const items: Array<{ id: string }> = [];
  for (const [title, art] of [
    ["Blaudrache · Holografische Karte", "modern-cards"],
    ["Automatikuhr · Edelstahl", "modern-watch"],
    ["Münzpaar · Erinnerungsstücke", "coins"],
    ["Briefmarken · Historische Motive", "stamps"],
  ] as const) {
    const value = await post("/api/v1/items", {
      collectionId: firstCollection.id,
      title,
      quantity: 1,
    });
    items.push(value.item);
    const upload = await page.request.post("/api/v1/media/images", {
      headers: { origin, "content-type": "image/webp", "x-file-name": `${art}.webp` },
      data: await readFile(resolve(`apps/web/public/art/${art}.webp`)),
    });
    expect(upload.status(), await upload.text()).toBe(201);
    const asset = (await upload.json()).asset;
    await post(`/api/v1/items/${value.item.id}/media`, { assetId: asset.id, purpose: "GALLERY" });
  }
  for (const item of items) {
    await expect
      .poll(
        async () => {
          const r = await page.request.get(`/api/v1/items/${item.id}/media`);
          return (await r.json()).images[0]?.asset.status;
        },
        { timeout: 45_000 },
      )
      .toBe("READY");
  }

  const firstItem = items[0];
  if (!firstItem) throw new Error("Fixture item missing");
  for (const [name, path] of [
    ["sammlungen", "/de/collections"],
    ["sammlung", `/de/collections/${firstCollection.id}`],
    ["dashboard", "/de/dashboard"],
    ["suche", "/de/search"],
    ["stueck", `/de/items/${firstItem.id}`],
    ["profil", "/de/account/profile"],
    ["community", "/de/community"],
  ] as const) {
    await page.goto(path);
    await expect(page.locator(".workspace-layout")).toBeVisible();
    if (name === "dashboard")
      await expect(page.getByTestId("dashboard-selection-rows")).toHaveText("4", {
        timeout: 30_000,
      });
    if (name === "sammlung" || name === "suche") {
      const cards = page.locator(
        name === "sammlung" ? ".item-card-grid > li" : ".search-results > li",
      );
      await expect(cards).toHaveCount(4);
      for (const card of await cards.all()) {
        await card.scrollIntoViewIfNeeded();
        await expect
          .poll(
            () =>
              card
                .locator(".item-card-cover")
                .evaluateAll(
                  (images) =>
                    images.length === 1 &&
                    images.every(
                      (image) =>
                        (image as HTMLImageElement).complete &&
                        (image as HTMLImageElement).naturalWidth > 0,
                    ),
                ),
            { timeout: 20_000 },
          )
          .toBe(true);
      }
    }
    if (name === "sammlung" || name === "suche")
      await expect(page.locator(".item-card-cover")).toHaveCount(4, { timeout: 20_000 });
    if (name === "sammlung" || name === "suche") {
      await expect
        .poll(
          () =>
            page
              .locator(".item-card-cover")
              .evaluateAll((images) =>
                images.every(
                  (image) =>
                    (image as HTMLImageElement).complete &&
                    (image as HTMLImageElement).naturalWidth > 0,
                ),
              ),
          { timeout: 20_000 },
        )
        .toBe(true);
    }
    await page.getByRole("heading", { level: 1 }).scrollIntoViewIfNeeded();
    await noOverflow(page);
    await page.screenshot({
      path: resolve(folder, `${info.project.name}-${name}-overview.png`),
      fullPage: false,
    });
    await page.screenshot({
      path: resolve(folder, `${info.project.name}-${name}.png`),
      fullPage: true,
    });
  }
  if (info.project.name.includes("mobile")) {
    await page.locator(".workspace-mobile-menu > summary").click();
    const menu = page.locator(".workspace-mobile-menu");
    await expect(menu.getByRole("link", { name: "Meine Sammlungen", exact: true })).toBeVisible();
    await menu.getByRole("link", { name: "Meine Sammlungen", exact: true }).click();
    await expect(page).toHaveURL(/\/de\/collections$/);
    await expect(menu).not.toHaveAttribute("open", "");
    await page.goto("/de/search");
    if (info.project.name.includes("mobile"))
      await page.getByRole("button", { name: "Filter öffnen", exact: true }).click();
    await page.getByLabel("Suchtext", { exact: true }).fill("Ungespeicherter Entwurf");
    if (info.project.name.includes("mobile"))
      await page.getByRole("button", { name: "Filter schließen", exact: true }).click();
    await menu.locator("summary").click();
    await menu.getByRole("link", { name: "Meine Sammlungen", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Änderungen verwerfen", exact: true })
      .click();
    await expect(page).toHaveURL(/\/de\/collections$/);
    await expect(menu).not.toHaveAttribute("open", "");
  }
  if (info.project.name === "collector-desktop") {
    await db.collectibleItem.createMany({
      data: Array.from({ length: 60 }, (_, index) => ({
        ownerId: id,
        collectionId: firstCollection.id,
        title: `Off-screen fixture ${index}`,
      })),
    });
    const metadataRequests = new Set<string>();
    const observeRequest = (request: import("@playwright/test").Request) => {
      if (/\/api\/v1\/items\/[^/]+\/media$/.test(request.url()))
        metadataRequests.add(request.url());
    };
    page.on("request", observeRequest);
    await page.goto(`/de/collections/${firstCollection.id}`);
    await expect(page.locator(".item-card-grid > li")).toHaveCount(64);
    await page.waitForLoadState("networkidle");
    expect(
      metadataRequests.size,
      "Off-screen cards must not immediately fetch every media listing",
    ).toBeLessThan(32);
    page.off("request", observeRequest);
  }
  await page.setViewportSize({ width: 320, height: 800 });
  await noOverflow(page);
});
