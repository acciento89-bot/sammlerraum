import { expect, it } from "vitest";
import { parseImportSource } from "./parse-import";
async function collect(
  source: Uint8Array,
  options: { format: "CSV"; hasHeader: boolean; delimiter?: string },
  limits: { maxRows?: number; maxBytes?: number } = {},
) {
  const rows = [];
  for await (const row of parseImportSource(source, options, limits)) rows.push(row);
  return rows;
}
it("preserves quoted CSV values and original addresses without numeric coercion", async () => {
  const source = new TextEncoder().encode('Title,Amount\r\n"Fox, 🦊","1,25"\r\n');
  expect(await collect(source, { format: "CSV", hasHeader: true, delimiter: "," })).toEqual([
    { rowNumber: 1, sourceRowNumber: 2, cells: ["Fox, 🦊", "1,25"] },
  ]);
});
it("closes an over-limit source instead of returning a truncated success", async () => {
  const source = new TextEncoder().encode("one\ntwo\nthree\n");
  await expect(
    collect(source, { format: "CSV", hasHeader: false }, { maxRows: 2 }),
  ).rejects.toMatchObject({ code: "IMPORT_ROW_LIMIT_EXCEEDED" });
  await expect(
    collect(source, { format: "CSV", hasHeader: false }, { maxBytes: source.length - 1 }),
  ).rejects.toMatchObject({ code: "IMPORT_SOURCE_TOO_LARGE" });
});
it("keeps formula-looking CSV text inert and exact", async () => {
  const rows = await collect(
    new TextEncoder().encode('"=WEBSERVICE(""https://example.invalid/no-fetch"")"\n'),
    { format: "CSV", hasHeader: false },
  );
  expect(rows[0]?.cells).toEqual(['=WEBSERVICE("https://example.invalid/no-fetch")']);
});

it("reads only stored XLSX formula values and preserves exact numeric lexemes", async () => {
  const { workbookFixture } = await import("./import-xlsx-fixture.test-helper");
  const bytes = workbookFixture(
    '<row r="1"><c r="A1"><f>WEBSERVICE("https://example.invalid/EXECUTED")</f><v>9007199254740993</v></c><c r="B1" t="str"><f>1+1</f><v>cached</v></c><c r="C1"><f>1+1</f></c></row>',
  );
  const rows = [];
  for await (const row of parseImportSource(bytes, { format: "XLSX", hasHeader: false }))
    rows.push(row);
  expect(rows).toEqual([
    { rowNumber: 1, sourceRowNumber: 1, cells: ["9007199254740993", "cached", null] },
  ]);
});
it("rejects an oversized workbook rather than claiming a partial parse", async () => {
  const { workbookFixture } = await import("./import-xlsx-fixture.test-helper");
  const bytes = workbookFixture(
    '<row r="1"><c r="A1"><v>1</v></c></row><row r="2"><c r="A2"><v>2</v></c></row>',
  );
  await expect(
    (async () => {
      for await (const row of parseImportSource(
        bytes,
        { format: "XLSX", hasHeader: false },
        { maxRows: 1 },
      ))
        void row;
    })(),
  ).rejects.toMatchObject({ code: "IMPORT_ROW_LIMIT_EXCEEDED" });
});

it.each([
  [
    "macro content",
    {
      "[Content_Types].xml":
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/></Types>',
    },
  ],
  ["macro binary", { "xl/vbaProject.bin": "not executable" }],
  ["path traversal", { "../escape.xml": "no" }],
  [
    "DTD",
    {
      "xl/worksheets/sheet1.xml":
        '<!DOCTYPE worksheet [<!ENTITY x SYSTEM "file:///no">]><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>',
    },
  ],
  [
    "external relation",
    {
      "xl/_rels/workbook.xml.rels":
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" TargetMode="External" Target="https://example.invalid"/></Relationships>',
    },
  ],
] as const)("rejects unsafe XLSX %s", async (_name, extra) => {
  const { workbookFixture } = await import("./import-xlsx-fixture.test-helper");
  await expect(
    (async () => {
      for await (const row of parseImportSource(
        workbookFixture('<row r="1"><c r="A1"><v>1</v></c></row>', extra),
        { format: "XLSX", hasHeader: false },
      ))
        void row;
    })(),
  ).rejects.toMatchObject({ code: "IMPORT_XLSX_INVALID" });
});
it("preserves shared/inline Unicode strings, sparse addresses and explicit headers", async () => {
  const { workbookFixture } = await import("./import-xlsx-fixture.test-helper");
  const bytes = workbookFixture(
    '<row r="4"><c r="A4" t="inlineStr"><is><t>Title</t></is></c></row><row r="9"><c r="C9" t="s"><v>0</v></c></row>',
    {
      "xl/_rels/workbook.xml.rels":
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="ss" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
      "xl/sharedStrings.xml":
        '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><r><t>Fox </t></r><r><t>🦊</t></r></si></sst>',
    },
  );
  const header: unknown[] = [],
    rows = [];
  for await (const row of parseImportSource(
    bytes,
    { format: "XLSX", hasHeader: true, sheetName: "Inventory" },
    {},
    {
      onHeader: (cells) => {
        header.push(cells);
      },
    },
  ))
    rows.push(row);
  expect(header).toEqual([["Title"]]);
  expect(rows).toEqual([{ rowNumber: 1, sourceRowNumber: 9, cells: [null, null, "Fox 🦊"] }]);
});
it.each([
  '<row r="1"><c r="A1" t="s"><v>99</v></c></row>',
  '<row r="1"><c r="IW1"><v>1</v></c></row>',
  '<row r="1"><c r="A2"><v>1</v></c></row>',
  '<row r="1"/><row r="1"/>',
])("rejects malformed cell or row coordinates %s", async (rows) => {
  const { workbookFixture } = await import("./import-xlsx-fixture.test-helper");
  await expect(
    (async () => {
      for await (const row of parseImportSource(workbookFixture(rows), {
        format: "XLSX",
        hasHeader: false,
      }))
        void row;
    })(),
  ).rejects.toMatchObject({ code: "IMPORT_XLSX_INVALID" });
});
it("rejects invalid UTF-8, oversized cells and cancelled CSV reads", async () => {
  await expect(
    collect(Uint8Array.from([0xff]), { format: "CSV", hasHeader: false }),
  ).rejects.toMatchObject({ code: "IMPORT_ENCODING_INVALID" });
  await expect(
    collect(Buffer.from("🦊".repeat(4097)), { format: "CSV", hasHeader: false }),
  ).rejects.toMatchObject({ code: "IMPORT_ROW_TOO_LARGE" });
  const controller = new AbortController();
  controller.abort();
  await expect(
    (async () => {
      for await (const row of parseImportSource(
        Buffer.from("one"),
        { format: "CSV", hasHeader: false },
        {},
        { signal: controller.signal },
      ))
        void row;
    })(),
  ).rejects.toMatchObject({ code: "IMPORT_PARSE_CANCELLED" });
});

