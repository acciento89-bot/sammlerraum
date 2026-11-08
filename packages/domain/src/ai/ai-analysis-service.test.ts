import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";

describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "provider-neutral owned photo analysis",
  () => {
    let db: ReturnType<typeof createTestDatabaseClient>;
    let isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    async function fixture(monthlyRequestLimit = 10) {
      const owner = `AI-Owner-${randomUUID()}`,
        foreign = `AI-Foreign-${randomUUID()}`;
      for (const id of [owner, foreign])
        await db.user.create({
          data: {
            id,
            email: `${id}@example.invalid`,
            name: "AI owned fixture",
            emailVerified: true,
          },
        });
      const collection = await db.collection.create({
        data: { ownerId: owner, name: "Photo capture" },
      });
      const item = await db.collectibleItem.create({
        data: { ownerId: owner, collectionId: collection.id, title: "Original ceramic" },
      });
      async function asset(actor = owner, kind: "IMAGE" | "DOCUMENT" = "IMAGE") {
        const row = await db.mediaAsset.create({
          data: {
            ownerId: actor,
            kind,
            status: "READY",
            storageKey: `originals/${randomUUID()}`,
            mimeType: kind === "IMAGE" ? "image/png" : "application/pdf",
            byteSize: 100n,
            checksumSha256: "a".repeat(64),
            originalFileName: "private-source-filename",
            width: 10,
            height: 10,
          },
        });
        if (kind === "IMAGE")
          await db.mediaVariant.create({
            data: {
              assetId: row.id,
              name: "MEDIUM",
              storageKey: `variants/${randomUUID()}`,
              mimeType: "image/webp",
              byteSize: 50n,
              checksumSha256: "b".repeat(64),
              width: 10,
              height: 10,
            },
          });
        return row;
      }
      const image = await asset();
      const link = await db.mediaLink.create({
        data: {
          assetId: image.id,
          ownerId: owner,
          itemId: item.id,
          purpose: "GALLERY",
          position: 0,
        },
      });
      const path = "./ai-analysis-service";
      const module = await import(path).catch(() => null);
      expect(module?.createAIAnalysisService, "real analysis service must exist").toBeTypeOf(
        "function",
      );
      const service = module!.createAIAnalysisService(db, {
        providerId: "fixture",
        model: "fixture-vision",
        monthlyRequestLimit,
      });
      return {
        owner,
        foreign,
        actor: { userId: owner },
        collection,
        item,
        image,
        link,
        asset,
        service,
      };
    }
    const valid = {
      categoryKey: null,
      title: "Suggested ceramic",
      manufacturer: "Example maker",
      seriesOrSet: "Collector set",
      year: 2020,
      identifiers: [{ type: "MARKING", value: "A-100" }],
      catalogCandidates: [],
      warnings: ["Review the visible markings yourself."],
    };
    it("stores one immutable suggestion without changing the actual item", async () => {
      const f = await fixture();
      const before = await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item.id } });
      const queued = await f.service.requestItemAnalysis(
        f.actor,
        f.item.id,
        [f.image.id],
        randomUUID(),
      );
      expect(queued.status).toBe("PENDING");
      expect(JSON.stringify(queued)).not.toMatch(
        /storageKey|checksum|ownerId|token|private-source-filename/i,
      );
      const claim = await f.service.claimAnalysis(queued.id);
      expect(claim).not.toBeNull();
      await f.service.storeAnalysisResult(claim, valid, { inputTokens: 25, outputTokens: 10 });
      expect(await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item.id } })).toEqual(
        before,
      );
      expect((await f.service.getAnalysis(f.actor, queued.id)).analysis).toEqual(valid);
      const rows = await db.$queryRaw<
        { count: bigint }[]
      >`SELECT count(*) AS count FROM "AIAnalysisSuggestion" WHERE "jobId"=${queued.id}::uuid`;
      expect(rows[0]!.count).toBe(1n);
      expect(await f.service.claimAnalysis(queued.id)).toBeNull();
      await expect(
        db.$executeRaw`UPDATE "AIAnalysisSuggestion" SET payload='{}'::jsonb WHERE "jobId"=${queued.id}::uuid`,
      ).rejects.toThrow();
    });
    it("binds the request nonce to its selected sources and reserves quota only once", async () => {
      const f = await fixture(1),
        key = randomUUID();
      const a = await f.service.requestItemAnalysis(f.actor, f.item.id, [f.image.id], key);
      const b = await f.service.requestItemAnalysis(f.actor, f.item.id, [f.image.id], key);
      expect(b.id).toBe(a.id);
      await expect(
        f.service.requestItemAnalysis(f.actor, f.item.id, [f.image.id], randomUUID()),
      ).rejects.toMatchObject({ code: "AI_LIMIT_REACHED" });
      const second = await f.asset();
      await db.mediaLink.create({
        data: {
          assetId: second.id,
          ownerId: f.owner,
          itemId: f.item.id,
          purpose: "GALLERY",
          position: 1,
        },
      });
      await expect(
        f.service.requestItemAnalysis(f.actor, f.item.id, [second.id], key),
      ).rejects.toMatchObject({ code: "AI_REQUEST_CONFLICT" });
      await expect(
        db.$executeRaw`UPDATE "AIAnalysisJob" SET sources='[]'::jsonb WHERE id=${a.id}::uuid`,
      ).rejects.toThrow();
    });
    it("never accepts another owner's item, an unlinked photo or a document source", async () => {
      const f = await fixture(),
        extra = await f.asset(),
        document = await f.asset(f.owner, "DOCUMENT");
      await expect(
        f.service.requestItemAnalysis({ userId: f.foreign }, f.item.id, [f.image.id], randomUUID()),
      ).rejects.toMatchObject({ code: "AI_ITEM_NOT_FOUND" });
      for (const id of [extra.id, document.id])
        await expect(
          f.service.requestItemAnalysis(f.actor, f.item.id, [id], randomUUID()),
        ).rejects.toMatchObject({ code: "AI_SOURCE_NOT_AUTHORIZED" });
      const count = await db.$queryRaw<
        { count: bigint }[]
      >`SELECT count(*) AS count FROM "AIAnalysisJob" WHERE "requesterId"=${f.owner}`;
      expect(count[0]!.count).toBe(0n);
    });
    it("rejects untrusted response fields and revoked sources before result persistence", async () => {
      const f = await fixture();
      const job = await f.service.requestItemAnalysis(
        f.actor,
        f.item.id,
        [f.image.id],
        randomUUID(),
      );
      const claim = await f.service.claimAnalysis(job.id);
      await expect(
        f.service.storeAnalysisResult(claim, { ...valid, authenticity: "genuine" }),
      ).rejects.toMatchObject({ code: "AI_INVALID_RESPONSE" });
      await db.mediaLink.delete({ where: { id: f.link.id } });
      await expect(f.service.storeAnalysisResult(claim, valid)).rejects.toMatchObject({
        code: "AI_SOURCE_NOT_AUTHORIZED",
      });
      expect((await f.service.getAnalysis(f.actor, job.id)).analysis).toBeNull();
      await expect(f.service.getAnalysis({ userId: f.foreign }, job.id)).rejects.toMatchObject({
        code: "AI_ITEM_NOT_FOUND",
      });
    });
    it("serializes concurrent quota reservations for the same actual owner", async () => {
      const f = await fixture(1);
      const outcomes = await Promise.allSettled(
        [randomUUID(), randomUUID()].map((key) =>
          f.service.requestItemAnalysis(f.actor, f.item.id, [f.image.id], key),
        ),
      );
      expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.status === "rejected")).toMatchObject([
        { reason: { code: "AI_LIMIT_REACHED" } },
      ]);
    });
    it("keeps completed suggestions compatible with actual owner collection erasure", async () => {
      const f = await fixture();
      const job = await f.service.requestItemAnalysis(
        f.actor,
        f.item.id,
        [f.image.id],
        randomUUID(),
      );
      const claim = await f.service.claimAnalysis(job.id);
      await f.service.storeAnalysisResult(claim, valid);
      await db.collection.delete({ where: { id: f.collection.id } });
      const rows = await db.$queryRaw<
        { count: bigint }[]
      >`SELECT count(*) AS count FROM "AIAnalysisSuggestion" WHERE "jobId"=${job.id}::uuid`;
      expect(rows[0]!.count).toBe(0n);
    });
    it("round-trips a near-limit valid payload without confusing compact JSON and JSONB formatting", async () => {
      const f = await fixture();
      const job = await f.service.requestItemAnalysis(
        f.actor,
        f.item.id,
        [f.image.id],
        randomUUID(),
      );
      const claim = await f.service.claimAnalysis(job.id);
      const large = {
        ...valid,
        title: "字".repeat(200),
        manufacturer: "字".repeat(200),
        seriesOrSet: "字".repeat(200),
        identifiers: Array.from({ length: 20 }, () => ({
          type: "類".repeat(32),
          value: "字".repeat(512),
        })),
        warnings: Array.from({ length: 20 }, () => "字".repeat(512)),
      };
      while (Buffer.byteLength(JSON.stringify(large)) > 65500)
        large.identifiers[0]!.value = large.identifiers[0]!.value.slice(1);
      expect(Buffer.byteLength(JSON.stringify(large))).toBeGreaterThan(65000);
      const [size] = await db.$queryRaw<
        { bytes: number }[]
      >`SELECT octet_length(${JSON.stringify(large)}::jsonb::text) AS bytes`;
      console.info("AI_BOUNDARY_BYTES", {
        compact: Buffer.byteLength(JSON.stringify(large)),
        jsonb: size!.bytes,
      });
      expect(size!.bytes).toBeGreaterThan(65536);
      await f.service.storeAnalysisResult(claim, large);
      const result = await f.service.getAnalysis(f.actor, job.id);
      expect(Buffer.byteLength(JSON.stringify(result.analysis))).toBe(
        Buffer.byteLength(JSON.stringify(large)),
      );
    });

    it("timestamps quota admission after actual user-lock waiting rather than transaction start", async () => {
      const f = await fixture();
      let locked!: () => void, release!: () => void;
      const waiting = new Promise<void>((resolve) => {
          locked = resolve;
        }),
        held = new Promise<void>((resolve) => {
          release = resolve;
        });
      const blocker = db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "user" WHERE id=${f.owner} FOR UPDATE`;
          locked();
          await held;
          const [row] = await tx.$queryRaw<
            { at: Date }[]
          >`SELECT date_trunc('milliseconds',clock_timestamp() AT TIME ZONE 'UTC') AS at`;
          return row!.at;
        },
        { timeout: 3000 },
      );
      await waiting;
      const admitted = f.service.requestItemAnalysis(
        f.actor,
        f.item.id,
        [f.image.id],
        randomUUID(),
      );
      void admitted.catch(() => {});
      try {
        await vi.waitFor(
          async () => {
            const [row] = await db.$queryRaw<
              { count: bigint }[]
            >`SELECT count(*) AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FROM "user"%'`;
            expect(row!.count).toBeGreaterThan(0n);
          },
          { timeout: 1000, interval: 20 },
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      } finally {
        release();
      }
      const lowerBound = await blocker,
        job = await admitted;
      expect(new Date(job.createdAt).valueOf()).toBeGreaterThanOrEqual(lowerBound.valueOf());
      await expect(
        f.service.getAnalysis({ userId: f.owner.toLowerCase() }, job.id),
      ).rejects.toMatchObject({ code: "AI_ITEM_NOT_FOUND" });
    });
  },
);
