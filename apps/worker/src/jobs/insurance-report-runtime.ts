import { createHash } from "node:crypto";
import { z } from "zod";
import { MoneyTransferError } from "@sammlerraum/contracts/money-transfer";
import { ItemSearchError } from "@sammlerraum/contracts/item-search";
import { FilterValidationError } from "@sammlerraum/contracts/search";
import type { StorageProvider, StorageStagingLocker } from "@sammlerraum/storage";
import {
  ReportError,
  ReportSnapshotSchema,
  parseInsuranceReportOptions,
  type ReportSnapshot,
} from "@sammlerraum/contracts/reports";
import type { createReportService } from "@sammlerraum/domain/reports/report-service";
import { buildInsuranceReport } from "./build-insurance-report";
import type { TabularExportRepository } from "./tabular-export-repository";
export const INSURANCE_REPORT_JOB = "reports.build-insurance";
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
const sourceDigest = (value: ReportSnapshot) => hash(stable({ ...value, reportAsOf: "PINNED" }));
export function createInsuranceReportJob(
  repository: TabularExportRepository,
  service: ReturnType<typeof createReportService>,
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
      if (controller.signal.aborted) throw new Error("Report cancelled");
    };
    try {
      const request = parseInsuranceReportOptions(claim.request);
      if (claim.format !== "PDF" || request.locale !== claim.locale)
        throw new ReportError("REPORT_INTEGRITY");
      check();
      let source: ReportSnapshot;
      if (claim.sourceJson !== null) {
        if (
          Buffer.byteLength(claim.sourceJson) > 8388608 ||
          hash(claim.sourceJson) !== claim.sourceHash
        )
          throw new ReportError("REPORT_INTEGRITY");
        try {
          source = ReportSnapshotSchema.parse(JSON.parse(claim.sourceJson));
        } catch {
          throw new ReportError("REPORT_INTEGRITY");
        }
      } else {
        source = await service.captureReportSource({ userId: claim.ownerId }, request);
        check();
        const json = JSON.stringify(source);
        if (!(await repository.storeSource(claim, json, hash(json), source.reportAsOf))) return;
      }
      if (
        source.ownerId !== claim.ownerId ||
        stable(parseInsuranceReportOptions(source.request)) !== stable(request)
      )
        throw new ReportError("REPORT_INTEGRITY");
      const locked = await withAssetLock(
        claim.assetId,
        async () => {
          check();
          if (!(await repository.active(claim))) return;
          const artifact = await buildInsuranceReport(source, storage, {
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
              const fresh = await service.captureReportSourceInTransaction(
                tx,
                { userId: claim.ownerId },
                request,
              );
              if (sourceDigest(fresh) !== sourceDigest(source))
                throw new ReportError("REPORT_STALE");
              check();
            },
          );
        },
        false,
      );
      if (locked === false) throw new Error("Report lock unavailable");
    } catch (error) {
      settled = true;
      if (timer) clearTimeout(timer);
      await renewal;
      const normalized =
        error instanceof MoneyTransferError
          ? new ReportError(
              error.code === "MONEY_EXPORT_LIMIT_EXCEEDED"
                ? "REPORT_LIMIT_EXCEEDED"
                : "REPORT_INTEGRITY",
            )
          : error instanceof FilterValidationError
            ? new ReportError(
                error.code === "FILTER_REFERENCE_INVALID" ? "REPORT_NOT_FOUND" : "REPORT_INVALID",
              )
            : error instanceof ItemSearchError && error.code !== "SEARCH_UNAVAILABLE"
              ? new ReportError(
                  error.code === "FILTER_REFERENCE_INVALID"
                    ? "REPORT_NOT_FOUND"
                    : error.code === "SEARCH_INVALID"
                      ? "REPORT_INVALID"
                      : "REPORT_INTEGRITY",
                )
              : error;
      const permanent = normalized instanceof ReportError && normalized.code !== "REPORT_NOT_READY";
      const code =
        normalized instanceof ReportError
          ? normalized.code
          : controller.signal.aborted
            ? "REPORT_CANCELLED"
            : "REPORT_BUILD_FAILED";
      try {
        await repository.fail(claim, code, !permanent);
      } catch {
        throw new Error("Report temporarily unavailable");
      }
      if (!permanent) throw new Error("Report temporarily unavailable");
    } finally {
      settled = true;
      if (timer) clearTimeout(timer);
      clearTimeout(timeout);
      context?.signal.removeEventListener("abort", abort);
      await renewal;
    }
  };
}
