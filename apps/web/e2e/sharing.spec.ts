import { credentialRateLimitFixture } from "./support/credential-rate-limit-fixture";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { randomUUID, randomBytes, createHash, scryptSync } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
import { createPrismaClient } from "@sammlerraum/db/create-client";
const enabled = process.env.RUN_AUTH_E2E === "1",
  url = process.env.DATABASE_URL ?? "";
if (enabled && !new URL(url).pathname.endsWith("_test"))
  throw Error("Owned sharing browser test database required");
for (const locale of ["de", "en"] as const) {
  test(`${locale} shared selection opens through a PIN, downloads only selected fields and blocks revoked access`, async ({
    page,
    context,
  }, testInfo) => {
    test.skip(!enabled, "Owned local authentication fixture only");
    const db = createPrismaClient(url),
      owner = randomUUID(),
      token = randomBytes(32).toString("base64url"),
      salt = randomBytes(16),
      pin = "638251";
    try {
      await db.user.create({
        data: {
          id: owner,
          name: "Owned sharing browser fixture",
          email: `${owner}@example.invalid`,
          emailVerified: true,
        },
      });
      const collection = await db.collection.create({
          data: { ownerId: owner, name: "Selected collection" },
        }),
        item = await db.collectibleItem.create({
          data: {
            ownerId: owner,
            collectionId: collection.id,
            title: locale === "de" ? "Keramik aus dem Atelier" : "Studio ceramics",
            publicDescription:
              locale === "de" ? "Handgefertigte Schale, Edition 12." : "Handmade bowl, edition 12.",
            privateNotes: "never-visible-browser-note",
            purchaseAmountMinor: 999n,
            purchaseCurrency: "EUR",
          },
        });
      if (locale === "en")
        await db.insuranceRecord.create({
          data: {
            ownerId: owner,
            collectionId: collection.id,
            basis: "COLLECTION_TOTAL",
            valuationDate: new Date("2026-11-01T00:00:00Z"),
            amountMinor: 12345n,
            currency: "EUR",
            minorUnitExponent: 2,
            policyReference: "own selected collection policy",
          },
        });
      const share = await db.collectionShare.create({
        data: {
          id: randomUUID(),
          collectionId: collection.id,
          creatorUserId: owner,
          targetKind: locale === "en" ? "COLLECTION" : "ITEM",
          targetId: locale === "en" ? collection.id : item.id,
          tokenHash: createHash("sha256").update(token).digest("hex"),
          permissions: { readOnly: true, export: true, insurance: locale === "en" },
          pinHash: `scrypt$16384$8$1$${salt.toString("hex")}$${scryptSync(pin, salt, 32, { N: 16384, r: 8, p: 1 }).toString("hex")}`,
        },
      });
      await context.addCookies([
        { name: "NEXT_LOCALE", value: locale, url: "http://localhost:3000" },
      ]);
      const response = await page.goto(`/share/${token}`);
      expect(response?.status()).toBe(200);
      expect(response?.headers()["cache-control"]).toContain("no-store");
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: locale === "de" ? "Geteilte Auswahl" : "Shared selection",
        }),
      ).toBeVisible();
      await page.getByLabel("PIN", { exact: true }).fill(pin);
      await page
        .getByRole("button", {
          name: locale === "de" ? "Auswahl öffnen" : "Open selection",
          exact: true,
        })
        .click();
      await expect(page.getByRole("heading", { name: item.title, exact: true })).toBeVisible();
      await expect(page.locator("body")).not.toContainText("never-visible-browser-note");
      await expect(page.locator("body")).not.toContainText("999");
      if (locale === "en") {
        await expect(
          page.getByRole("heading", { name: "Collection insurance", exact: true }),
        ).toBeVisible();
        await expect(page.locator("body")).toContainText("123.45 EUR");
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      const reports = resolve(
        process.cwd(),
        "../../.superpowers/sdd/2026-09-19-09-collaboration-sharing-audit/reports",
      );
      await mkdir(reports, { recursive: true });
      await page.screenshot({
        path: resolve(reports, `task-3-sharing-${locale}-${testInfo.project.name}.png`),
        fullPage: true,
      });
      const downloaded = page.waitForEvent("download");
      await page
        .getByRole("button", {
          name: locale === "de" ? "Auswahl herunterladen" : "Download selection",
          exact: true,
        })
        .click();
      const download = await downloaded;
      const saved = await download.path();
      expect(saved).not.toBeNull();
      const exported = await readFile(saved!, "utf8");
      expect(JSON.parse(exported).items).toHaveLength(1);
      expect(exported).not.toMatch(/never-visible-browser-note|purchase|creatorUserId|tokenHash/);
      expect(download.suggestedFilename()).toMatch(/^shared-.*\.json$/);
      await db.collectionShare.update({
        where: { id: share.id },
        data: { revokedAt: new Date(), revision: { increment: 1 } },
      });
      await page.reload();
      await expect(page.locator(".shared-notice[role=alert]")).toContainText(
        locale === "de" ? "nicht mehr verfügbar" : "no longer available",
      );
      await expect(page.getByRole("heading", { name: item.title, exact: true })).toHaveCount(0);
    } finally {
      await db.user.deleteMany({ where: { id: owner } });
      await db.$disconnect();
    }
  });
}

