import { randomUUID } from "node:crypto";
import { it, expect } from "vitest";
import {
  buildReportModel,
  parseInsuranceReportOptions,
} from "../../../../packages/domain/src/reports/report-schema";
import { buildInsuranceReport } from "./build-insurance-report";
import { buildMoneyExportSnapshot } from "@sammlerraum/domain/money/money-transfer";
function source() {
  const itemId = randomUUID();
  return {
    schemaVersion: 1,
    ownerId: "synthetic-report-owner",
    request: {
      scope: { kind: "ALL" },
      format: "CSV",
      locale: "de",
      money: { measure: "PURCHASE", mode: "RAW" },
      includePrivateNotes: true,
      includeLocations: true,
    },
    money: buildMoneyExportSnapshot(
      {
        asOf: "2026-11-06T21:00:00.000Z",
        items: [{ itemId, title: "Owned report - Größe ÄÖÜ", quantity: "2" }],
        requestedPaths: ['{"family":"PURCHASE"}'],
        options: { measure: "PURCHASE", mode: "RAW" },
        totals: null,
      },
      [{ itemId, requestedPath: '{"family":"PURCHASE"}', view: null }],
      () => {},
    ),
    metadata: [
      {
        itemId,
        collectionId: randomUUID(),
        nodeId: null,
        acquisitionType: "OTHER",
        visibility: "PRIVATE",
        tradeStatus: "NOT_FOR_TRADE",
        publicDescription: null,
        archivedAt: null,
        disposedAt: null,
        categoryTemplateId: null,
        conditionOptionId: null,
        catalogEntryId: null,
        catalogVariantId: null,
        acquisitionDate: null,
        identifiers: [],
        privateNotes: "DO NOT DEFAULT EXPORT",
        location: { id: randomUUID(), name: "SECRET SHELF" },
      },
    ],
  };
}
it("excludes every sensitive report field unless explicitly selected", () => {
  const model = buildReportModel(source(), {
    scope: { kind: "ALL" },
    locale: "de",
    include: ["images", "values"],
  });
  expect(model.items[0]).not.toHaveProperty("privateNotes");
  expect(model.items[0]).not.toHaveProperty("storageLocation");
  expect(model.items[0]).not.toHaveProperty("insurance");
  expect(model).not.toHaveProperty("policyReference");
  expect(JSON.stringify(model)).not.toContain("SECRET SHELF");
  expect(JSON.stringify(model)).not.toContain("DO NOT DEFAULT EXPORT");
});
it("accepts explicit note/location selection while preserving as-of and canonical item values", () => {
  const model = buildReportModel(source(), {
    scope: { kind: "ALL" },
    locale: "en",
    include: ["privateNotes", "storageLocations"],
  });
  expect(model.reportAsOf).toBe("2026-11-06T21:00:00.000Z");
  expect(model.items[0]).toMatchObject({
    quantity: "2",
    privateNotes: "DO NOT DEFAULT EXPORT",
    storageLocation: { name: "SECRET SHELF" },
  });
  expect(model.items[0]).not.toHaveProperty("values");
});
it("rejects hidden paths, owner overrides and implicitly selected private proofs", () => {
  expect(() =>
    parseInsuranceReportOptions({ scope: { kind: "ALL" }, locale: "en", storageKey: "foreign" }),
  ).toThrow();
  expect(() =>
    parseInsuranceReportOptions({
      scope: { kind: "ALL" },
      locale: "en",
      proofAssetIds: [randomUUID()],
    }),
  ).toThrow();
  expect(() =>
    parseInsuranceReportOptions({
      scope: { kind: "ALL" },
      locale: "en",
      include: ["policyReferences"],
    }),
  ).toThrow();
});
it("creates a complete readable A4 PDF from the explicitly selected model", async () => {
  const model = buildReportModel(source(), { scope: { kind: "ALL" }, locale: "de" });
  const output = await buildInsuranceReport(model, {
    read: async () => {
      throw new Error("No image/proof was selected");
    },
  });
  expect(new TextDecoder().decode(output.bytes.subarray(0, 5))).toBe("%PDF-");
  expect(output.mimeType).toBe("application/pdf");
  expect(output.bytes.length).toBeGreaterThan(1000);
});

