import { posix } from "node:path";
import { crc32 } from "node:zlib";
import { fromBuffer, type Entry, type ZipFile } from "yauzl";
import { SaxesParser, type SaxesTagNS } from "saxes";
import { ImportRawRowSchema } from "@sammlerraum/contracts/imports";
import { ImportParseError, type ParsedImportRow } from "./parse-import";
const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const DOCREL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
function invalid(): never {
  throw new ImportParseError("IMPORT_XLSX_INVALID");
}
function attr(tag: SaxesTagNS, name: string): string | undefined {
  const value = tag.attributes[name];
  return value?.value;
}
function xml(
  bytes: Buffer,
  namespace: string,
  root: string,
  check: () => void,
  handlers: {
    open?: (tag: SaxesTagNS, path: string[]) => void;
    text?: (value: string, path: string[]) => void;
    close?: (tag: SaxesTagNS, path: string[]) => void;
  },
) {
  const parser = new SaxesParser({ xmlns: true }),
    stack: string[] = [];
  let seenRoot = false;
  parser.on("doctype", invalid);
  parser.on("error", invalid);
  parser.on("opentag", (tag) => {
    check();
    if (stack.length >= 64) invalid();
    if (!stack.length) {
      if (seenRoot || tag.uri !== namespace || tag.local !== root) invalid();
      seenRoot = true;
    }
    if (tag.uri !== namespace) invalid();
    stack.push(tag.local);
    handlers.open?.(tag, stack);
  });
  parser.on("text", (text) => handlers.text?.(text, stack));
  parser.on("cdata", (text) => handlers.text?.(text, stack));
  parser.on("closetag", (tag) => {
    handlers.close?.(tag, stack);
    stack.pop();
  });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    for (let offset = 0; offset < bytes.length; offset += 16384) {
      check();
      parser.write(decoder.decode(bytes.subarray(offset, offset + 16384), { stream: true }));
    }
    parser.write(decoder.decode()).close();
    if (!seenRoot || stack.length) invalid();
  } catch (error) {
    if (error instanceof ImportParseError) throw error;
    invalid();
  }
}
function target(base: string, value: string | undefined): string {
  if (!value || /[\\\u0000?#:%]/u.test(value) || value.startsWith("//")) invalid();
  const path = value.startsWith("/") ? value.slice(1) : posix.join(posix.dirname(base), value);
  if (path.startsWith("../") || path === ".." || path.startsWith("/") || !path) invalid();
  return path;
}
/** No extraction, formula evaluation, style guessing or external relationship requests. */
export async function readXlsx(
  source: Uint8Array,
  options: { sheetName?: string | undefined; hasHeader: boolean },
  maxRows: number,
  check: () => void,
): Promise<ParsedImportRow[]> {
  const zip = await new Promise<ZipFile>((resolve, reject) =>
    fromBuffer(
      Buffer.from(source),
      {
        lazyEntries: true,
        autoClose: false,
        strictFileNames: true,
        validateEntrySizes: true,
      },
      (error, value) =>
        error || !value ? reject(new ImportParseError("IMPORT_XLSX_INVALID")) : resolve(value),
    ),
  );
  let zipError: unknown;
  const onError = (error: unknown) => {
    zipError = error;
  };
  zip.on("error", onError);
  try {
    const entries = new Map<string, Entry>();
    let total = 0;
    await new Promise<void>((resolve, reject) => {
      const fail = () => reject(new ImportParseError("IMPORT_XLSX_INVALID"));
      zip.once("error", fail);
      zip.once("end", () => {
        zip.off("error", fail);
        resolve();
      });
      zip.on("entry", (entry: Entry) => {
        try {
          check();
          const name = entry.fileName;
          if (
            entries.size >= 2048 ||
            entries.has(name) ||
            entry.isEncrypted() ||
            (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) ||
            /(?:vbaProject|macros|activeX|embeddings)(?:\.|\/)/iu.test(name)
          )
            invalid();
          if (
            name.startsWith("/") ||
            name.split("/").some((part) => part === ".." || part === ".") ||
            name.includes("\\")
          )
            invalid();
          total += entry.uncompressedSize;
          if (entry.uncompressedSize > 16 * 1024 * 1024 || total > 64 * 1024 * 1024) invalid();
          entries.set(name, entry);
          zip.readEntry();
        } catch (error) {
          reject(error);
        }
      });
      zip.readEntry();
    });
    const read = async (name: string): Promise<Buffer> => {
      check();
      if (zipError) invalid();
      const entry = entries.get(name);
      if (!entry || name.endsWith("/")) invalid();
      const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) =>
        zip.openReadStream(entry, (error, stream) =>
          error || !stream ? reject(new ImportParseError("IMPORT_XLSX_INVALID")) : resolve(stream),
        ),
      );
      const chunks: Buffer[] = [];
      let size = 0;
      try {
        for await (const chunk of stream) {
          check();
          const bytes = Buffer.from(chunk);
          size += bytes.length;
          if (size > entry.uncompressedSize || size > 16 * 1024 * 1024) invalid();
          chunks.push(bytes);
        }
        const bytes = Buffer.concat(chunks);
        if (size !== entry.uncompressedSize || crc32(bytes) !== entry.crc32) invalid();
        return bytes;
      } finally {
        (stream as import("node:stream").Readable).destroy();
      }
    };
    // Validate every relationship, including unused ones, without ever opening external targets.
    const relations = new Map<string, Map<string, { type: string; path: string }>>();
    for (const name of entries.keys())
      if (name.endsWith(".rels")) {
        const base = name === "_rels/.rels" ? "root" : name.replace(/_rels\/([^/]+)\.rels$/u, "$1");
        const map = new Map<string, { type: string; path: string }>();
        xml(await read(name), REL, "Relationships", check, {
          open(tag, path) {
            if (path.length === 2 && tag.local === "Relationship") {
              const id = attr(tag, "Id"),
                type = attr(tag, "Type");
              if (
                !id ||
                !type ||
                map.has(id) ||
                (attr(tag, "TargetMode") !== undefined && attr(tag, "TargetMode") !== "Internal")
              )
                invalid();
              map.set(id, { type, path: target(base, attr(tag, "Target")) });
            }
          },
        });
        relations.set(base, map);
      }
    let workbook = "";
    for (const rel of relations.get("root")?.values() ?? [])
      if (rel.type === `${DOCREL}/officeDocument`) {
        if (workbook) invalid();
        workbook = rel.path;
      }
    if (!workbook) invalid();
    let mainType = false;
    xml(
      await read("[Content_Types].xml"),
      "http://schemas.openxmlformats.org/package/2006/content-types",
      "Types",
      check,
      {
        open(tag) {
          const content = attr(tag, "ContentType") ?? "";
          if (/macroEnabled|vba|activeX/iu.test(content)) invalid();
          if (
            tag.local === "Override" &&
            attr(tag, "PartName") === `/${workbook}` &&
            content === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"
          )
            mainType = true;
        },
      },
    );
    if (!mainType) invalid();
    const sheets: { name: string; id: string }[] = [];
    const names = new Set<string>();
    xml(await read(workbook), MAIN, "workbook", check, {
      open(tag, path) {
        if (path.join("/") === "workbook/sheets/sheet") {
          const name = attr(tag, "name");
          const id = Object.values(tag.attributes).find(
            (a) => a.local === "id" && a.uri === DOCREL,
          )?.value;
          if (!name || !id || names.has(name) || sheets.length >= 256) invalid();
          names.add(name);
          sheets.push({ name, id });
        }
      },
    });
    const sheet = options.sheetName
      ? sheets.find((s) => s.name === options.sheetName)
      : sheets.length === 1
        ? sheets[0]
        : undefined;
    if (!sheet) invalid();
    const rels = relations.get(workbook),
      selected = rels?.get(sheet.id);
    if (selected?.type !== `${DOCREL}/worksheet`) invalid();
    const strings: string[] = [];
    let currentString: string | undefined;
    const shared = [...(rels?.values() ?? [])].filter((r) => r.type === `${DOCREL}/sharedStrings`);
    if (shared.length > 1) invalid();
    if (shared[0])
      xml(await read(shared[0].path), MAIN, "sst", check, {
        open(tag, path) {
          if (path.join("/") === "sst/si") {
            if (strings.length >= 100000) invalid();
            currentString = "";
          }
        },
        text(text, path) {
          if (currentString !== undefined && path.at(-1) === "t" && !path.includes("rPh")) {
            currentString += text;
            if (Buffer.byteLength(currentString) > 16384) invalid();
          }
        },
        close(tag, path) {
          if (path.join("/") === "sst/si") {
            strings.push(currentString ?? "");
            currentString = undefined;
          }
        },
      });
    const result: ParsedImportRow[] = [];
    let dataSections = 0;
    let scanned = 0,
      previousRow = 0,
      rowIndex = 0,
      column = -1;
    let cells: (string | null)[] | undefined,
      value = "",
      inline = "",
      kind = "",
      haveValue = false;
    xml(await read(selected.path), MAIN, "worksheet", check, {
      open(tag, path) {
        const addressPath = path.join("/");
        if (tag.local === "sheetData") {
          if (addressPath !== "worksheet/sheetData" || ++dataSections !== 1) invalid();
        }
        if (tag.local === "row" && addressPath !== "worksheet/sheetData/row") invalid();
        if (tag.local === "c" && addressPath !== "worksheet/sheetData/row/c") invalid();
        if (path.join("/") === "worksheet/sheetData/row") {
          scanned++;
          if (scanned > maxRows + (options.hasHeader ? 1 : 0))
            throw new ImportParseError("IMPORT_ROW_LIMIT_EXCEEDED");
          const address = attr(tag, "r");
          rowIndex =
            address === undefined
              ? previousRow + 1
              : /^[1-9][0-9]{0,6}$/u.test(address)
                ? Number(address)
                : 0;
          if (rowIndex <= previousRow || rowIndex > 1048576) invalid();
          previousRow = rowIndex;
          cells = [];
          column = -1;
        } else if (path.join("/") === "worksheet/sheetData/row/c") {
          if (!cells) invalid();
          const address = attr(tag, "r");
          let next = column + 1;
          if (address !== undefined) {
            const match = /^([A-Z]{1,3})([1-9][0-9]{0,6})$/u.exec(address);
            if (!match || Number(match[2]) !== rowIndex) invalid();
            next = 0;
            for (const char of match[1]!) next = next * 26 + char.charCodeAt(0) - 64;
            next--;
          }
          if (next <= column || next >= 256) invalid();
          column = next;
          while (cells.length <= column) cells.push(null);
          value = "";
          inline = "";
          haveValue = false;
          kind = attr(tag, "t") ?? "n";
          if (!["n", "s", "str", "inlineStr", "b", "e", "d"].includes(kind)) invalid();
        } else if (path.join("/") === "worksheet/sheetData/row/c/v") {
          if (haveValue) invalid();
          haveValue = true;
        }
      },
      text(text, path) {
        if (path.join("/") === "worksheet/sheetData/row/c/v") value += text;
        if (path.at(-1) === "t" && path.includes("is") && !path.includes("rPh")) inline += text;
        if (Buffer.byteLength(value) > 16384 || Buffer.byteLength(inline) > 16384) invalid();
      },
      close(tag, path) {
        if (path.join("/") === "worksheet/sheetData/row/c") {
          if (!cells) invalid();
          let raw: string | null = kind === "inlineStr" ? inline : haveValue ? value : null;
          if (kind === "s" && raw !== null) {
            if (!/^(?:0|[1-9][0-9]{0,5})$/u.test(raw) || strings[Number(raw)] === undefined)
              invalid();
            raw = strings[Number(raw)]!;
          }
          cells[column] = raw;
        } else if (path.join("/") === "worksheet/sheetData/row") {
          const parsed = ImportRawRowSchema.safeParse(cells);
          if (!parsed.success) throw new ImportParseError("IMPORT_ROW_TOO_LARGE");
          result.push({
            rowNumber: result.length + 1,
            sourceRowNumber: rowIndex,
            cells: parsed.data,
          });
          cells = undefined;
        }
      },
    });
    if (dataSections !== 1) invalid();
    return result;
  } catch (error) {
    if (error instanceof ImportParseError) throw error;
    invalid();
  } finally {
    zip.close();
    zip.off("error", onError);
  }
}
