import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createAIAnalysisService } from "./ai-analysis-service";
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual private analysis capture and usage",
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
      const who = `AI-Usage-${randomUUID()}`;
      await db.user.create({
        data: {
          id: who,
          email: `${who}@example.invalid`,
          emailVerified: true,
          name: "Owned fixture",
        },
      });
      const collection = await db.collection.create({
          data: { ownerId: who, name: "Owned capture" },
        }),
        item = await db.collectibleItem.create({
          data: { ownerId: who, collectionId: collection.id, title: "Private collectible" },
        });
      const asset = await db.mediaAsset.create({
        data: {
          ownerId: who,
          kind: "IMAGE",
          status: "READY",
          storageKey: `private/${randomUUID()}`,
          mimeType: "image/png",
          byteSize: 100n,
          checksumSha256: "a".repeat(64),
          originalFileName: "private-name.png",
        },
      });
      await db.mediaVariant.create({
        data: {
          assetId: asset.id,
          name: "MEDIUM",
          storageKey: `private-display/${randomUUID()}`,
          mimeType: "image/webp",
          byteSize: 50n,
          checksumSha256: "b".repeat(64),
          width: 10,
          height: 10,
        },
      });
      await db.mediaLink.create({
        data: { assetId: asset.id, itemId: item.id, ownerId: who, purpose: "GALLERY", position: 0 },
      });
      const service = createAIAnalysisService(db, {
          providerId: "fixture",
          model: "fixture",
          monthlyRequestLimit: 10,
        }),
        job = await service.requestItemAnalysis({ userId: who }, item.id, [asset.id], randomUUID());
      const path = "./usage-service",
        module = await import(path).catch(() => null);
      expect(module?.createAIUsageService).toBeTypeOf("function");
      return {
        who,
        actor: { userId: who },
        item,
        asset,
        service,
        job,
        usage: module!.createAIUsageService(db),
        period: new Date().toISOString().slice(0, 7),
      };
    }
    it("counts one admitted request once while retaining known and unknown provider token counts", async () => {
      const f = await fixture(),
        claim = await f.service.claimAnalysis(f.job.id);
      await f.service.recordAnalysisUsage(claim!, { inputTokens: 12, outputTokens: null });
      await f.service.failAnalysis(claim!, "AI_RESPONSE_REFUSED", false, {
        inputTokens: 12,
        outputTokens: null,
      });
      const result = await f.usage.getAIUsage(f.who, f.period);
      expect(result).toMatchObject({
        period: f.period,
        requests: 1,
        failed: 1,
        completed: 0,
        attempts: 1,
        inputTokens: "12",
        outputTokens: null,
        unknownInputAttempts: 0,
        unknownOutputAttempts: 1,
      });
      expect(JSON.stringify(result)).not.toMatch(
        /storageKey|private-name|private-display|requesterId|payload|model/,
      );
      await expect(f.usage.getAIUsage(f.who.toLowerCase(), f.period)).rejects.toMatchObject({
        code: "AI_ITEM_NOT_FOUND",
      });
      await expect(f.usage.getAIUsage(f.who, "2026-13")).rejects.toMatchObject({
        code: "AI_INVALID_REQUEST",
      });
    });
    it("lists only usable display images and resumes only the actual owner's most recent job", async () => {
      const f = await fixture();
      const capture = await f.service.getCapture(f.actor, f.item.id);
      expect(capture.photos).toEqual([{ assetId: f.asset.id }]);
      expect(capture.latestJob!.id).toBe(f.job.id);
      expect(JSON.stringify(capture)).not.toMatch(/private-name|storageKey|checksum|leaseToken/);
      await expect(
        f.service.getCapture({ userId: "foreign-user" }, f.item.id),
      ).rejects.toMatchObject({ code: "AI_ITEM_NOT_FOUND" });
    });
    it("cancels a live analysis without changing the item and retains late reported usage", async () => {
      const f = await fixture(),
        before = await db.collectibleItem.findUnique({ where: { id: f.item.id } }),
        claim = await f.service.claimAnalysis(f.job.id);
      expect((await f.service.cancelAnalysis(f.actor, f.job.id)).status).toBe("CANCELLED");
      expect(await f.service.recordAnalysisUsage(claim!, { inputTokens: 8, outputTokens: 2 })).toBe(
        true,
      );
      await expect(f.service.renewAnalysis(claim!)).rejects.toMatchObject({ code: "AI_STALE_JOB" });
      expect(await f.service.failAnalysis(claim!, "AI_PROVIDER_UNAVAILABLE", true)).toBe(false);
      expect(await db.collectibleItem.findUnique({ where: { id: f.item.id } })).toEqual(before);
      expect(await f.usage.getAIUsage(f.who, f.period)).toMatchObject({
        requests: 1,
        cancelled: 1,
        attempts: 1,
        inputTokens: "8",
        outputTokens: "2",
      });
    });
  },
);
