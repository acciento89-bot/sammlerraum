import { writeFile, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createPrismaClient } from "@sammlerraum/db/create-client";
import { LocalPersistentStorage } from "@sammlerraum/storage";
import { createMediaAssetLocker } from "@sammlerraum/db/media-lock";
import { createIdentifierService } from "@sammlerraum/domain/items/identifier-service";
import { hashPassword } from "better-auth/crypto";
const enabled = process.env.RUN_AUTH_E2E === "1",
  url = process.env.DATABASE_URL ?? "";
if (enabled && (!new URL(url).pathname.endsWith("_test") || process.env.NODE_ENV === "production"))
  throw Error("Guarded browser test database required");
const db = createPrismaClient(url);
test.describe("real import, export and private report flow", () => {
  test.skip(!enabled, "requires actual migrated test database and built server");
  test.afterAll(async () => {
    await db.$disconnect();
  });
  test("import conflict requires an explicit row decision before commit", async ({ page }) => {
    const userId = randomUUID(),
      email = `import-browser-${userId}@example.test`,
      password = "correct-horse-battery-staple";
    await db.user.create({
      data: {
        id: userId,
        name: "Import browser collector",
        email,
        emailVerified: true,
        accounts: {
          create: {
            id: randomUUID(),
            accountId: userId,
            providerId: "credential",
            password: await hashPassword(password),
          },
        },
      },
    });
    try {
      await db.rateLimit.deleteMany();
      await page.goto("/de/login");
      await page.getByLabel("E-Mail-Adresse").fill(email);
      await page.getByLabel("Passwort", { exact: true }).fill(password);
      const login = page.waitForResponse(
        (r) => r.url().endsWith("/api/auth/sign-in/email") && r.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Anmelden", exact: true }).click();
      expect((await login).status()).toBe(200);
      await expect(page).toHaveURL(/\/de\/account\/profile$/u);
      const collection = await db.collection.create({
          data: { ownerId: userId, name: "CSV Browser Collection" },
        }),
        item = await db.collectibleItem.create({
          data: { ownerId: userId, collectionId: collection.id, title: "Existing owned item" },
        });
      await createIdentifierService(db, userId).setItemIdentifiers(item.id, [
        { type: "SKU", value: "SKU-1" },
      ]);
      await page.goto("/de/imports");
      await expect(page.getByRole("heading", { name: "Bestand importieren" })).toBeVisible();
      await writeFile(
        "/tmp/sammlerraum-import-browser-dom.txt",
        await page.locator("section.management-shell").ariaSnapshot(),
      );
      await expect(page.getByLabel("Zielsammlung", { exact: true })).toBeVisible({ timeout: 5000 });
      await page.getByLabel("Zielsammlung", { exact: true }).selectOption(collection.id);
      await page.getByLabel("Datei auswählen", { exact: true }).setInputFiles({
        name: "inventory.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("Title,Quantity,Code\nExisting copy,1,SKU-1\nNew item,2,SKU-2\n"),
      });
      await page.getByRole("button", { name: "Datei hochladen", exact: true }).click();
      await expect(page.getByLabel("Titelspalte", { exact: true })).toBeVisible({ timeout: 30000 });
      await page.getByLabel("Titelspalte", { exact: true }).selectOption("0");
      await page.getByLabel("Mengenspalte", { exact: true }).selectOption("1");
      await page.getByLabel("Kennungsspalte", { exact: true }).selectOption("2");
      await page.getByLabel("Kennungstyp", { exact: true }).fill("SKU");
      await page.getByRole("button", { name: "Vorschau erstellen", exact: true }).click();
      await expect(page.getByText("Konflikt", { exact: true }).first()).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Import starten", exact: true }),
      ).toBeDisabled();
      await page
        .getByLabel("Entscheidung für Zeile 1", { exact: true })
        .selectOption("CREATE_SEPARATE");
      await page.getByLabel("Entscheidung für Zeile 2", { exact: true }).selectOption("CREATE");
      await page.getByRole("button", { name: "Entscheidungen speichern", exact: true }).click();
      await expect(page.getByRole("button", { name: "Import starten", exact: true })).toBeEnabled();
      await page.getByRole("button", { name: "Import starten", exact: true }).click();
      await expect(page.getByText("Import abgeschlossen", { exact: true })).toBeVisible({
        timeout: 30000,
      });
      expect(await db.collectibleItem.count({ where: { ownerId: userId } })).toBe(3);
    } finally {
      const sources = await db.$queryRaw<
        { id: string; sourceStorageKey: string }[]
      >`SELECT id,"sourceStorageKey" FROM "ImportJob" WHERE "ownerId"=${userId}`;
      const lock = createMediaAssetLocker(process.env.DATABASE_URL!);
      const storage = new LocalPersistentStorage(process.env.UPLOADS_DIR!, lock);
      for (const source of sources)
        await lock(
          `import-source:${source.id}`,
          () => storage.delete(source.sourceStorageKey),
          true,
        );
      await db.user.deleteMany({ where: { id: userId } });
    }
  });
  test("insurance and explicit-field PDF stay private and real CSV/XLSX downloads work", async ({
    page,
  }) => {
    test.setTimeout(120000);
    const userId = randomUUID(),
      email = `report-browser-${userId}@example.test`,
      password = "correct-horse-battery-staple";
    await db.user.create({
      data: {
        id: userId,
        name: "Report browser collector",
        email,
        emailVerified: true,
        accounts: {
          create: {
            id: randomUUID(),
            accountId: userId,
            providerId: "credential",
            password: await hashPassword(password),
          },
        },
      },
    });
    try {
      await db.rateLimit.deleteMany();
      await page.goto("/de/login");
      await page.getByLabel("E-Mail-Adresse").fill(email);
      await page.getByLabel("Passwort", { exact: true }).fill(password);
      const login = page.waitForResponse(
        (r) => r.url().endsWith("/api/auth/sign-in/email") && r.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Anmelden", exact: true }).click();
      expect((await login).status()).toBe(200);
      await expect(page).toHaveURL(/\/de\/account\/profile$/u);
      const collection = await db.collection.create({
        data: { ownerId: userId, name: "Report Browser Collection" },
      });
      await db.collectibleItem.create({
        data: {
          ownerId: userId,
          collectionId: collection.id,
          title: "Browser report item",
          privateNotes: "Private note must stay out",
        },
      });
      await page.goto("/de/insurance");
      await expect(
        page.getByRole("heading", { name: "Versicherung und Berichte", exact: true }),
      ).toBeVisible();
      await page.getByLabel("Sammlung", { exact: true }).selectOption(collection.id);
      await page.getByRole("button", { name: "Versicherungsdaten laden", exact: true }).click();
      await page.getByLabel("Versicherungswert", { exact: true }).fill("1.234,56");
      await page.getByLabel("Bewertungsdatum", { exact: true }).fill("2026-01-01");
      await page
        .getByLabel("Police / Vertragsnummer", { exact: true })
        .fill("Browser private policy");
      await page.getByRole("button", { name: "Versicherungsdaten speichern", exact: true }).click();
      await expect(page.getByText("Versicherung gespeichert", { exact: true })).toBeVisible();
      expect(
        await db.$queryRaw`SELECT "amountMinor"::text AS amount FROM "InsuranceRecord" WHERE "ownerId"=${userId}`,
      ).toEqual([{ amount: "123456" }]);
      for (const label of [
        "Bilder",
        "Kaufwerte",
        "Kennungen",
        "Private Notizen",
        "Lagerorte",
        "Versicherungsdaten",
        "Police / Vertragsnummern",
        "Belege",
      ])
        await expect(page.getByRole("checkbox", { name: label, exact: true })).not.toBeChecked();
      await page.getByRole("checkbox", { name: "Versicherungsdaten", exact: true }).check();
      await page.getByRole("button", { name: "PDF-Bericht erstellen", exact: true }).click();
      await expect(page.getByText("Bericht beauftragt", { exact: true })).toBeVisible();
      await page.goto("/de/exports");
      await expect(
        page.getByRole("heading", { name: "Exporte und Berichte", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("link", { name: "PDF herunterladen", exact: true })).toBeVisible({
        timeout: 30000,
      });
      const pdfDownload = page.waitForEvent("download");
      await page.getByRole("link", { name: "PDF herunterladen", exact: true }).click();
      const pdf = await pdfDownload;
      expect((await readFile((await pdf.path())!)).subarray(0, 5).toString()).toBe("%PDF-");
      const [report] = await db.$queryRaw<
        { request: { include: string[] }; sourceJson: string }[]
      >`SELECT request,"sourceJson" FROM "ReportJob" WHERE "ownerId"=${userId}`;
      expect(report!.request.include).toEqual(["insurance"]);
      expect(report!.sourceJson).not.toContain("Browser private policy");
      expect(report!.sourceJson).not.toContain("Private note must stay out");
      await page.getByLabel("Umfang", { exact: true }).selectOption("COLLECTION");
      await page.getByLabel("Sammlung", { exact: true }).selectOption(collection.id);
      for (const format of ["CSV", "XLSX"]) {
        await page.getByLabel("Dateiformat", { exact: true }).selectOption(format);
        await page.getByRole("button", { name: "Export erstellen", exact: true }).click();
        await expect(
          page.getByRole("link", { name: `${format} herunterladen`, exact: true }),
        ).toBeVisible({ timeout: 30000 });
        const completed = page.waitForEvent("download");
        await page.getByRole("link", { name: `${format} herunterladen`, exact: true }).click();
        const download = await completed,
          bytes = await readFile((await download.path())!);
        if (format === "CSV") {
          expect(bytes.subarray(0, 3)).toEqual(Buffer.from([239, 187, 191]));
          expect(bytes.toString()).toContain("Browser report item");
          expect(bytes.toString()).not.toContain("Private note must stay out");
        } else expect(bytes.subarray(0, 2).toString()).toBe("PK");
      }
    } finally {
      const lock = createMediaAssetLocker(url),
        storage = new LocalPersistentStorage(process.env.UPLOADS_DIR!, lock),
        assets = await db.mediaAsset.findMany({
          where: { ownerId: userId },
          select: { id: true, storageKey: true },
        });
      for (const asset of assets)
        await lock(asset.id, () => storage.delete(asset.storageKey), true);
      await db.mediaAsset.deleteMany({ where: { ownerId: userId } });
      await db.user.deleteMany({ where: { id: userId } });
    }
  });
});
