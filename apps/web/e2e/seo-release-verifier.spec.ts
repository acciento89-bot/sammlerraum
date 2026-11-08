import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { searchFixture, cleanupSearchFixture, db, enabled } from "./support/search-fixture";
test.afterAll(async () => {
  await db?.$disconnect();
});
test("read-only release verifier consumes the actual compiled application and owned visibility states", async () => {
  test.skip(
    !enabled || process.env.RUN_SEO_RELEASE_E2E !== "1",
    "Guarded actual compiled SEO release fixture",
  );
  const f = await searchFixture(),
    stamp = randomUUID(),
    root = resolve("../../.superpowers/sdd/2026-09-19-14-seo-search-console"),
    privateDir = resolve(root, "private-runtime"),
    manifestPath = resolve(privateDir, `manifest-${stamp}.json`),
    receiptPath = resolve(root, `task-7-real-app-${stamp}.json`);
  try {
    await db!.userProfile.create({
      data: {
        userId: f.ownerId,
        handle: `release-${f.foreignId}`,
        displayName: "Release operator",
        searchEngineIndexingEnabled: true,
      },
    });
    await db!.userProfile.create({
      data: {
        userId: f.foreignId,
        handle: `release-${f.ownerId}`,
        displayName: "Opted-out release operator",
      },
    });
    await db!.collection.update({
      where: { id: f.collectionId },
      data: { name: "Release sample collection", visibility: "PUBLIC" },
    });
    await db!.collectibleItem.update({
      where: { id: f.itemId },
      data: { title: "Release sample object", visibility: "PUBLIC" },
    });
    const hidden = await db!.collectibleItem.create({
        data: {
          ownerId: f.ownerId,
          collectionId: f.collectionId,
          title: "Owned private release object",
          visibility: "PRIVATE",
        },
      }),
      unlisted = await db!.collectibleItem.create({
        data: {
          ownerId: f.ownerId,
          collectionId: f.collectionId,
          title: "Owned unlisted release object",
          visibility: "UNLISTED",
        },
      });
    const profile = `/de/@release-${f.foreignId}`,
      collection = `${profile}/collection-${f.collectionId}`;
    const manifest = {
      ownedFixture: true,
      optedInProfile: profile,
      optedInCollection: collection,
      optedInItem: `${collection}/items/${f.itemId}`,
      optedOutProfile: `/de/@release-${f.ownerId}`,
      privateItem: `${collection}/items/${hidden.id}`,
      unlistedItem: `${collection}/items/${unlisted.id}`,
      expectedHeadings: {
        optedInProfile: "Release operator",
        optedInCollection: "Release sample collection",
        optedInItem: "Release sample object",
        optedOutProfile: "Opted-out release operator",
      },
    };
    await mkdir(privateDir, { recursive: true, mode: 0o700 });
    await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
    execFileSync(
      "python3",
      [
        resolve("../../scripts/test-seo-release-driver.py"),
        "--fixtures",
        manifestPath,
        "--receipt",
        receiptPath,
      ],
      {
        cwd: resolve("../.."),
        env: process.env,
        timeout: 60000,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const result = JSON.parse(await readFile(receiptPath, "utf8"));
    expect(result.passed).toBe(true);
    expect(result.scope).toContain("compiled local application");
    expect(result.searchConsoleOwnershipProven).toBe(false);
  } finally {
    await unlink(manifestPath).catch(() => {});
    await cleanupSearchFixture(f);
  }
});
