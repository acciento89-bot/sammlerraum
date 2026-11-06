import { createHash } from "node:crypto";
import { z } from "zod";
import type { StorageProvider } from "@sammlerraum/storage";
import { IMPORT_MAX_SOURCE_BYTES, IMPORT_MAX_SOURCE_ROWS } from "@sammlerraum/contracts/imports";
import {
  ImportParseError,
  parseImportSource,
  parseImportOptions,
  type ParsedImportRow,
} from "./parse-import";
import type { ImportParserRepository } from "./import-parser-repository";
export const IMPORT_PARSE_JOB = "imports.parse-source";
const payloadSchema = z
  .object({ jobId: z.uuid().transform((value) => value.toLowerCase()) })
  .strict();
/** Retains the lease until all parser/storage/DB work actually settles, even on cancellation. */
export function createImportParser(
  repository: ImportParserRepository,
  storage: StorageProvider,
  limits: { maxBytes?: number; maxRows?: number } = {},
) {
  const maxBytes = limits.maxBytes ?? IMPORT_MAX_SOURCE_BYTES,
    maxRows = limits.maxRows ?? IMPORT_MAX_SOURCE_ROWS;
  if (
    !Number.isInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > IMPORT_MAX_SOURCE_BYTES ||
    !Number.isInteger(maxRows) ||
    maxRows < 1 ||
    maxRows > IMPORT_MAX_SOURCE_ROWS
  )
    throw new Error("Invalid import limits");
  return async (payload: unknown, context?: { signal: AbortSignal }): Promise<void> => {
    const parsed = payloadSchema.safeParse(payload);
    if (!parsed.success) return;
    const claim = await repository.claim(parsed.data.jobId);
    if (!claim) return;
    const controller = new AbortController();
    const abort = () => controller.abort();
    context?.signal.addEventListener("abort", abort, { once: true });
    if (context?.signal.aborted) abort();
    let timer: ReturnType<typeof setTimeout> | undefined,
      renewal: Promise<void> | undefined,
      settled = false;
    const heartbeat = () => {
      timer = setTimeout(() => {
        renewal = repository
          .renew(claim)
          .then((ok) => {
            if (!ok) abort();
          })
          .catch(abort)
          .finally(() => {
            if (!settled) heartbeat();
          });
      }, 10000);
      timer.unref();
    };
    heartbeat();
    const timeout = setTimeout(abort, 60000);
    timeout.unref();
    try {
      const options = parseImportOptions(claim.parserOptions);
      if (options.format !== claim.sourceFormat)
        throw new ImportParseError("IMPORT_PARSE_OPTIONS_INVALID");
      if (claim.sourceByteSize <= 0n || claim.sourceByteSize > BigInt(maxBytes))
        throw new ImportParseError("IMPORT_SOURCE_TOO_LARGE");
      const bytes = await storage.read(claim.sourceStorageKey, {
        maxBytes,
        signal: controller.signal,
      });
      if (controller.signal.aborted) throw new ImportParseError("IMPORT_PARSE_CANCELLED");
      if (
        BigInt(bytes.byteLength) !== claim.sourceByteSize ||
        createHash("sha256").update(bytes).digest("hex") !== claim.sourceChecksumSha256
      )
        throw new ImportParseError("IMPORT_SOURCE_INVALID");
      if (!(await repository.verified(claim))) throw new ImportParseError("IMPORT_CLAIM_LOST");
      let batch: ParsedImportRow[] = [],
        total = 0;
      for await (const row of parseImportSource(
        bytes,
        options,
        { maxBytes, maxRows },
        { signal: controller.signal, onHeader: (cells) => repository.header(claim, cells) },
      )) {
        total = row.rowNumber;
        batch.push(row);
        if (batch.length === 100) {
          await repository.append(claim, batch);
          batch = [];
        }
      }
      if (batch.length) await repository.append(claim, batch);
      if (controller.signal.aborted) throw new ImportParseError("IMPORT_PARSE_CANCELLED");
      settled = true;
      if (timer) clearTimeout(timer);
      await renewal;
      await repository.finish(claim, total);
    } catch (error) {
      const code =
        error instanceof ImportParseError
          ? error.code
          : typeof error === "object" &&
              error !== null &&
              "code" in error &&
              error.code === "STORAGE_TOO_LARGE"
            ? "IMPORT_SOURCE_TOO_LARGE"
            : controller.signal.aborted
              ? "IMPORT_PARSE_CANCELLED"
              : typeof error === "object" &&
                  error !== null &&
                  "code" in error &&
                  error.code === "STORAGE_NOT_FOUND"
                ? "IMPORT_SOURCE_INVALID"
                : "IMPORT_PROCESSING_ERROR";
      settled = true;
      if (timer) clearTimeout(timer);
      await renewal;
      const retry = code === "IMPORT_PARSE_CANCELLED" || code === "IMPORT_PROCESSING_ERROR";
      await repository.fail(claim, code, retry);
      // A resolved queue handler acknowledges success. Release durable ownership first,
      // then reject retryable failures so pg-boss can actually schedule another attempt.
      if (retry) throw new ImportParseError(code);
    } finally {
      settled = true;
      if (timer) clearTimeout(timer);
      clearTimeout(timeout);
      context?.signal.removeEventListener("abort", abort);
      await renewal;
    }
  };
}
