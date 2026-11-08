# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: import-report.spec.ts >> real import, export and private report flow >> en: insurance and explicit-field PDF stay private and real CSV/XLSX downloads work
- Location: e2e/import-report.spec.ts:242:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('link', { name: 'Download PDF', exact: true })
Expected: visible
Timeout: 30000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('link', { name: 'Download PDF', exact: true }) with timeout 30000ms
  - waiting for getByRole('link', { name: 'Download PDF', exact: true })

```

```yaml
- link "Home":
  - /url: "#main-content"
- banner:
  - link "Home":
    - /url: /en
    - strong: Sammlerraum
    - text: Preserving collections together
  - navigation "Language":
    - link "Deutsch":
      - /url: /de
    - link "English":
      - /url: /en
- main:
  - navigation:
    - link "Collections":
      - /url: /en/collections
    - link "Imports":
      - /url: /en/imports
    - link "Insurance and PDF":
      - /url: /en/insurance
  - heading "Exports and reports" [level=1]
  - paragraph: Files remain private and are available for 24 hours. Their content reflects the captured state at generation time.
  - group "Create a new tabular export":
    - text: Create a new tabular export Scope
    - combobox "Scope":
      - option "All inventory" [selected]
      - option "One collection"
    - text: File format
    - combobox "File format":
      - option "CSV" [selected]
      - option "XLSX"
    - checkbox "Include private notes"
    - text: Include private notes
    - checkbox "Include storage locations"
    - text: Include storage locations
    - button "Create export"
  - region "Export history":
    - heading "Export history" [level=2]
    - button "Refresh status"
    - article:
      - heading "PDF · Ready" [level=3]
      - paragraph: 07/11/2026, 03:38:34 · Available until 08/11/2026, 03:38:34
      - link "PDF download":
        - /url: /api/v1/exports/download?kind=REPORT&id=67ec498f-57bb-4c6b-906b-fac74a356e87
    - button "Older entries" [disabled]
- contentinfo:
  - paragraph: Sammlerraum – a quiet place for remarkable things.