test("registered recipient uses actual cookie authentication without acquiring membership or edit access", async ({
  playwright,
  page,
  context,
}) => {
  test.skip(!enabled, "Owned local authentication fixture only");
  const db = createPrismaClient(url),
    ids = [randomUUID(), randomUUID()],
    password = "own-sharing-cookie-credential",
    origin = "http://localhost:3000";
  const addresses: Awaited<ReturnType<typeof credentialRateLimitFixture>>[] = [];
  const owner = await playwright.request.newContext({
      baseURL: origin,
      extraHTTPHeaders: { origin },
    }),
    recipient = await playwright.request.newContext({
      baseURL: origin,
      extraHTTPHeaders: { origin },
    });
  try {
    for (const [i, id] of ids.entries()) {
      await db.user.create({
        data: {
          id,
          name: "Owned recipient browser fixture",
          email: `${id}@example.invalid`,
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
      const address = await credentialRateLimitFixture(db);
      addresses.push(address);
      expect(
        (
          await [owner, recipient][i]!.post("/api/auth/sign-in/email", {
            headers: { "x-forwarded-for": address.ip },
            data: { email: `${id}@example.invalid`, password },
          })
        ).status(),
      ).toBe(200);
    }
    const collection = await db.collection.create({
        data: { ownerId: ids[0]!, name: "Registered shared selection" },
      }),
      item = await db.collectibleItem.create({
        data: {
          ownerId: ids[0]!,
          collectionId: collection.id,
          title: "Shared private account fixture",
          privateNotes: "Deliberately selected registered note",
        },
      });
    const created = await owner.post("/api/v1/shares", {
      data: {
        target: { kind: "ITEM", id: item.id },
        recipient: { kind: "USER", userId: ids[1] },
        expectedRevision: 0,
        permissions: { privateNotes: true },
      },
    });
    expect(created.status()).toBe(201);
    const parsed = z
      .object({ share: z.object({ id: z.uuid() }), token: z.string().optional() })
      .parse(await created.json());
    expect(parsed.token).toBeUndefined();
    expect(
      (await owner.post("/api/v1/shares/resolve", { data: { shareId: parsed.share.id } })).status(),
    ).toBe(404);
    await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: origin }]);
    await page.goto(`/share/${parsed.share.id}`);
    await expect(page.locator(".shared-notice[role=alert]")).toContainText("sign in");
    await expect(page.getByRole("heading", { name: item.title, exact: true })).toHaveCount(0);
    await context.addCookies((await recipient.storageState()).cookies);
    await page.reload();
    await expect(page.getByRole("heading", { name: item.title, exact: true })).toBeVisible();
    await expect(page.locator("body")).toContainText("Deliberately selected registered note");
    expect(await db.collectionMember.count({ where: { collectionId: collection.id } })).toBe(0);
    expect(
      (
        await recipient.post("/api/v1/shares", {
          data: {
            target: { kind: "ITEM", id: item.id },
            recipient: { kind: "TOKEN" },
            expectedRevision: 0,
          },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await owner.post(`/api/v1/shares/${parsed.share.id}/revoke`, {
          data: { expectedRevision: 0 },
        })
      ).status(),
    ).toBe(200);
    await page.reload();
    await expect(page.locator(".shared-notice[role=alert]")).toContainText("no longer available");
  } finally {
    await owner.dispose();
    await recipient.dispose();
    await db.user.deleteMany({ where: { id: { in: ids } } });
    for (const address of addresses) await address.cleanup();
    await db.$disconnect();
  }
});
