import { createHash } from "node:crypto";
import { z } from "zod";
import { MoneyTransferError } from "@sammlerraum/contracts/money-transfer";
import { ItemSearchError } from "@sammlerraum/contracts/item-search";
import { FilterValidationError } from "@sammlerraum/contracts/search";
import type { StorageProvider, StorageStagingLocker } from "@sammlerraum/storage";
import {
  ExportError,
  TabularExportSnapshotSchema,
  parseExportRequest,
  type TabularExportSnapshot,
} from "@sammlerraum/contracts/exports";
import type { createExportService } from "@sammlerraum/domain/exports/export-service";
import { buildTabularExport } from "./build-tabular-export";
import type { TabularExportRepository } from "./tabular-export-repository";
export const TABULAR_EXPORT_JOB = "exports.build-tabular";
const inputSchema = z.object({ jobId: z.uuid().transform((v) => v.toLowerCase()) }).strict();
function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ":" + stable(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const sourceDigest = (value: TabularExportSnapshot) =>
  hash(stable({ ...value, money: { ...value.money, asOf: "PINNED" } }));
export function createTabularExportJob(
  repository: TabularExportRepository,
  service: ReturnType<typeof createExportService>,
  storage: StorageProvider,
  withAssetLock: StorageStagingLocker,
  options: { maxBytes?: number } = {},
) {
  return async (input: unknown, context?: { signal: AbortSignal }) => {
    const payload = inputSchema.safeParse(input);
    if (!payload.success) return;
    const claim = await repository.claim(payload.data.jobId);
    if (!claim) return;
    const controller = new AbortController(),
      abort = () => controller.abort();
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
    const check = () => {
      if (controller.signal.aborted) throw new Error("Export cancelled");
    };
    try {
      const request = parseExportRequest(claim.request);
      if (request.format !== claim.format || request.locale !== claim.locale)
        throw new ExportError("EXPORT_INTEGRITY");
      check();
      let source: TabularExportSnapshot;
      if (claim.sourceJson !== null) {
        if (
          Buffer.byteLength(claim.sourceJson) > 8388608 ||
          hash(claim.sourceJson) !== claim.sourceHash
        )
          throw new ExportError("EXPORT_INTEGRITY");
        try {
          source = TabularExportSnapshotSchema.parse(JSON.parse(claim.sourceJson));
        } catch {
          throw new ExportError("EXPORT_INTEGRITY");
        }
      } else {
        source = await service.captureExportSource({ userId: claim.ownerId }, request, {
          kind: "TABULAR",
          jobId: claim.id,
          request,
        });
        check();
        const json = JSON.stringify(source);
        if (!(await repository.storeSource(claim, json, hash(json), source.money.asOf))) return;
      }
      if (
        source.ownerId !== claim.ownerId ||
        stable(parseExportRequest(source.request)) !== stable(request)
      )
        throw new ExportError("EXPORT_INTEGRITY");
      const locked = await withAssetLock(
        claim.assetId,
        async () => {
          check();
          if (!(await repository.active(claim))) return;
          const artifact = buildTabularExport(source, {
            ...(options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes }),
            signal: controller.signal,
          });
          check();
          await storage.put(claim.storageKey, artifact.bytes);
          check();
          // Stop renewal only after all actual I/O has settled. Final publication also
          // revalidates live source authorization/meaning in its own bounded snapshot.
          settled = true;
          if (timer) clearTimeout(timer);
          await renewal;
          check();
          await repository.ready(
            claim,
            {
              byteSize: artifact.bytes.length,
              checksumSha256: artifact.checksumSha256,
              mimeType: artifact.mimeType,
            },
            async (tx) => {
              const fresh = await service.captureExportSourceInTransaction(
                tx,
                { userId: claim.ownerId },
                request,
                { kind: "TABULAR", jobId: claim.id, request },
              );
              if (sourceDigest(fresh) !== sourceDigest(source))
                throw new ExportError("EXPORT_STALE");
              check();
            },
          );
        },
        false,
      );
      if (locked === false) throw new Error("Export lock unavailable");
    } catch (error) {
      settled = true;
      if (timer) clearTimeout(timer);
      await renewal;
      const normalized =
        error instanceof MoneyTransferError
          ? new ExportError(
              error.code === "MONEY_EXPORT_LIMIT_EXCEEDED"
                ? "EXPORT_LIMIT_EXCEEDED"
                : "EXPORT_INTEGRITY",
            )
          : error instanceof FilterValidationError
            ? new ExportError(
                error.code === "FILTER_REFERENCE_INVALID" ? "EXPORT_NOT_FOUND" : "EXPORT_INVALID",
              )
            : error instanceof ItemSearchError && error.code !== "SEARCH_UNAVAILABLE"
              ? new ExportError(
                  error.code === "FILTER_REFERENCE_INVALID"
                    ? "EXPORT_NOT_FOUND"
                    : error.code === "SEARCH_INVALID"
                      ? "EXPORT_INVALID"
                      : "EXPORT_INTEGRITY",
                )
              : error;
      const permanent = normalized instanceof ExportError && normalized.code !== "EXPORT_NOT_READY";
      const code =
        normalized instanceof ExportError
          ? normalized.code
          : controller.signal.aborted
            ? "EXPORT_CANCELLED"
            : "EXPORT_BUILD_FAILED";
      try {
        await repository.fail(claim, code, !permanent);
      } catch {
        throw new Error("Export temporarily unavailable");
      }
      if (!permanent) throw new Error("Export temporarily unavailable");
    } finally {
      settled = true;
      if (timer) clearTimeout(timer);
      clearTimeout(timeout);
      context?.signal.removeEventListener("abort", abort);
      await renewal;
    }
  };
}
