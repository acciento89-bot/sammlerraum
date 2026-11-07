import { writeFile, readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { randomUUID, createHash } from "node:crypto";
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { createPrismaClient } from "@sammlerraum/db/create-client";
import { LocalPersistentStorage } from "@sammlerraum/storage";
import { createMediaAssetLocker } from "@sammlerraum/db/media-lock";
import { createIdentifierService } from "@sammlerraum/domain/items/identifier-service";
import { hashPassword } from "better-auth/crypto";
async function captureTransferView(page: Page, info: TestInfo, stage: string) {
  // Real built UI with synthetic, owner-scoped fixtures; check narrow layouts before capture.
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  for (const checkbox of await page.locator(".transfer-shell input[type=checkbox]").all()) {
    const box = await checkbox.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(32);
  }
  const directory = new URL(
    "../../../.superpowers/sdd/2026-09-19-08-import-export-insurance-reports/reports/task-7-screenshots/",
    import.meta.url,
  );
  await mkdir(directory, { recursive: true });
  const path = new URL(
    `${info.project.name}-${info.title.startsWith("en:") ? "en" : "de"}-${stage}.png`,
    directory,
  );
  await page.screenshot({ path: decodeURIComponent(path.pathname), fullPage: true });
}
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
  for (const locale of ["de", "en"] as const) {
    const labels: Record<string, string> = {
      "E-Mail-Adresse": "Email address",
      Passwort: "Password",
      Anmelden: "Sign in",
      "Bestand importieren": "Import inventory",
      Zielsammlung: "Target collection",
      "Datei auswählen": "Choose file",
      "Datei hochladen": "Upload file",
      Titelspalte: "Title column",
      Mengenspalte: "Quantity column",
      Kennungsspalte: "Identifier column",
      Kennungstyp: "Identifier type",
      Kaufpreisspalte: "Purchase amount column",
      "Feste Währung": "Fixed currency",
      Währungsquelle: "Currency source",
      Währungsspalte: "Currency column",
      Erwerbsdatumsspalte: "Acquisition date column",
      Profilname: "Profile name",
      "Profil speichern": "Save profile",
      "Zuordnungsprofil laden": "Load mapping profile",
      "Vorschau erstellen": "Build preview",
      Konflikt: "Conflict",
      "Import starten": "Start import",
      "Entscheidung für Zeile 2": "Decision for row 2",
      "Entscheidung für Zeile 1": "Decision for row 1",
      "Entscheidungen speichern": "Save decisions",
      "Import abgeschlossen": "Import complete",
      "Versicherung und Berichte": "Insurance and reports",
      Sammlung: "Collection",
      "Versicherungsdaten laden": "Load insurance data",
      Versicherungswert: "Insurance value",
      Bewertungsdatum: "Valuation date",
      "Police / Vertragsnummer": "Policy reference",
      "Versicherungsdaten speichern": "Save insurance data",
      "Versicherung gespeichert": "Insurance saved",
      Bilder: "Images",
      Kaufwerte: "Purchase values",
      Kennungen: "Identifiers",
      "Private Notizen": "Private notes",
      Lagerorte: "Storage locations",
      Versicherungsdaten: "Insurance data",
      "Police / Vertragsnummern": "Policy references",
      Belege: "Proof documents",
      "Belege laden": "Load proofs",
      "PDF-Bericht erstellen": "Create PDF report",
      "Bericht beauftragt": "Report requested",
      "Exporte und Berichte": "Exports and reports",
      "PDF herunterladen": "PDF download",
      Umfang: "Scope",
      Dateiformat: "File format",
      "Export erstellen": "Create export",
    };
    const label = (value: string) => (locale === "de" ? value : labels[value]!);
    test(`${locale}: import conflict requires an explicit row decision before commit`, async ({
      page,
    }, testInfo) => {
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
        await page.goto(`/${locale}/login`);
        await page.getByLabel(label("E-Mail-Adresse")).fill(email);
        await page.getByLabel(label("Passwort"), { exact: true }).fill(password);
        const login = page.waitForResponse(
          (r) => r.url().endsWith("/api/auth/sign-in/email") && r.request().method() === "POST",
        );
        await page.getByRole("button", { name: label("Anmelden"), exact: true }).click();
        expect((await login).status()).toBe(200);
        await expect(page).toHaveURL(new RegExp(`/${locale}/account/profile$`, "u"));
        const collection = await db.collection.create({
            data: { ownerId: userId, name: "CSV Browser Collection" },
          }),
          item = await db.collectibleItem.create({
            data: { ownerId: userId, collectionId: collection.id, title: "Existing owned item" },
          });
        await createIdentifierService(db, userId).setItemIdentifiers(item.id, [
          { type: "SKU", value: "SKU-1" },
        ]);
        await page.goto(`/${locale}/imports`);
        await expect(
          page.getByRole("heading", { name: label("Bestand importieren") }),
        ).toBeVisible();
        await writeFile(
          "/tmp/sammlerraum-import-browser-dom.txt",
          await page.locator("section.management-shell").ariaSnapshot(),
        );
        await expect(page.getByLabel(label("Zielsammlung"), { exact: true })).toBeVisible({
          timeout: 5000,
        });
        await page.getByLabel(label("Zielsammlung"), { exact: true }).selectOption(collection.id);
        await page.getByLabel(label("Datei auswählen"), { exact: true }).setInputFiles({
          name: "inventory.csv",
          mimeType: "text/csv",
          buffer: Buffer.from(
            "Title,Quantity,Code,Price,Currency,Acquired\nExisting copy,1,SKU-1,12.34,EUR,2026-01-02\nNew item,2,SKU-2,56.78,EUR,2026-01-03\n",
          ),
        });
        await captureTransferView(page, testInfo, "upload");
        await page.getByRole("button", { name: label("Datei hochladen"), exact: true }).click();
        await expect(page.getByLabel(label("Titelspalte"), { exact: true })).toBeVisible({
          timeout: 30000,
        });
        await page.getByLabel(label("Titelspalte"), { exact: true }).selectOption("0");
        await page.getByLabel(label("Mengenspalte"), { exact: true }).selectOption("1");
        await page.getByLabel(label("Kennungsspalte"), { exact: true }).selectOption("2");
        await page.getByLabel(label("Kennungstyp"), { exact: true }).fill("SKU");
        await expect(page.getByLabel(label("Kaufpreisspalte"), { exact: true })).toBeVisible();
        await page.getByLabel(label("Kaufpreisspalte"), { exact: true }).selectOption("3");
        await expect(page.getByLabel(label("Feste Währung"), { exact: true })).toHaveValue("");
        await page.getByLabel(label("Währungsquelle"), { exact: true }).selectOption("COLUMN");
        await page.getByLabel(label("Währungsspalte"), { exact: true }).selectOption("4");
        await page.getByLabel(label("Erwerbsdatumsspalte"), { exact: true }).selectOption("5");

        await page.getByLabel(label("Profilname"), { exact: true }).fill("CSV purchase and dates");
        const profileResponse = page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/v1/imports/profile") &&
            response.request().method() === "POST",
        );
        await page.getByRole("button", { name: label("Profil speichern"), exact: true }).click();
        const profileAck = await profileResponse;
        expect(profileAck.status()).toBe(200);
        const savedProfile = (await profileAck.json()) as { id: string; revision: number };
        await expect(
          page.getByRole("combobox", { name: label("Zuordnungsprofil laden"), exact: true }),
        ).toHaveValue(savedProfile.id);
        await page.getByRole("button", { name: label("Vorschau erstellen"), exact: true }).click();
        await expect(page.getByText(label("Konflikt"), { exact: true }).first()).toBeVisible();
        await captureTransferView(page, testInfo, "preview");
        expect(
          await db.$queryRaw`SELECT "mappingProfileId","mappingProfileRevision" FROM "ImportJob" WHERE "ownerId"=${userId}`,
        ).toEqual([
          { mappingProfileId: savedProfile.id, mappingProfileRevision: savedProfile.revision },
        ]);

        await expect(
          page.getByRole("button", { name: label("Import starten"), exact: true }),
        ).toBeDisabled();
        await page
          .getByLabel(label("Entscheidung für Zeile 2"), { exact: true })
          .selectOption("CREATE");
        await page
          .getByLabel(label("Entscheidung für Zeile 1"), { exact: true })
          .selectOption("MERGE");
        await expect(page.getByRole("checkbox").first()).toBeVisible();
        for (const checkbox of await page.getByRole("checkbox").all())
          await expect(checkbox).not.toBeChecked();
        await expect(
          page.getByRole("button", { name: label("Entscheidungen speichern"), exact: true }),
        ).toBeDisabled();
        await page
          .getByLabel(label("Entscheidung für Zeile 1"), { exact: true })
          .selectOption("CREATE_SEPARATE");
        await page
          .getByLabel(label("Entscheidung für Zeile 2"), { exact: true })
          .selectOption("CREATE");
        await page
          .getByRole("button", { name: label("Entscheidungen speichern"), exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: label("Import starten"), exact: true }),
        ).toBeEnabled();
        await page.getByRole("button", { name: label("Import starten"), exact: true }).click();
        await expect(page.getByText(label("Import abgeschlossen"), { exact: true })).toBeVisible({
          timeout: 30000,
        });
        expect(await db.collectibleItem.count({ where: { ownerId: userId } })).toBe(3);
        expect(
          await db.$queryRaw`SELECT title,"purchaseAmountMinor"::text AS amount,"purchaseCurrency" AS currency,"acquisitionDate"::text AS acquired FROM "CollectibleItem" WHERE "ownerId"=${userId} AND title IN ('Existing copy','New item') ORDER BY title`,
        ).toEqual([
          { title: "Existing copy", amount: "1234", currency: "EUR", acquired: "2026-01-02" },
          { title: "New item", amount: "5678", currency: "EUR", acquired: "2026-01-03" },
        ]);
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
    test(`${locale}: insurance and explicit-field PDF stay private and real CSV/XLSX downloads work`, async ({
      page,
    }, testInfo) => {
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
        await page.goto(`/${locale}/login`);
        await page.getByLabel(label("E-Mail-Adresse")).fill(email);
        await page.getByLabel(label("Passwort"), { exact: true }).fill(password);
        const login = page.waitForResponse(
          (r) => r.url().endsWith("/api/auth/sign-in/email") && r.request().method() === "POST",
        );
        await page.getByRole("button", { name: label("Anmelden"), exact: true }).click();
        expect((await login).status()).toBe(200);
        await expect(page).toHaveURL(new RegExp(`/${locale}/account/profile$`, "u"));
        const collection = await db.collection.create({
          data: { ownerId: userId, name: "Report Browser Collection" },
        });
        const reportItem = await db.collectibleItem.create({
          data: {
            ownerId: userId,
            collectionId: collection.id,
            title: "Browser report item",
            privateNotes: "Private note must stay out",
          },
        });
        const { PDFDocument } = createRequire(
            new URL("../../worker/package.json", import.meta.url),
          )("pdf-lib"),
          proof = await PDFDocument.create();
        proof.addPage().drawText("Private browser proof");
        const proofBytes = await proof.save(),
          proofId = randomUUID(),
          proofKey = `originals/${proofId}`;
        const proofLock = createMediaAssetLocker(url),
          proofStorage = new LocalPersistentStorage(process.env.UPLOADS_DIR!, proofLock);
        await proofStorage.put(proofKey, proofBytes);
        await db.$executeRaw`INSERT INTO "MediaAsset" (id,"ownerId",kind,status,"storageKey","mimeType","byteSize","checksumSha256","originalFileName","updatedAt") VALUES (${proofId}::uuid,${userId},'DOCUMENT','READY',${proofKey},'application/pdf',${BigInt(proofBytes.length)},${createHash("sha256").update(proofBytes).digest("hex")},'Browser proof.pdf',now())`;
        await db.$executeRaw`INSERT INTO "DocumentLink" (id,"ownerId","itemId","assetId",position,visibility) VALUES (${randomUUID()}::uuid,${userId},${reportItem.id}::uuid,${proofId}::uuid,0,'PRIVATE')`;
        await page.goto(`/${locale}/insurance`);
        await expect(
          page.getByRole("heading", { name: label("Versicherung und Berichte"), exact: true }),
        ).toBeVisible();
        await page.getByLabel(label("Sammlung"), { exact: true }).selectOption(collection.id);
        await page
          .getByRole("button", { name: label("Versicherungsdaten laden"), exact: true })
          .click();
        await page
          .getByLabel(label("Versicherungswert"), { exact: true })
          .fill(locale === "de" ? "1.234,56" : "1,234.56");
        await page.getByLabel(label("Bewertungsdatum"), { exact: true }).fill("2026-01-01");
        await page
          .getByLabel(label("Police / Vertragsnummer"), { exact: true })
          .fill("Browser private policy");
        await page
          .getByRole("button", { name: label("Versicherungsdaten speichern"), exact: true })
          .click();
        await expect(
          page.getByText(label("Versicherung gespeichert"), { exact: true }),
        ).toBeVisible();
        expect(
          await db.$queryRaw`SELECT "amountMinor"::text AS amount FROM "InsuranceRecord" WHERE "ownerId"=${userId}`,
        ).toEqual([{ amount: "123456" }]);
        for (const fieldLabel of [
          label("Bilder"),
          label("Kaufwerte"),
          label("Kennungen"),
          label("Private Notizen"),
          label("Lagerorte"),
          label("Versicherungsdaten"),
          label("Police / Vertragsnummern"),
          label("Belege"),
        ])
          await expect(
            page.getByRole("checkbox", { name: fieldLabel, exact: true }),
          ).not.toBeChecked();
        await page
          .getByRole("checkbox", { name: label("Versicherungsdaten"), exact: true })
          .check();
        await page.getByRole("checkbox", { name: label("Belege"), exact: true }).check();
        await expect(
          page.getByRole("button", { name: label("Belege laden"), exact: true }),
        ).toBeVisible();
        await page.getByRole("button", { name: label("Belege laden"), exact: true }).click();
        await page.getByRole("checkbox", { name: /Browser proof\.pdf/u }).check();

        await captureTransferView(page, testInfo, "insurance");
        await page
          .getByRole("button", { name: label("PDF-Bericht erstellen"), exact: true })
          .click();
        await expect(page.getByText(label("Bericht beauftragt"), { exact: true })).toBeVisible();
        await page.goto(`/${locale}/exports`);
        await expect(
          page.getByRole("heading", { name: label("Exporte und Berichte"), exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: label("PDF herunterladen"), exact: true }),
        ).toBeVisible({
          timeout: 30000,
        });
        await captureTransferView(page, testInfo, "exports");
        const pdfDownload = page.waitForEvent("download");
        await page.getByRole("link", { name: label("PDF herunterladen"), exact: true }).click();
        const pdf = await pdfDownload;
        expect((await readFile((await pdf.path())!)).subarray(0, 5).toString()).toBe("%PDF-");
        const [report] = await db.$queryRaw<
          { request: { include: string[] }; sourceJson: string }[]
        >`SELECT request,"sourceJson" FROM "ReportJob" WHERE "ownerId"=${userId}`;
        expect(report!.request.include).toEqual(["insurance", "proofs"]);
        expect(report!.sourceJson).toContain(proofId);
        expect(report!.sourceJson).not.toContain("Browser private policy");
        expect(report!.sourceJson).not.toContain("Private note must stay out");
        await page.getByLabel(label("Umfang"), { exact: true }).selectOption("COLLECTION");
        await page.getByLabel(label("Sammlung"), { exact: true }).selectOption(collection.id);
        for (const format of ["CSV", "XLSX"]) {
          await page.getByLabel(label("Dateiformat"), { exact: true }).selectOption(format);
          await page.getByRole("button", { name: label("Export erstellen"), exact: true }).click();
          await expect(
            page.getByRole("link", {
              name: locale === "de" ? `${format} herunterladen` : `${format} download`,
              exact: true,
            }),
          ).toBeVisible({ timeout: 30000 });
          const completed = page.waitForEvent("download");
          await page
            .getByRole("link", {
              name: locale === "de" ? `${format} herunterladen` : `${format} download`,
              exact: true,
            })
            .click();
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
        await db.documentLink.deleteMany({ where: { ownerId: userId } });
        await db.mediaAsset.deleteMany({ where: { ownerId: userId } });
        await db.user.deleteMany({ where: { id: userId } });
      }
    });
  }
  test("own import history opens a job and cancellation leaves inventory untouched", async ({
    page,
  }) => {
    const userId = randomUUID(),
      email = `cancel-browser-${userId}@example.test`,
      password = "correct-horse-battery-staple";
    let knownJobId: string | null = null;
    await db.user.create({
      data: {
        id: userId,
        name: "Cancel browser collector",
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
        data: { ownerId: userId, name: "Cancel Browser Collection" },
      });
      await page.goto("/de/imports");
      await page.getByLabel("Zielsammlung", { exact: true }).selectOption(collection.id);
      await page.getByLabel("Datei auswählen", { exact: true }).setInputFiles({
        name: "cancel-source.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("Title\nDo not import\n"),
      });
      await page.getByRole("button", { name: "Datei hochladen", exact: true }).click();
      await expect(page.getByLabel("Titelspalte", { exact: true })).toBeVisible({ timeout: 30000 });
      knownJobId = new URL(page.url()).pathname.split("/").at(-1)!;
      await page.goto("/en/imports");
      await expect(page.getByRole("link", { name: /cancel-source\.csv/u })).toBeVisible();
      await page.getByRole("link", { name: /cancel-source\.csv/u }).click();
      await expect(page.getByLabel("Title column", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Build preview", exact: true }).click();
      await expect(page.getByText("Ready", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Cancel import", exact: true })).toBeVisible();
      const cancelled = page.waitForResponse(
        (r) => r.url().endsWith("/api/v1/imports/cancel") && r.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Cancel import", exact: true }).click();
      const response = await cancelled;
      expect(response.status()).toBe(200);
      expect((await response.json()).status).toBe("CANCELLED");
      await expect(page.getByText("Import cancelled", { exact: true })).toBeVisible();
      expect(await db.collectibleItem.count({ where: { ownerId: userId } })).toBe(0);
      expect(await db.collection.count({ where: { ownerId: userId } })).toBe(1);
    } finally {
      const rows = await db.$queryRaw<
          { id: string }[]
        >`SELECT id FROM "ImportJob" WHERE "ownerId"=${userId}`,
        ids = new Set(rows.map((row) => row.id));
      if (knownJobId && /^[a-f0-9-]{36}$/u.test(knownJobId)) ids.add(knownJobId);
      const lock = createMediaAssetLocker(url),
        storage = new LocalPersistentStorage(process.env.UPLOADS_DIR!, lock);
      for (const id of ids)
        await lock(`import-source:${id}`, () => storage.delete(`imports/${id}/source`), true);
      await db.user.deleteMany({ where: { id: userId } });
    }
  });
});