it.each([
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>',
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/><sheetData/></worksheet>',
])(
  "rejects missing or ambiguous worksheet data instead of claiming an empty import",
  async (worksheet) => {
    const { workbookFixture } = await import("./import-xlsx-fixture.test-helper");
    await expect(
      (async () => {
        for await (const row of parseImportSource(
          workbookFixture("", { "xl/worksheets/sheet1.xml": worksheet }),
          { format: "XLSX", hasHeader: false },
        ))
          void row;
      })(),
    ).rejects.toMatchObject({ code: "IMPORT_XLSX_INVALID" });
  },
);

it("decodes SpreadsheetML escaped strings once while retaining literal escape-looking text", async () => {
  const { workbookFixture } = await import("./import-xlsx-fixture.test-helper");
  const bytes = workbookFixture(
    '<row r="1"><c r="A1" t="inlineStr"><is><t>First_x000D_Second _x005F_x0041_</t></is></c></row>',
  );
  const rows = [];
  for await (const row of parseImportSource(bytes, { format: "XLSX", hasHeader: false }))
    rows.push(row);
  expect(rows[0]?.cells).toEqual(["First\rSecond _x0041_"]);
});
it("decodes escaped UTF-16 pairs in shared strings without evaluating anything", async () => {
  const { workbookFixture } = await import("./import-xlsx-fixture.test-helper");
  const bytes = workbookFixture('<row r="1"><c r="A1" t="s"><v>0</v></c></row>', {
    "xl/_rels/workbook.xml.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="ss" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
    "xl/sharedStrings.xml":
      '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Fox _xD83E__xDD8A_</t></si></sst>',
  });
  const rows = [];
  for await (const row of parseImportSource(bytes, { format: "XLSX", hasHeader: false }))
    rows.push(row);
  expect(rows[0]?.cells).toEqual(["Fox 🦊"]);
});

it("preserves the decoded cell boundary after SpreadsheetML transport expansion", async () => {
  const { workbookFixture } = await import("./import-xlsx-fixture.test-helper");
  const allowed = workbookFixture(
    '<row r="1"><c r="A1" t="str"><v>' + "_x000D_".repeat(16384) + "</v></c></row>",
  );
  const rows = [];
  for await (const row of parseImportSource(allowed, { format: "XLSX", hasHeader: false }))
    rows.push(row);
  expect(rows[0]?.cells[0]).toBe("\r".repeat(16384));
  const oversized = workbookFixture(
    '<row r="1"><c r="A1" t="inlineStr"><is><t>' + "_x000D_".repeat(16385) + "</t></is></c></row>",
  );
  await expect(
    (async () => {
      for await (const row of parseImportSource(oversized, { format: "XLSX", hasHeader: false }))
        void row;
    })(),
  ).rejects.toMatchObject({ code: "IMPORT_XLSX_INVALID" });
});
it.each(["_x0000_", "_xD83E_"])(
  "rejects decoded invalid Unicode %s instead of trusting escaped source text",
  async (value) => {
    const { workbookFixture } = await import("./import-xlsx-fixture.test-helper");
    await expect(
      (async () => {
        for await (const row of parseImportSource(
          workbookFixture('<row r="1"><c r="A1" t="str"><v>' + value + "</v></c></row>"),
          { format: "XLSX", hasHeader: false },
        ))
          void row;
      })(),
    ).rejects.toMatchObject({ code: "IMPORT_ROW_TOO_LARGE" });
  },
);
