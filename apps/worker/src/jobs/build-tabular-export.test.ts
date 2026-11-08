import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { buildMoneyExportSnapshot } from "@sammlerraum/domain/money/money-transfer";
import { encodeMoneyFactToken } from "../../../../packages/domain/src/money/legacy-money-tokens";
import { parseExportRequest } from "@sammlerraum/contracts/exports";
import { buildTabularExport } from "./build-tabular-export";
import { parseImportSource } from "./parse-import";
function fixture(format: "CSV" | "XLSX", title = "Literal item") {
  const itemId = randomUUID(),
    generation = randomUUID(),
    raw = { amountMinor: "9007199254740991", currency: "ZZZ" },
    subject = { family: "PURCHASE" as const, itemId };
  const view = {
    schemaVersion: 1 as const,
    subject,
    raw,
    factToken: encodeMoneyFactToken({
      v: 1,
      subject,
      generation,
      sequence: "1",
      raw,
      effectiveEventId: generation,
      originId: null,
      originEvidenceErasedAt: null,
      revocationId: null,
    }),
    interpretation: { kind: "UNKNOWN" as const, reason: "RAW_WRITER" as const },
  };
  const money = buildMoneyExportSnapshot(
    {
      asOf: "2026-11-06T21:00:00.000Z",
      items: [{ itemId, title, quantity: "2" }],
      requestedPaths: ['{"family":"PURCHASE"}'],
      options: { measure: "PURCHASE", mode: "RAW" },
      totals: null,
    },
    [{ itemId, requestedPath: '{"family":"PURCHASE"}', view }],
    () => {},
  );
  return {
    schemaVersion: 1 as const,
    ownerId: "synthetic-export-owner",
    request: parseExportRequest({ scope: { kind: "ALL" }, format, locale: "de" }),
    money,
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
      },
    ],
  };
}
it("writes explicit spreadsheet-safe CSV text encoding without changing generic CSV import", async () => {
  const snapshot = fixture("CSV", "=SUM(1,2)"),
    result = buildTabularExport(snapshot),
    rows = [];
  for await (const row of parseImportSource(result.bytes, { format: "CSV", hasHeader: true }))
    rows.push(row);
  expect(rows[0]?.cells[0]).toBe("'=SUM(1,2)");
  expect(rows[0]?.cells.at(-2)).toBe("sammlerraum.tabular.v1");
  expect(rows[0]?.cells.at(-1)).toBe("APOSTROPHE_PREFIX_V1");
  const decoded = [];
  for await (const row of parseImportSource(result.bytes, {
    format: "CSV",
    hasHeader: true,
    sourceProfile: "SAMMLERRAUM_TABULAR_V1",
  }))
    decoded.push(row);
  expect(decoded[0]?.cells[0]).toBe("=SUM(1,2)");
  expect(decoded[0]?.cells).toContain("9007199254740991");
});
it("writes literal XLSX cells preserving escapes, CR, emoji and exact large raw values", async () => {
  const snapshot = fixture("XLSX", "First\rSecond _x0041_ & 🦊"),
    result = buildTabularExport(snapshot),
    rows = [];
  for await (const row of parseImportSource(result.bytes, { format: "XLSX", hasHeader: true }))
    rows.push(row);
  expect(rows[0]?.cells[0]).toBe("First\rSecond _x0041_ & 🦊");
  expect(rows[0]?.cells).toContain("9007199254740991");
  expect(rows[0]?.cells.at(-1)).toBe("XLSX_LITERAL_V1");
});
it("fails a bounded artifact instead of returning partial output or omitted data", () => {
  expect(() => buildTabularExport(fixture("CSV"), { maxBytes: 100 })).toThrow(
    "EXPORT_LIMIT_EXCEEDED",
  );
});

it("creates a real ZIP-readable workbook with literal cells and no formula elements", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises"),
    { tmpdir } = await import("node:os"),
    { join } = await import("node:path"),
    { promisify } = await import("node:util"),
    { execFile } = await import("node:child_process");
  const root = await mkdtemp(join(tmpdir(), "sammlerraum-tabular-")),
    path = join(root, "owned.xlsx");
  try {
    const result = buildTabularExport(fixture("XLSX", '=WEBSERVICE("https://example.invalid")'));
    await writeFile(path, result.bytes);
    await promisify(execFile)("unzip", ["-t", path]);
    const { stdout } = await promisify(execFile)("unzip", ["-p", path, "xl/worksheets/sheet1.xml"]);
    expect(stdout).not.toMatch(/<f(?:\s|>)/u);
    expect(stdout).toContain('t="inlineStr"');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it.each(["'Literal", "＝SUM(1,2)", "line\nnext", 'tabs\t and "quotes", comma'])(
  "round-trips encoded CSV text exactly for %j",
  async (title) => {
    const result = buildTabularExport(fixture("CSV", title)),
      rows = [];
    for await (const row of parseImportSource(result.bytes, {
      format: "CSV",
      hasHeader: true,
      sourceProfile: "SAMMLERRAUM_TABULAR_V1",
    }))
      rows.push(row);
    expect(rows[0]?.cells[0]).toBe(title);
  },
);
it("refuses malformed encoding metadata rather than guessing a generic strip rule", async () => {
  const result = buildTabularExport(fixture("CSV")),
    text = new TextDecoder()
      .decode(result.bytes)
      .replace("APOSTROPHE_PREFIX_V1", "UNKNOWN_ENCODING");
  await expect(
    (async () => {
      for await (const row of parseImportSource(Buffer.from(text), {
        format: "CSV",
        hasHeader: true,
        sourceProfile: "SAMMLERRAUM_TABULAR_V1",
      }))
        void row;
    })(),
  ).rejects.toMatchObject({ code: "IMPORT_SOURCE_INVALID" });
});

it.each(["CSV", "XLSX"] as const)(
  "refuses an oversized literal %s cell before producing an unreadable file",
  (format) => {
    const source = fixture(format);
    const snapshot = {
      ...source,
      metadata: source.metadata.map((meta) => ({ ...meta, publicDescription: "ä".repeat(9000) })),
    };
    expect(() => buildTabularExport(snapshot)).toThrow("EXPORT_LIMIT_EXCEEDED");
  },
);
