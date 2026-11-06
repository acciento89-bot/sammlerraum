import { Readable } from "node:stream";
import { parse as csvParse } from "csv-parse";
import { z } from "zod";
import { readXlsx } from "./parse-xlsx";
import {
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
const optionsSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    format: z.enum(["CSV", "XLSX"]),
    hasHeader: z.boolean(),
    delimiter: z.enum([",", ";", "\t"]).default(","),
    sheetName: z.string().min(1).max(31).optional(),
  })
  .strict()
  .refine((v) => v.format !== "CSV" || v.sheetName === undefined);
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
      if (!headerSeen) {
        headerSeen = true;
        await context.onHeader?.([...row.cells]);
        continue;
      }
      if (++rowNumber > limits.data.maxRows) return fail("IMPORT_ROW_LIMIT_EXCEEDED");
      yield { ...row, rowNumber };
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
      max_record_size: IMPORT_MAX_ROW_BYTES,
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
      const cells = ImportRawRowSchema.safeParse(record);
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
