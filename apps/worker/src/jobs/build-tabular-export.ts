import { createHash } from "node:crypto";
import { crc32 } from "node:zlib";
import {
  ExportError,
  EXPORT_MAX_BYTES,
  TabularExportSnapshotSchema,
  type TabularExportSnapshot,
} from "@sammlerraum/contracts/exports";
import { ImportRawRowSchema } from "@sammlerraum/contracts/imports";
type Column = { de: string; en: string };
const columns: Column[] = [
  { de: "Titel", en: "Title" },
  { de: "Anzahl", en: "Quantity" },
  { de: "Kennungstyp", en: "Identifier type" },
  { de: "Kennung", en: "Identifier" },
  { de: "Alle Kennungen (JSON)", en: "All identifiers (JSON)" },
  { de: "Einstand (Rohwert)", en: "Purchase (raw)" },
  { de: "Währung", en: "Currency" },
  { de: "Geldwertstatus", en: "Money status" },
  { de: "Einheitenstatus", en: "Unit eligibility" },
  { de: "Dezimalstellen", en: "Exponent" },
  { de: "Einheitenschlüssel", en: "Unit key" },
  { de: "Interpretierter Einzelpreis", en: "Interpreted unit price" },
  { de: "Erworben am", en: "Acquisition date" },
  { de: "Erwerbsart", en: "Acquisition type" },
  { de: "Beschreibung", en: "Description" },
  { de: "Sichtbarkeit", en: "Visibility" },
  { de: "Handelsstatus", en: "Trade status" },
  { de: "Archiviert am", en: "Archived at" },
  { de: "Abgegeben am", en: "Disposed at" },
  { de: "Objekt-ID", en: "Item ID" },
  { de: "Sammlungs-ID", en: "Collection ID" },
  { de: "Ordner-ID", en: "Folder ID" },
  { de: "Vorlagen-ID", en: "Template ID" },
  { de: "Zustands-ID", en: "Condition ID" },
  { de: "Katalog-ID", en: "Catalog ID" },
  { de: "Varianten-ID", en: "Variant ID" },
  { de: "Datenstand", en: "Snapshot at" },
];
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
function xstring(value: string) {
  return value
    .replace(/_x[0-9A-Fa-f]{4}_/gu, (m) => "_x005F_" + m.slice(1))
    .replace(
      /[\u0000-\u0008\u000B-\u001F\uFFFE\uFFFF]/gu,
      (c) => "_x" + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0") + "_",
    )
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}
function xml(value: string) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + value;
}
function letter(index: number) {
  let value = index + 1,
    result = "";
  while (value) {
    value--;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}
function rows(snapshot: TabularExportSnapshot): string[][] {
  const result: string[][] = [];
  for (const [index, row] of snapshot.money.rows.entries()) {
    const meta = snapshot.metadata[index]!;
    const interpreted = row.interpretation.kind === "INTERPRETED" ? row.interpretation : null;
    const values = [
      row.title,
      row.quantity,
      meta.identifiers[0]?.type ?? "",
      meta.identifiers[0]?.value ?? "",
      JSON.stringify(meta.identifiers),
      row.raw?.amountMinor ?? "",
      row.raw?.currency ?? "",
      row.interpretation.kind,
      interpreted?.eligibility ?? "",
      interpreted ? String(interpreted.exponent) : "",
      interpreted?.unitKey ?? "",
      snapshot.money.mode === "INTERPRETED" && interpreted ? (interpreted.decimal ?? "") : "",
      meta.acquisitionDate ?? "",
      meta.acquisitionType,
      meta.publicDescription ?? "",
      meta.visibility,
      meta.tradeStatus,
      meta.archivedAt ?? "",
      meta.disposedAt ?? "",
      row.itemId,
      meta.collectionId,
      meta.nodeId ?? "",
      meta.categoryTemplateId ?? "",
      meta.conditionOptionId ?? "",
      meta.catalogEntryId ?? "",
      meta.catalogVariantId ?? "",
      snapshot.money.asOf,
    ];
    if (snapshot.request.includePrivateNotes) values.push(meta.privateNotes ?? "");
    if (snapshot.request.includeLocations)
      values.push(meta.location?.name ?? "", meta.location?.id ?? "");
    // Files produced by this profile must remain readable under the same finite
    // decoded cell/row contract. Refuse oversized text; never truncate it.
    if (
      !ImportRawRowSchema.safeParse([...values, "sammlerraum.tabular.v1", "XLSX_LITERAL_V1"])
        .success
    )
      throw new ExportError("EXPORT_LIMIT_EXCEEDED");
    result.push(values);
  }
  return result;
}
function zip(parts: Record<string, string>, maxBytes: number, check: () => void): Uint8Array {
  const local: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(parts)) {
    check();
    const path = Buffer.from(name),
      bytes = Buffer.from(text),
      header = Buffer.alloc(30),
      directory = Buffer.alloc(46),
      checksum = crc32(bytes);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(bytes.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(path.length, 26);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(bytes.length, 20);
    directory.writeUInt32LE(bytes.length, 24);
    directory.writeUInt16LE(path.length, 28);
    directory.writeUInt32LE(offset, 42);
    local.push(header, path, bytes);
    central.push(directory, path);
    offset += header.length + path.length + bytes.length;
    if (offset > maxBytes) throw new ExportError("EXPORT_LIMIT_EXCEEDED");
  }
  const index = Buffer.concat(central),
    end = Buffer.alloc(22);
  if (offset + index.length + end.length > maxBytes) throw new ExportError("EXPORT_LIMIT_EXCEEDED");
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(index.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, index, end]);
}
/** Complete immutable snapshot in; complete bounded artifact out. No file is published here. */
export function buildTabularExport(
  input: unknown,
  options: { maxBytes?: number; signal?: AbortSignal } = {},
) {
  const maxBytes = options.maxBytes ?? EXPORT_MAX_BYTES;
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > EXPORT_MAX_BYTES)
    throw new ExportError("EXPORT_INVALID");
  const stop = performance.now() + 60000,
    check = () => {
      if (options.signal?.aborted) throw new ExportError("EXPORT_NOT_READY");
      if (performance.now() >= stop) throw new ExportError("EXPORT_LIMIT_EXCEEDED");
    };
  check();
  let snapshot: TabularExportSnapshot;
  try {
    snapshot = TabularExportSnapshotSchema.parse(input);
  } catch {
    throw new ExportError("EXPORT_INTEGRITY");
  }
  const locale = snapshot.request.locale,
    headers = columns.map((c) => c[locale]);
  if (snapshot.request.includePrivateNotes)
    headers.push(locale === "de" ? "Private Notizen" : "Private notes");
  if (snapshot.request.includeLocations)
    headers.push(
      locale === "de" ? "Lagerort" : "Storage location",
      locale === "de" ? "Lagerort-ID" : "Storage location ID",
    );
  headers.push("sammlerraum_schema", "text_encoding");
  const data = rows(snapshot);
  let bytes: Uint8Array;
  if (snapshot.request.format === "CSV") {
    const chunks: Buffer[] = [];
    let size = 3;
    const csv = (cells: string[]) =>
      cells.map((c) => '"' + c.replace(/"/gu, '""') + '"').join(",") + "\r\n";
    for (const [index, values] of [headers, ...data].entries()) {
      check();
      const cells =
        index === 0
          ? values
          : [...values.map((v) => "'" + v), "sammlerraum.tabular.v1", "APOSTROPHE_PREFIX_V1"];
      const chunk = Buffer.from(csv(cells));
      size += chunk.length;
      if (size > maxBytes) throw new ExportError("EXPORT_LIMIT_EXCEEDED");
      chunks.push(chunk);
    }
    bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), ...chunks]);
  } else {
    const sheetParts: string[] = [];
    let sheetSize = 0;
    for (const [index, values] of [headers, ...data].entries()) {
      check();
      const cells = index === 0 ? values : [...values, "sammlerraum.tabular.v1", "XLSX_LITERAL_V1"];
      const row =
        `<row r="${index + 1}">` +
        cells
          .map(
            (v, c) =>
              `<c r="${letter(c)}${index + 1}" t="inlineStr"${index === 0 ? ' s="1"' : ""}><is><t xml:space="preserve">${xstring(v)}</t></is></c>`,
          )
          .join("") +
        "</row>";
      sheetSize += Buffer.byteLength(row);
      if (sheetSize > 16 * 1024 * 1024 - 4096) throw new ExportError("EXPORT_LIMIT_EXCEEDED");
      sheetParts.push(row);
    }
    const sheet = xml(
      `<worksheet xmlns="${MAIN}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols><col min="1" max="1" width="36" customWidth="1"/><col min="2" max="${headers.length}" width="24" customWidth="1"/></cols><sheetData>${sheetParts.join("")}</sheetData><autoFilter ref="A1:${letter(headers.length - 1)}${data.length + 1}"/></worksheet>`,
    );
    if (Buffer.byteLength(sheet) > 16 * 1024 * 1024) throw new ExportError("EXPORT_LIMIT_EXCEEDED");
    bytes = zip(
      {
        "[Content_Types].xml": xml(
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
        ),
        "_rels/.rels": xml(
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        ),
        "xl/workbook.xml": xml(
          `<workbook xmlns="${MAIN}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${locale === "de" ? "Sammlung" : "Inventory"}" sheetId="1" r:id="r1"/></sheets></workbook>`,
        ),
        "xl/_rels/workbook.xml.rels": xml(
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
        ),
        "xl/worksheets/sheet1.xml": sheet,
        "xl/styles.xml": xml(
          `<styleSheet xmlns="${MAIN}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF24485A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`,
        ),
      },
      maxBytes,
      check,
    );
  }
  check();
  return {
    bytes,
    mimeType:
      snapshot.request.format === "CSV"
        ? "text/csv"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileName: snapshot.request.format === "CSV" ? "sammlerraum.csv" : "sammlerraum.xlsx",
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