- alert
```

# Test source

```ts
  258 |               accountId: userId,
  259 |               providerId: "credential",
  260 |               password: await hashPassword(password),
  261 |             },
  262 |           },
  263 |         },
  264 |       });
  265 |       try {
  266 |         await db.rateLimit.deleteMany();
  267 |         await page.goto(`/${locale}/login`);
  268 |         await page.getByLabel(label("E-Mail-Adresse")).fill(email);
  269 |         await page.getByLabel(label("Passwort"), { exact: true }).fill(password);
  270 |         const login = page.waitForResponse(
  271 |           (r) => r.url().endsWith("/api/auth/sign-in/email") && r.request().method() === "POST",
  272 |         );
  273 |         await page.getByRole("button", { name: label("Anmelden"), exact: true }).click();
  274 |         expect((await login).status()).toBe(200);
  275 |         await expect(page).toHaveURL(new RegExp(`/${locale}/account/profile$`, "u"));
  276 |         const collection = await db.collection.create({
  277 |           data: { ownerId: userId, name: "Report Browser Collection" },
  278 |         });
  279 |         const reportItem = await db.collectibleItem.create({
  280 |           data: {
  281 |             ownerId: userId,
  282 |             collectionId: collection.id,
  283 |             title: "Browser report item",
  284 |             privateNotes: "Private note must stay out",
  285 |           },
  286 |         });
  287 |         const { PDFDocument } = createRequire(
  288 |             new URL("../../worker/package.json", import.meta.url),
  289 |           )("pdf-lib"),
  290 |           proof = await PDFDocument.create();
  291 |         proof.addPage().drawText("Private browser proof");
  292 |         const proofBytes = await proof.save(),
  293 |           proofId = randomUUID(),
  294 |           proofKey = `originals/${proofId}`;
  295 |         const proofLock = createMediaAssetLocker(url),
  296 |           proofStorage = new LocalPersistentStorage(process.env.UPLOADS_DIR!, proofLock);
  297 |         await proofStorage.put(proofKey, proofBytes);
  298 |         await db.$executeRaw`INSERT INTO "MediaAsset" (id,"ownerId",kind,status,"storageKey","mimeType","byteSize","checksumSha256","originalFileName","updatedAt") VALUES (${proofId}::uuid,${userId},'DOCUMENT','READY',${proofKey},'application/pdf',${BigInt(proofBytes.length)},${createHash("sha256").update(proofBytes).digest("hex")},'Browser proof.pdf',now())`;
  299 |         await db.$executeRaw`INSERT INTO "DocumentLink" (id,"ownerId","itemId","assetId",position,visibility) VALUES (${randomUUID()}::uuid,${userId},${reportItem.id}::uuid,${proofId}::uuid,0,'PRIVATE')`;
  300 |         await page.goto(`/${locale}/insurance`);
  301 |         await expect(
  302 |           page.getByRole("heading", { name: label("Versicherung und Berichte"), exact: true }),
  303 |         ).toBeVisible();
  304 |         await page.getByLabel(label("Sammlung"), { exact: true }).selectOption(collection.id);
  305 |         await page
  306 |           .getByRole("button", { name: label("Versicherungsdaten laden"), exact: true })
  307 |           .click();
  308 |         await page
  309 |           .getByLabel(label("Versicherungswert"), { exact: true })
  310 |           .fill(locale === "de" ? "1.234,56" : "1,234.56");
  311 |         await page.getByLabel(label("Bewertungsdatum"), { exact: true }).fill("2026-01-01");
  312 |         await page
  313 |           .getByLabel(label("Police / Vertragsnummer"), { exact: true })
  314 |           .fill("Browser private policy");
  315 |         await page
  316 |           .getByRole("button", { name: label("Versicherungsdaten speichern"), exact: true })
  317 |           .click();
  318 |         await expect(
  319 |           page.getByText(label("Versicherung gespeichert"), { exact: true }),
  320 |         ).toBeVisible();
  321 |         expect(
  322 |           await db.$queryRaw`SELECT "amountMinor"::text AS amount FROM "InsuranceRecord" WHERE "ownerId"=${userId}`,
  323 |         ).toEqual([{ amount: "123456" }]);
  324 |         for (const fieldLabel of [
  325 |           label("Bilder"),
  326 |           label("Kaufwerte"),
  327 |           label("Kennungen"),
  328 |           label("Private Notizen"),
  329 |           label("Lagerorte"),
  330 |           label("Versicherungsdaten"),
  331 |           label("Police / Vertragsnummern"),
  332 |           label("Belege"),
  333 |         ])
  334 |           await expect(
  335 |             page.getByRole("checkbox", { name: fieldLabel, exact: true }),
  336 |           ).not.toBeChecked();
  337 |         await page
  338 |           .getByRole("checkbox", { name: label("Versicherungsdaten"), exact: true })
  339 |           .check();
  340 |         await page.getByRole("checkbox", { name: label("Belege"), exact: true }).check();
  341 |         await expect(
  342 |           page.getByRole("button", { name: label("Belege laden"), exact: true }),
  343 |         ).toBeVisible();
  344 |         await page.getByRole("button", { name: label("Belege laden"), exact: true }).click();
  345 |         await page.getByRole("checkbox", { name: /Browser proof\.pdf/u }).check();
  346 | 
  347 |         await captureTransferView(page, testInfo, "insurance");
  348 |         await page
  349 |           .getByRole("button", { name: label("PDF-Bericht erstellen"), exact: true })
  350 |           .click();
  351 |         await expect(page.getByText(label("Bericht beauftragt"), { exact: true })).toBeVisible();
  352 |         await page.goto(`/${locale}/exports`);
  353 |         await expect(
  354 |           page.getByRole("heading", { name: label("Exporte und Berichte"), exact: true }),
  355 |         ).toBeVisible();
  356 |         await expect(
  357 |           page.getByRole("link", { name: label("PDF herunterladen"), exact: true }),
> 358 |         ).toBeVisible({
      |           ^ Error: expect(locator).toBeVisible() failed
  359 |           timeout: 30000,
  360 |         });
  361 |         await captureTransferView(page, testInfo, "exports");
  362 |         const pdfDownload = page.waitForEvent("download");
  363 |         await page.getByRole("link", { name: label("PDF herunterladen"), exact: true }).click();
  364 |         const pdf = await pdfDownload;
  365 |         expect((await readFile((await pdf.path())!)).subarray(0, 5).toString()).toBe("%PDF-");
  366 |         const [report] = await db.$queryRaw<
  367 |           { request: { include: string[] }; sourceJson: string }[]
  368 |         >`SELECT request,"sourceJson" FROM "ReportJob" WHERE "ownerId"=${userId}`;
  369 |         expect(report!.request.include).toEqual(["insurance", "proofs"]);
  370 |         expect(report!.sourceJson).toContain(proofId);
  371 |         expect(report!.sourceJson).not.toContain("Browser private policy");
  372 |         expect(report!.sourceJson).not.toContain("Private note must stay out");
  373 |         await page.getByLabel(label("Umfang"), { exact: true }).selectOption("COLLECTION");
  374 |         await page.getByLabel(label("Sammlung"), { exact: true }).selectOption(collection.id);
  375 |         for (const format of ["CSV", "XLSX"]) {
  376 |           await page.getByLabel(label("Dateiformat"), { exact: true }).selectOption(format);
  377 |           await page.getByRole("button", { name: label("Export erstellen"), exact: true }).click();
  378 |           await expect(
  379 |             page.getByRole("link", {
  380 |               name: locale === "de" ? `${format} herunterladen` : `Download ${format}`,
  381 |               exact: true,
  382 |             }),
  383 |           ).toBeVisible({ timeout: 30000 });
  384 |           const completed = page.waitForEvent("download");
  385 |           await page
  386 |             .getByRole("link", {
  387 |               name: locale === "de" ? `${format} herunterladen` : `Download ${format}`,
  388 |               exact: true,
  389 |             })
  390 |             .click();
  391 |           const download = await completed,
  392 |             bytes = await readFile((await download.path())!);
  393 |           if (format === "CSV") {
  394 |             expect(bytes.subarray(0, 3)).toEqual(Buffer.from([239, 187, 191]));
  395 |             expect(bytes.toString()).toContain("Browser report item");
  396 |             expect(bytes.toString()).not.toContain("Private note must stay out");
  397 |           } else expect(bytes.subarray(0, 2).toString()).toBe("PK");
  398 |         }
  399 |       } finally {
  400 |         const lock = createMediaAssetLocker(url),
  401 |           storage = new LocalPersistentStorage(process.env.UPLOADS_DIR!, lock),
  402 |           assets = await db.mediaAsset.findMany({
  403 |             where: { ownerId: userId },
  404 |             select: { id: true, storageKey: true },
  405 |           });
  406 |         for (const asset of assets)
  407 |           await lock(asset.id, () => storage.delete(asset.storageKey), true);
  408 |         await db.documentLink.deleteMany({ where: { ownerId: userId } });
  409 |         await db.mediaAsset.deleteMany({ where: { ownerId: userId } });
  410 |         await db.user.deleteMany({ where: { id: userId } });
  411 |       }
  412 |     });
  413 |   }
  414 |   test("own import history opens a job and cancellation leaves inventory untouched", async ({
  415 |     page,
  416 |   }) => {
  417 |     const userId = randomUUID(),
  418 |       email = `cancel-browser-${userId}@example.test`,
  419 |       password = "correct-horse-battery-staple";
  420 |     let knownJobId: string | null = null;
  421 |     await db.user.create({
  422 |       data: {
  423 |         id: userId,
  424 |         name: "Cancel browser collector",
  425 |         email,
  426 |         emailVerified: true,
  427 |         accounts: {
  428 |           create: {
  429 |             id: randomUUID(),
  430 |             accountId: userId,
  431 |             providerId: "credential",
  432 |             password: await hashPassword(password),
  433 |           },
  434 |         },
  435 |       },
  436 |     });
  437 |     try {
  438 |       await db.rateLimit.deleteMany();
  439 |       await page.goto("/de/login");
  440 |       await page.getByLabel("E-Mail-Adresse").fill(email);
  441 |       await page.getByLabel("Passwort", { exact: true }).fill(password);
  442 |       const login = page.waitForResponse(
  443 |         (r) => r.url().endsWith("/api/auth/sign-in/email") && r.request().method() === "POST",
  444 |       );
  445 |       await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  446 |       expect((await login).status()).toBe(200);
  447 |       await expect(page).toHaveURL(/\/de\/account\/profile$/u);
  448 |       const collection = await db.collection.create({
  449 |         data: { ownerId: userId, name: "Cancel Browser Collection" },
  450 |       });
  451 |       await page.goto("/de/imports");
  452 |       await page.getByLabel("Zielsammlung", { exact: true }).selectOption(collection.id);
  453 |       await page.getByLabel("Datei auswählen", { exact: true }).setInputFiles({
  454 |         name: "cancel-source.csv",
  455 |         mimeType: "text/csv",
  456 |         buffer: Buffer.from("Title\nDo not import\n"),
  457 |       });
  458 |       await page.getByRole("button", { name: "Datei hochladen", exact: true }).click();
```