import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import {
  AIAnalysisError,
  AIReportedUsageSchema,
  type AIReportedUsage,
} from "@sammlerraum/contracts/ai";
import type { AIProvider } from "@sammlerraum/ai/types";
import type { createAIAnalysisService } from "@sammlerraum/domain/ai/ai-analysis-service";
import type { StorageProvider } from "@sammlerraum/storage";
export const AI_ANALYZE_ITEM_JOB = "ai.analyze-item";
const Payload = z.object({ analysisJobId: z.uuid() }).strict();
const unknownUsage: AIReportedUsage = { inputTokens: null, outputTokens: null };
/** Only an opaque job ID is queued. No private media data or credentials enter queue/log payloads. */
export function createAnalyzeItemJob(
  service: ReturnType<typeof createAIAnalysisService>,
  provider: AIProvider,
  storage: Pick<StorageProvider, "read">,
  options: { heartbeatMs?: number; timeoutMs?: number } = {},
) {
  return async (input: unknown, context?: { signal: AbortSignal }): Promise<void> => {
    const parsed = Payload.safeParse(input);
    if (!parsed.success) return;
    if (context?.signal.aborted) return;
    const claim = await service.claimAnalysis(parsed.data.analysisJobId);
    if (!claim) return;
    const controller = new AbortController(),
      abort = () => controller.abort();
    context?.signal.addEventListener("abort", abort, { once: true });
    if (context?.signal.aborted) abort();
    let settled = false,
      timer: ReturnType<typeof setTimeout> | undefined,
      renewal: Promise<void> | undefined,
      usage = unknownUsage;
    const heartbeat = () => {
      timer = setTimeout(() => {
        renewal = service
          .renewAnalysis(claim)
          .then((ok) => {
            if (!ok) abort();
          })
          .catch(abort)
          .finally(() => {
            if (!settled) heartbeat();
          });
      }, options.heartbeatMs ?? 10000);
      timer.unref();
    };
    heartbeat();
    const timeout = setTimeout(abort, options.timeoutMs ?? 45000);
    timeout.unref();
    const check = () => {
      if (controller.signal.aborted) throw new AIAnalysisError("AI_PROVIDER_UNAVAILABLE");
    };
    const settle = async () => {
      settled = true;
      if (timer) clearTimeout(timer);
      await renewal;
    };
    try {
      if (claim.providerId !== provider.id || claim.model !== provider.model)
        throw new AIAnalysisError("AI_PROVIDER_UNAVAILABLE");
      const images: { bytes: Uint8Array; mimeType: "image/webp" }[] = [];
      for (const source of claim.sources) {
        check();
        const bytes = await storage.read(source.storageKey, {
          maxBytes: 2097152,
          signal: controller.signal,
        });
        check();
        if (
          bytes.length !== Number(source.byteSize) ||
          createHash("sha256").update(bytes).digest("hex") !== source.checksumSha256
        )
          throw new AIAnalysisError("AI_SOURCE_NOT_AUTHORIZED");
        try {
          const decoder = sharp(bytes, { limitInputPixels: 409600, failOn: "warning" }),
            meta = await decoder.metadata();
          if (
            meta.format !== "webp" ||
            meta.width !== source.width ||
            meta.height !== source.height ||
            (meta.pages ?? 1) !== 1
          )
            throw Error();
          // Decode and re-encode without metadata, even if stored variant metadata was tampered with.
          const clean = await decoder.rotate().webp({ quality: 85 }).toBuffer();
          if (clean.length > 2097152) throw Error();
          images.push({ bytes: clean, mimeType: "image/webp" });
        } catch {
          throw new AIAnalysisError("AI_SOURCE_NOT_AUTHORIZED");
        }
      }
      const publicContext = await service.getWorkerContext(claim);
      check();
      const result = await provider.analyzeCollectible({
        images,
        signal: controller.signal,
        ...publicContext,
      });
      usage = AIReportedUsageSchema.parse(result.usage);
      await service.recordAnalysisUsage(claim, usage);
      check();
      await settle();
      check();
      await service.storeAnalysisResult(claim, result.analysis, usage);
    } catch (error) {
      // Actual transport has settled before attempt/lease release; an abort alone is not settlement.
      await settle();
      if (error && typeof error === "object" && "usage" in error) {
        const parsed = AIReportedUsageSchema.safeParse(error.usage);
        if (parsed.success) {
          usage = parsed.data;
          await service.recordAnalysisUsage(claim, usage);
        }
      }
      const code = error instanceof AIAnalysisError ? error.code : "AI_PROVIDER_UNAVAILABLE";
      await service.failAnalysis(claim, code, code === "AI_PROVIDER_UNAVAILABLE", usage);
    } finally {
      await settle();
      clearTimeout(timeout);
      context?.signal.removeEventListener("abort", abort);
    }
  };
}
