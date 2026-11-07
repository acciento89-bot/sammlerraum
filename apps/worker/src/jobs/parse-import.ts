import { Readable } from "node:stream";
import { parse as csvParse } from "csv-parse";
import { z } from "zod";
import { readXlsx } from "./parse-xlsx";
import {
  ImportParserOptionsSchema,
  IMPORT_MAX_SOURCE_BYTES,
  IMPORT_MAX_SOURCE_ROWS,
  IMPORT_MAX_ROW_BYTES,
  ImportRawRowSchema,
} from "@sammlerraum/contracts/imports";
export type ImportParseCode =
  | "IMPORT_PROCESSING_ERROR"
  | "IMPORT_CLAIM_LOST"
  | "IMPORT_PARSE_INTEGRITY"
  | "IMPORT_XLSX_INVALID"
  | "IMPORT_SOURCE_INVALID"
  | "IMPORT_SOURCE_TOO_LARGE"
  | "IMPORT_ROW_LIMIT_EXCEEDED"
  | "IMPORT_ROW_TOO_LARGE"
  | "IMPORT_ENCODING_INVALID"
  | "IMPORT_CSV_INVALID"
  | "IMPORT_FORMAT_UNSUPPORTED"
  | "IMPORT_PARSE_CANCELLED"
  | "IMPORT_PARSE_TIMEOUT"
  | "IMPORT_PARSE_OPTIONS_INVALID";
export class ImportParseError extends Error {
  constructor(readonly code: ImportParseCode) {
    super(code);
    this.name = "ImportParseError";
  }
}
function fail(code: ImportParseCode): never {
  throw new ImportParseError(code);
}
const optionsSchema = ImportParserOptionsSchema;
function profileCells(
  input: unknown,
  profile: "GENERIC" | "SAMMLERRAUM_TABULAR_V1",
  format: "CSV" | "XLSX",
  header: boolean,
): unknown {
  if (profile === "GENERIC") return input;
  if (!Array.isArray(input) || input.length < 2 || input.length > 256)
    return fail("IMPORT_SOURCE_INVALID");
  const schema = input.at(-2),
    encoding = input.at(-1);
  if (header) {
    if (schema !== "sammlerraum_schema" || encoding !== "text_encoding")
      return fail("IMPORT_SOURCE_INVALID");
    return input;
  }
  if (
    schema !== "sammlerraum.tabular.v1" ||
    encoding !== (format === "CSV" ? "APOSTROPHE_PREFIX_V1" : "XLSX_LITERAL_V1")
  )
    return fail("IMPORT_SOURCE_INVALID");
  if (format === "XLSX") return input;
  return input.map((value, index) => {
    if (index >= input.length - 2) return value;
    if (typeof value !== "string" || !value.startsWith("'")) return fail("IMPORT_SOURCE_INVALID");
    return value.slice(1);
  });
}
export function parseImportOptions(input: unknown) {
  const result = optionsSchema.safeParse(input);
  if (!result.success) return fail("IMPORT_PARSE_OPTIONS_INVALID");
  return result.data;
}
const limitsSchema = z
  .object({
    maxBytes: z.number().int().min(1).max(IMPORT_MAX_SOURCE_BYTES).default(IMPORT_MAX_SOURCE_BYTES),
    maxRows: z.number().int().min(1).max(IMPORT_MAX_SOURCE_ROWS).default(IMPORT_MAX_SOURCE_ROWS),
    maxMs: z.number().int().min(1).max(60000).default(60000),
  })
  .strict();
