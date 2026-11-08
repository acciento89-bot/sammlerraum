import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createAIAnalysisService } from "@sammlerraum/domain/ai/ai-analysis-service";
const valid = {
  categoryKey: null,
  title: "Visible ceramic",
  manufacturer: null,
  seriesOrSet: null,
  year: null,
  identifiers: [],
  catalogCandidates: [],
  warnings: ["Please check visible evidence."],
};
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual durable owned analysis worker",
  () => {
    let db: ReturnType<typeof createTestDatabaseClient>,
      isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    async function fixture() {
      const owner = `analysis-worker-${randomUUID()}`;
      await db.user.create({
        data: {
          id: owner,
          email: `${owner}@example.invalid`,
          emailVerified: true,
          name: "Owned fixture",
        },
      });
      const collection = await db.collection.create({
        data: { ownerId: owner, name: "Private collection" },
      });
      const item = await db.collectibleItem.create({
        data: { ownerId: owner, collectionId: collection.id, title: "Original private item" },
      });
      const bytes = await sharp({
        create: { width: 10, height: 10, channels: 3, background: "#998877" },
      })
        .webp()
        .toBuffer();
      const asset = await db.mediaAsset.create({
        data: {
          ownerId: owner,
          kind: "IMAGE",
          status: "READY",
          storageKey: `original/${randomUUID()}`,
          mimeType: "image/png",
          byteSize: 999n,
          checksumSha256: "a".repeat(64),
          originalFileName: "private-filename.png",
        },
      });
      const variant = await db.mediaVariant.create({
        data: {
          assetId: asset.id,
          name: "MEDIUM",
          storageKey: `processed/${randomUUID()}`,
          mimeType: "image/webp",
          byteSize: BigInt(bytes.length),
          checksumSha256: createHash("sha256").update(bytes).digest("hex"),
          width: 10,
          height: 10,
        },
      });
      const link = await db.mediaLink.create({
        data: {
          ownerId: owner,
          itemId: item.id,
          assetId: asset.id,
          purpose: "GALLERY",
          position: 0,
        },
      });
      const service = createAIAnalysisService(db, {
        providerId: "fixture",
        model: "fixture-vision",
        monthlyRequestLimit: 10,
      });
      const job = await service.requestItemAnalysis(
        { userId: owner },
        item.id,
        [asset.id],
        randomUUID(),
      );
      const analyze = vi.fn(async (_input: unknown) => ({
        analysis: valid,
        usage: { inputTokens: 12, outputTokens: 5 },
      }));
      const read = vi.fn(async (key: string) => {
        expect(key).toBe(variant.storageKey);
        return bytes;
      });
      const path = "./analyze-item";
      const module = await import(path).catch(() => null);
      expect(module?.createAnalyzeItemJob, "real durable handler must exist").toBeTypeOf(
        "function",
      );
      const handler = module!.createAnalyzeItemJob(
        service,
        { id: "fixture", model: "fixture-vision", analyzeCollectible: analyze },
        { read },
      );
      return {
        owner,
        collection,
        item,
        asset,
        variant,
        link,
        service,
        job,
        analyze,
        read,
        handler,
        bytes,
        module: module!,
      };
    }
    it("processes only the selected display image once and never auto-mutates the item", async () => {
      const f = await fixture();
      const before = await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item.id } });
      await f.handler({ analysisJobId: f.job.id });
      await f.handler({ analysisJobId: f.job.id });
      expect(f.analyze).toHaveBeenCalledTimes(1);
      expect(f.read).toHaveBeenCalledTimes(1);
      expect(await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item.id } })).toEqual(
        before,
      );
      const detail = await f.service.getAnalysis({ userId: f.owner }, f.job.id);
      expect(detail.job.status).toBe("READY");
      expect(detail.analysis).toEqual(valid);
      const attempts = await db.aIAnalysisAttempt.findMany({ where: { jobId: f.job.id } });
      expect(attempts).toMatchObject([{ outcome: "SUCCEEDED", inputTokens: 12, outputTokens: 5 }]);
      const input = f.analyze.mock.calls[0]![0];
      expect(Object.keys(input as object).sort()).toEqual([
        "catalogCandidates",
        "categories",
        "images",
        "signal",
      ]);
      expect(JSON.stringify(input)).not.toMatch(
        /Original private item|private-filename|storageKey|ownerId/,
      );
    });
    it("terminally rejects an unlinked source before storage or provider IO", async () => {
      const f = await fixture();
      await db.mediaLink.delete({ where: { id: f.link.id } });
      await f.handler({ analysisJobId: f.job.id });
      expect(f.read).not.toHaveBeenCalled();
      expect(f.analyze).not.toHaveBeenCalled();
      expect((await f.service.getAnalysis({ userId: f.owner }, f.job.id)).job).toMatchObject({
        status: "FAILED",
        errorCode: "AI_SOURCE_NOT_AUTHORIZED",
      });
    });
    it("rejects corrupted stored bytes before any provider call", async () => {
      const f = await fixture();
      f.read.mockResolvedValue(Buffer.from("%PDF-private-secret"));
      await f.handler({ analysisJobId: f.job.id });
      expect(f.analyze).not.toHaveBeenCalled();
      expect((await f.service.getAnalysis({ userId: f.owner }, f.job.id)).job.status).toBe(
        "FAILED",
      );
    });
    it("discards a response after source revocation while preserving reported attempt usage", async () => {
      const f = await fixture();
      f.analyze.mockImplementation(async () => {
        await db.mediaLink.delete({ where: { id: f.link.id } });
        return { analysis: valid, usage: { inputTokens: 12, outputTokens: 5 } };
      });
      await f.handler({ analysisJobId: f.job.id });
      const detail = await f.service.getAnalysis({ userId: f.owner }, f.job.id);
      expect(detail.job.status).toBe("FAILED");
      expect(detail.analysis).toBeNull();
      expect(await db.aIAnalysisAttempt.findMany({ where: { jobId: f.job.id } })).toMatchObject([
        { outcome: "FAILED", inputTokens: 12, outputTokens: 5 },
      ]);
    });
    it("bounds durable provider retries at three attempts and retains reported failure usage", async () => {
      const f = await fixture();
      f.analyze.mockImplementation(async () => {
        throw Object.assign(new Error("private provider sentinel"), { name: "opaque" });
      });
      for (let number = 1; number <= 3; number++) {
        await f.handler({ analysisJobId: f.job.id });
        expect((await f.service.getAnalysis({ userId: f.owner }, f.job.id)).job.status).toBe(
          number < 3 ? "PENDING" : "FAILED",
        );
        if (number < 3)
          await db.$executeRaw`UPDATE "AIAnalysisJob" SET "nextAttemptAt"=clock_timestamp() AT TIME ZONE 'UTC'-interval '1 second' WHERE id=${f.job.id}::uuid`;
      }
      await f.handler({ analysisJobId: f.job.id });
      expect(f.analyze).toHaveBeenCalledTimes(3);
      expect(await db.aIAnalysisAttempt.count({ where: { jobId: f.job.id } })).toBe(3);
      expect(
        JSON.stringify(await f.service.getAnalysis({ userId: f.owner }, f.job.id)),
      ).not.toContain("private provider sentinel");
    });
    it("waits for an abort-ignoring transport before freeing its durable attempt", async () => {
      const f = await fixture();
      let entered!: () => void, release!: () => void;
      const started = new Promise<void>((resolve) => (entered = resolve)),
        held = new Promise<void>((resolve) => (release = resolve));
      f.analyze.mockImplementation(async (input: any) => {
        entered();
        await held;
        expect(input.signal.aborted).toBe(true);
        return { analysis: valid, usage: { inputTokens: 12, outputTokens: 5 } };
      });
      const controller = new AbortController();
      let finished = false;
      const running = f
        .handler({ analysisJobId: f.job.id }, { signal: controller.signal })
        .then(() => {
          finished = true;
        });
      await started;
      controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(finished).toBe(false);
      expect((await f.service.getAnalysis({ userId: f.owner }, f.job.id)).job.status).toBe(
        "PROCESSING",
      );
      release();
      await running;
      expect(finished).toBe(true);
      expect(await db.aIAnalysisAttempt.findMany({ where: { jobId: f.job.id } })).toMatchObject([
        { outcome: "FAILED", inputTokens: 12, outputTokens: 5 },
      ]);
    });
    it("renews live leases with source checks and rejects stale completion tokens", async () => {
      const f = await fixture();
      const service = createAIAnalysisService(db, {
        providerId: "fixture",
        model: "fixture-vision",
        monthlyRequestLimit: 10,
        leaseMs: 500,
      });
      const first = await service.claimAnalysis(f.job.id);
      expect(first).not.toBeNull();
      expect(await service.renewAnalysis(first!)).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 550));
      const second = await service.claimAnalysis(f.job.id);
      expect(second!.token).not.toBe(first!.token);
      await expect(service.storeAnalysisResult(first!, valid)).rejects.toMatchObject({
        code: "AI_STALE_JOB",
      });
      expect(await service.failAnalysis(first!, "AI_PROVIDER_UNAVAILABLE", false)).toBe(false);
      await service.storeAnalysisResult(second!, valid);
      expect(
        await db.aIAnalysisAttempt.findMany({
          where: { jobId: f.job.id },
          orderBy: { number: "asc" },
        }),
      ).toMatchObject([{ outcome: "ABANDONED" }, { outcome: "SUCCEEDED" }]);
    });
    it("closes an exhausted expired claim rather than leaving it permanently processing", async () => {
      const f = await fixture();
      const service = createAIAnalysisService(db, {
        providerId: "fixture",
        model: "fixture-vision",
        monthlyRequestLimit: 10,
        leaseMs: 500,
      });
      for (let i = 0; i < 3; i++) {
        expect(await service.claimAnalysis(f.job.id)).not.toBeNull();
        await new Promise((resolve) => setTimeout(resolve, 550));
      }
      const clock = vi.spyOn(Date, "now").mockReturnValue(0);
      try {
        expect(await service.claimAnalysis(f.job.id)).toBeNull();
      } finally {
        clock.mockRestore();
      }
      expect((await service.getAnalysis({ userId: f.owner }, f.job.id)).job.status).toBe("FAILED");
      expect(await db.aIAnalysisAttempt.findMany({ where: { jobId: f.job.id } })).toHaveLength(3);
    });
    it("revalidates selected links after storage reads immediately before sending image bytes", async () => {
      const f = await fixture();
      f.read.mockImplementation(async () => {
        await db.mediaLink.delete({ where: { id: f.link.id } });
        return f.bytes;
      });
      await f.handler({ analysisJobId: f.job.id });
      expect(f.analyze).not.toHaveBeenCalled();
      expect((await f.service.getAnalysis({ userId: f.owner }, f.job.id)).job).toMatchObject({
        status: "FAILED",
        errorCode: "AI_SOURCE_NOT_AUTHORIZED",
      });
    });
    it("retains a late provider usage report without rewriting an abandoned attempt", async () => {
      const f = await fixture();
      const service = createAIAnalysisService(db, {
        providerId: "fixture",
        model: "fixture-vision",
        monthlyRequestLimit: 10,
        leaseMs: 500,
      });
      const first = await service.claimAnalysis(f.job.id);
      await new Promise((resolve) => setTimeout(resolve, 550));
      const second = await service.claimAnalysis(f.job.id);
      expect(second).not.toBeNull();
      await service.recordAnalysisUsage(first!, { inputTokens: 11, outputTokens: 4 });
      await service.recordAnalysisUsage(first!, { inputTokens: 11, outputTokens: 4 });
      await expect(
        service.recordAnalysisUsage(first!, { inputTokens: 99, outputTokens: 4 }),
      ).rejects.toMatchObject({ code: "AI_REQUEST_CONFLICT" });
      const reports = await db.$queryRaw<
        { inputTokens: number; outputTokens: number }[]
      >`SELECT "inputTokens","outputTokens" FROM "AIAnalysisUsageReport" WHERE "attemptToken"=${first!.token}::uuid`;
      expect(reports).toEqual([{ inputTokens: 11, outputTokens: 4 }]);
      expect(
        await db.aIAnalysisAttempt.findUnique({ where: { token: first!.token } }),
      ).toMatchObject({ outcome: "ABANDONED", inputTokens: null });
      await expect(
        db.$executeRaw`UPDATE "AIAnalysisUsageReport" SET "inputTokens"=99 WHERE "attemptToken"=${first!.token}::uuid`,
      ).rejects.toThrow();
    });
  },
);