it("renders a real multipage Unicode/image preview and verifies it with independent PDF tools", async () => {
  const { createHash } = await import("node:crypto"),
    { mkdir, writeFile } = await import("node:fs/promises"),
    { resolve } = await import("node:path"),
    { promisify } = await import("node:util"),
    { execFile } = await import("node:child_process"),
    sharp = (await import("sharp")).default;
  const original = source(),
    raw = {
      ...original,
      money: {
        ...original.money,
        rows: original.money.rows.map((row) => ({ ...row, title: row.title + " 🦊" })),
      },
    };
  raw.metadata[0]!.privateNotes = "Ausgewählte Notiz mit Größe und Zeilenumbruch.\n".repeat(100);
  const image = await sharp({
      create: { width: 100, height: 64, channels: 3, background: "#1b7977" },
    })
      .png()
      .toBuffer(),
    itemId = raw.money.rows[0]!.itemId;
  const asset = {
    assetId: randomUUID(),
    itemId,
    storageKey: "private-fixture/image.png",
    mimeType: "image/png" as const,
    byteSize: String(image.length),
    checksumSha256: createHash("sha256").update(image).digest("hex"),
    fileName: "Synthetic inventory image.png",
  };
  const model = buildReportModel(
    raw,
    { scope: { kind: "ALL" }, locale: "de", include: ["images", "privateNotes", "values"] },
    { images: new Map([[itemId, [asset]]]) },
  );
  const output = await buildInsuranceReport(model, {
    read: async (key, limits) => {
      expect(key).toBe(asset.storageKey);
      expect(limits?.maxBytes).toBe(image.length);
      return image;
    },
  });
  const folder = resolve(".superpowers/sdd/2026-09-19-08-import-export-insurance-reports/reports");
  await mkdir(folder, { recursive: true });
  const path = resolve(folder, "task-6-preview.pdf");
  await writeFile(path, output.bytes);
  const { stdout } = await promisify(execFile)("pdfinfo", [path]);
  expect(stdout).toMatch(/Pages:\s+[2-9]/u);
  expect(stdout).toMatch(/Page size:\s+595/u);
  const extracted = process.env.PDF_QA_PYTHON
    ? await promisify(execFile)(process.env.PDF_QA_PYTHON, [
        "-c",
        'from pypdf import PdfReader; import sys; print(\"\\n\".join(p.extract_text() for p in PdfReader(sys.argv[1]).pages))',
        path,
      ])
    : await promisify(execFile)("pdftotext", [path, "-"]);
  expect(extracted.stdout).toContain("Größe ÄÖÜ");
  expect(extracted.stdout).toContain("Ausgewählte Notiz");
  await promisify(execFile)("pdftoppm", [
    "-f",
    "1",
    "-l",
    "1",
    "-scale-to",
    "1400",
    "-png",
    path,
    resolve(folder, "task-6-preview"),
  ]);
  const raster = await sharp(resolve(folder, "task-6-preview-1.png"))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let ink = 0;
  for (let y = 10; y < 140; y++)
    for (let x = 50; x < raster.info.width - 40; x++) {
      const pos = (y * raster.info.width + x) * raster.info.channels;
      if (Math.max(...raster.data.subarray(pos, pos + 3)) < 160) ink++;
    }
  expect(ink).toBeGreaterThan(1000);
});
it("refuses wrong selected asset bytes and over-budget PDFs without returning a partial document", async () => {
  const raw = source(),
    itemId = raw.money.rows[0]!.itemId;
  const asset = {
    assetId: randomUUID(),
    itemId,
    storageKey: "private/selected.png",
    mimeType: "image/png" as const,
    byteSize: "3",
    checksumSha256: "0".repeat(64),
    fileName: "Selected.png",
  };
  const model = buildReportModel(
    raw,
    { scope: { kind: "ALL" }, locale: "en", include: ["images"] },
    { images: new Map([[itemId, [asset]]]) },
  );
  await expect(
    buildInsuranceReport(model, { read: async () => Uint8Array.from([1, 2, 3]) }),
  ).rejects.toMatchObject({ code: "REPORT_INTEGRITY" });
  await expect(
    buildInsuranceReport(
      buildReportModel(raw, { scope: { kind: "ALL" }, locale: "en" }),
      {
        read: async () => {
          throw new Error("Unselected");
        },
      },
      { maxBytes: 100 },
    ),
  ).rejects.toMatchObject({ code: "REPORT_LIMIT_EXCEEDED" });
});