export type ParsedImportRow = {
  rowNumber: number;
  sourceRowNumber: number;
  cells: (string | null)[];
};
export type ImportParseContext = {
  signal?: AbortSignal;
  onHeader?: (cells: (string | null)[]) => void | Promise<void>;
};
/** Bounded verified bytes in; raw records out. Only a successful full iterator permits PARSED. */
export async function* parseImportSource(
  source: Uint8Array,
  optionsInput: unknown,
  limitsInput: unknown = {},
  context: ImportParseContext = {},
): AsyncGenerator<ParsedImportRow> {
  const options = optionsSchema.safeParse(optionsInput),
    limits = limitsSchema.safeParse(limitsInput);
  if (!options.success || !limits.success) return fail("IMPORT_PARSE_OPTIONS_INVALID");
  if (!(source instanceof Uint8Array) || source.byteLength === 0)
    return fail("IMPORT_SOURCE_INVALID");
  if (source.byteLength > limits.data.maxBytes) return fail("IMPORT_SOURCE_TOO_LARGE");
  const stopAt = performance.now() + limits.data.maxMs;
  const check = () => {
    if (context.signal?.aborted) return fail("IMPORT_PARSE_CANCELLED");
    if (performance.now() >= stopAt) return fail("IMPORT_PARSE_TIMEOUT");
  };
  check();
  if (options.data.format === "XLSX") {
    const rows = await readXlsx(source, options.data, limits.data.maxRows, check);
    let rowNumber = 0,
      headerSeen = !options.data.hasHeader;
    for (const row of rows) {
      check();
      if (row.cells.every((value) => value === null || value === "")) continue;
      const profiled = ImportRawRowSchema.safeParse(
        profileCells(row.cells, options.data.sourceProfile, "XLSX", !headerSeen),
      );
      if (!profiled.success) return fail("IMPORT_ROW_TOO_LARGE");
      if (!headerSeen) {
        headerSeen = true;
        await context.onHeader?.([...profiled.data]);
        continue;
      }
      if (++rowNumber > limits.data.maxRows) return fail("IMPORT_ROW_LIMIT_EXCEEDED");
      yield { ...row, rowNumber, cells: profiled.data };
    }
    check();
    return;
  }
  async function* decodedChunks() {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    try {
      for (let offset = 0; offset < source.byteLength; offset += 65536) {
        check();
        const text = decoder.decode(source.subarray(offset, offset + 65536), { stream: true });
        if (text) yield text;
      }
      const tail = decoder.decode();
      if (tail) yield tail;
    } catch (error) {
      if (error instanceof ImportParseError) throw error;
      return fail("IMPORT_ENCODING_INVALID");
    }
  }
  const input = Readable.from(decodedChunks()),
    parser = csvParse({
      bom: true,
      delimiter: options.data.delimiter,
      cast: false,
      columns: false,
      skip_empty_lines: false,
      relax_column_count: true,
      // The known profile adds at most one transport prefix per decoded cell.
      max_record_size: IMPORT_MAX_ROW_BYTES + (options.data.sourceProfile === "GENERIC" ? 0 : 256),
    });
  input.on("error", (error) => parser.destroy(error));
  const abort = () => {
    const error = new ImportParseError("IMPORT_PARSE_CANCELLED");
    input.destroy(error);
    parser.destroy(error);
  };
  context.signal?.addEventListener("abort", abort, { once: true });
  input.pipe(parser);
  let sourceRowNumber = 0,
    rowNumber = 0,
    headerSeen = !options.data.hasHeader;
  try {
    for await (const record of parser) {
      check();
      sourceRowNumber++;
      if (sourceRowNumber > limits.data.maxRows + (options.data.hasHeader ? 1 : 0))
        return fail("IMPORT_ROW_LIMIT_EXCEEDED");
      const cells = ImportRawRowSchema.safeParse(
        profileCells(record, options.data.sourceProfile, "CSV", !headerSeen),
      );
      if (!cells.success) return fail("IMPORT_ROW_TOO_LARGE");
      if (cells.data.every((value) => value === null || value === "")) continue;
      if (!headerSeen) {
        headerSeen = true;
        await context.onHeader?.([...cells.data]);
        continue;
      }
      rowNumber++;
      if (rowNumber > limits.data.maxRows) return fail("IMPORT_ROW_LIMIT_EXCEEDED");
      yield { rowNumber, sourceRowNumber, cells: cells.data };
    }
    check();
  } catch (error) {
    if (error instanceof ImportParseError) throw error;
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "CSV_MAX_RECORD_SIZE"
    )
      return fail("IMPORT_ROW_TOO_LARGE");
    return fail("IMPORT_CSV_INVALID");
  } finally {
    context.signal?.removeEventListener("abort", abort);
    input.destroy();
    parser.destroy();
  }
}
