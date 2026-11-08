import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setImmediate as yieldTurn } from "node:timers/promises";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import sharp from "sharp";
import {
  ReportError,
  ReportSnapshotSchema,
  type ReportAsset,
} from "@sammlerraum/contracts/reports";
import type { StorageProvider } from "@sammlerraum/storage";
let fontBytes: Promise<Buffer[]> | undefined;
async function fonts() {
  if (!fontBytes)
    fontBytes = (async () => {
      for (const directory of [
        resolve(process.cwd(), "dist/report-fonts"),
        resolve(process.cwd(), "assets/report-fonts"),
        resolve(process.cwd(), "apps/worker/assets/report-fonts"),
      ]) {
        try {
          return await Promise.all(
            ["NotoSans.ttf", "NotoEmoji.ttf"].map((name) => readFile(resolve(directory, name))),
          );
        } catch (error) {
          if ((error as { code?: string }).code !== "ENOENT") throw error;
        }
      }
      throw new Error("Packaged report fonts missing");
    })();
  return fontBytes;
}
const hex = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
/** Renderer reads only already-authorized, frozen asset manifests. It never fetches URLs. */
export async function buildInsuranceReport(
  input: unknown,
  storage: Pick<StorageProvider, "read">,
  options: { signal?: AbortSignal; maxBytes?: number } = {},
) {
  const parsed = ReportSnapshotSchema.safeParse(input);
  if (!parsed.success) throw new ReportError("REPORT_INTEGRITY");
  const source = parsed.data,
    locale = source.request.locale,
    english = locale === "en",
    max = options.maxBytes ?? 33554432;
  if (!Number.isInteger(max) || max < 1 || max > 33554432) throw new ReportError("REPORT_INVALID");
  const stop = performance.now() + 60000,
    check = () => {
      if (options.signal?.aborted) throw new ReportError("REPORT_NOT_READY");
      if (performance.now() >= stop) throw new ReportError("REPORT_LIMIT_EXCEEDED");
    };
  check();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const embedded = await Promise.all(
    (await fonts()).map((bytes) => pdf.embedFont(bytes, { subset: false })),
  );
  const coverage = embedded.map((font) => new Set(font.getCharacterSet()));
  pdf.setTitle(english ? "Private inventory report" : "Privater Bestandsbericht");
  pdf.setAuthor("Sammlerraum");
  pdf.setCreator("Sammlerraum");
  pdf.setProducer("Sammlerraum");
  pdf.setCreationDate(new Date(source.reportAsOf));
  pdf.setModificationDate(new Date(source.reportAsOf));
  pdf.setLanguage(locale);
  const fontFor = (char: string) => {
    const index = coverage.findIndex((set) => set.has(char.codePointAt(0)!));
    if (index < 0) throw new ReportError("REPORT_UNSUPPORTED_TEXT");
    return embedded[index]!;
  };
  const dark = rgb(0.1, 0.19, 0.24),
    teal = rgb(0.06, 0.38, 0.4),
    muted = rgb(0.35, 0.41, 0.45);
  let page!: PDFPage,
    cursor = 0;
  const width = 511,
    left = 42,
    bottom = 55;
  function drawLine(text: string, x: number, y: number, size: number, color = dark) {
    let start = x,
      segment = "",
      font: PDFFont | undefined;
    for (const char of text) {
      const next = fontFor(char);
      if (font && font !== next) {
        page.drawText(segment, { x: start, y, size, font, color });
        start += font.widthOfTextAtSize(segment, size);
        segment = "";
      }
      font = next;
      segment += char;
    }
    if (font && segment) page.drawText(segment, { x: start, y, size, font, color });
  }
  function nextPage() {
    check();
    if (pdf.getPageCount() >= 500) throw new ReportError("REPORT_LIMIT_EXCEEDED");
    page = pdf.addPage([595.28, 841.89]);
    page.drawRectangle({ x: 0, y: 758, width: 595.28, height: 84, color: rgb(0.94, 0.97, 0.97) });
    drawLine("Sammlerraum", left, 808, 18, teal);
    drawLine(english ? "PRIVATE INVENTORY REPORT" : "PRIVATER BESTANDSBERICHT", left, 786, 10);
    drawLine((english ? "Snapshot: " : "Datenstand: ") + source.reportAsOf, left, 770, 8, muted);
    cursor = 731;
  }
  function ensure(height: number) {
    if (cursor - height < bottom) nextPage();
  }
  function flow(text: string, size = 10, color = dark) {
    const normalized = text.replace(/\r\n?/gu, "\n").replace(/\t/gu, "    ");
    let line = "",
      lineWidth = 0;
    const emit = () => {
      check();
      ensure(size * 1.45);
      drawLine(line, left, cursor, size, color);
      cursor -= size * 1.45;
      line = "";
      lineWidth = 0;
    };
    for (const char of normalized) {
      if (char === "\n") {
        emit();
        continue;
      }
      if (char.charCodeAt(0) < 32) throw new ReportError("REPORT_UNSUPPORTED_TEXT");
      const measured = fontFor(char).widthOfTextAtSize(char, size);
      if (line && lineWidth + measured > width) emit();
      line += char;
      lineWidth += measured;
    }
    emit();
  }
  const label = (de: string, en: string, value: string) =>
    flow((english ? en : de) + ": " + value, 9.5);
  let inputBytes = 0,
    embeddedBytes = 0;
  const cache = new Map<string, Uint8Array>();
  async function bytes(asset: ReportAsset) {
    const key = asset.assetId + ":" + asset.checksumSha256;
    if (cache.has(key)) return cache.get(key)!;
    check();
    const expected = Number(asset.byteSize);
    if (inputBytes + expected > 16777216) throw new ReportError("REPORT_LIMIT_EXCEEDED");
    const data = await storage.read(asset.storageKey, {
      maxBytes: expected,
      ...(options.signal ? { signal: options.signal } : {}),
    });
    check();
    if (data.length !== expected || hex(data) !== asset.checksumSha256)
      throw new ReportError("REPORT_INTEGRITY");
    inputBytes += data.length;
    cache.set(key, data);
    return data;
  }
  const money = (amount: string, exponent: number) => {
    const raw = amount.padStart(exponent + 1, "0");
    return exponent ? raw.slice(0, -exponent) + "." + raw.slice(-exponent) : raw;
  };
  const insurance = (entry: NonNullable<(typeof source.items)[number]["insurance"]>) => {
    if (!entry.value) return;
    const value = entry.value;
    label(
      "Versicherter Wert",
      "Insured value",
      money(value.amountMinor, value.minorUnitExponent) +
        " " +
        value.currency +
        " (" +
        (value.basis === "PER_UNIT"
          ? english
            ? "per unit"
            : "je Stück"
          : english
            ? "collection total"
            : "Sammlung gesamt") +
        ")",
    );
    label("Stichtag", "Valuation date", value.valuationDate);
    if (value.insurer) label("Versicherer", "Insurer", value.insurer);
    if (value.policyReference) label("Policenreferenz", "Policy reference", value.policyReference);
  };
  nextPage();
  flow(english ? "Your documented inventory" : "Dein dokumentierter Bestand", 20, teal);
  cursor -= 8;
  label("Objekte", "Items", String(source.items.length));
  flow(
    english
      ? "Contains only the selected information. Own declarations; not a professional appraisal."
      : "Enthält nur die ausgewählten Angaben. Eigene Bestandsangaben, kein Wertgutachten.",
    9,
    muted,
  );
  cursor -= 16;
  for (const [index, item] of source.items.entries()) {
    check();
    if (index % 10 === 0) await yieldTurn();
    ensure(65);
    page.drawLine({
      start: { x: left, y: cursor + 6 },
      end: { x: left + width, y: cursor + 6 },
      thickness: 0.7,
      color: rgb(0.8, 0.86, 0.87),
    });
    cursor -= 12;
    flow(String(index + 1) + ". " + item.title, 14, teal);
    label("Objekt-ID", "Item ID", item.itemId);
    label("Anzahl", "Quantity", item.quantity);
    for (const asset of item.images ?? []) {
      const original = await bytes(asset);
      check();
      let png: Buffer;
      try {
        png = await sharp(original, { limitInputPixels: 40000000 })
          .rotate()
          .resize({ width: 1000, height: 700, fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();
      } catch {
        throw new ReportError("REPORT_INTEGRITY");
      }
      embeddedBytes += png.length;
      if (embeddedBytes > 16777216) throw new ReportError("REPORT_LIMIT_EXCEEDED");
      const image = await pdf.embedPng(png),
        scale = Math.min(180 / image.width, 120 / image.height);
      ensure(image.height * scale + 12);
      page.drawImage(image, {
        x: left,
        y: cursor - image.height * scale,
        width: image.width * scale,
        height: image.height * scale,
      });
      cursor -= image.height * scale + 12;
    }
    if (item.values) {
      const value = item.values;
      label(
        "Kaufwertstatus",
        "Purchase value status",
        value.interpretation.kind === "MISSING"
          ? english
            ? "Not recorded"
            : "Nicht hinterlegt"
          : value.interpretation.kind === "UNKNOWN"
            ? english
              ? "Raw value without confirmed unit"
              : "Rohwert ohne bestätigte Einheit"
            : english
              ? "Unit information recorded"
              : "Einheitenangabe vorhanden",
      );
      if (value.raw) {
        label(
          "Kaufwert (unveränderter Rohwert)",
          "Purchase (unchanged raw value)",
          value.raw.amountMinor + " " + value.raw.currency,
        );
      }
      if (value.interpretation.kind === "INTERPRETED") {
        label(
          "Bestätigte Dezimalstellen",
          "Confirmed decimal places",
          String(value.interpretation.exponent),
        );
        if (value.interpretation.decimal !== undefined)
          label(
            "Interpretierter Einzelwert",
            "Interpreted unit value",
            value.interpretation.decimal + " " + (value.raw?.currency ?? ""),
          );
      }
    }
    for (const identifier of item.identifiers ?? [])
      label(identifier.type, identifier.type, identifier.value);
    if (item.storageLocation) label("Lagerort", "Storage location", item.storageLocation.name);
    if (item.privateNotes) label("Private Notizen", "Private notes", item.privateNotes);
    if (item.insurance) insurance(item.insurance);
    cursor -= 18;
  }
  for (const entry of source.collectionInsurance ?? []) {
    if (!entry.insurance.value) continue;
    ensure(65);
    flow(
      english ? "Independent collection insurance" : "Eigenständige Sammlungsversicherung",
      13,
      teal,
    );
    label("Sammlungs-ID", "Collection ID", entry.collectionId);
    insurance(entry.insurance);
    cursor -= 12;
  }
  if (source.proofs?.length) {
    ensure(50);
    flow(english ? "Selected evidence attachments" : "Ausgewählte Nachweisanhänge", 13, teal);
    flow(
      english
        ? "The following original files are embedded as PDF attachments."
        : "Die folgenden Originaldateien sind als PDF-Anhänge enthalten.",
      9,
      muted,
    );
    for (const [index, asset] of source.proofs.entries()) {
      const data = await bytes(asset),
        extension =
          asset.mimeType === "application/pdf"
            ? "pdf"
            : asset.mimeType === "image/jpeg"
              ? "jpg"
              : asset.mimeType === "image/png"
                ? "png"
                : "webp",
        name = `proof-${index + 1}.${extension}`;
      await pdf.attach(data, name, {
        mimeType: asset.mimeType,
        description: asset.fileName,
        creationDate: new Date(source.reportAsOf),
        modificationDate: new Date(source.reportAsOf),
      });
      flow(name + " - " + asset.fileName, 9);
    }
  }
  const pages = pdf.getPages();
  for (const [index, p] of pages.entries()) {
    page = p;
    page.drawLine({
      start: { x: left, y: 42 },
      end: { x: left + width, y: 42 },
      thickness: 0.5,
      color: rgb(0.8, 0.86, 0.87),
    });
    drawLine(english ? "PRIVATE - Sammlerraum" : "PRIVAT - Sammlerraum", left, 28, 8, muted);
    drawLine(`${index + 1} / ${pages.length}`, 510, 28, 8, muted);
  }
  check();
  const output = await pdf.save({ objectsPerTick: 50 });
  check();
  if (output.length > max) throw new ReportError("REPORT_LIMIT_EXCEEDED");
  return {
    bytes: output,
    mimeType: "application/pdf",
    fileName: english ? "sammlerraum-inventory.pdf" : "sammlerraum-bestand.pdf",
    checksumSha256: hex(output),
  };
}
