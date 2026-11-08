import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMediaAssetLocker } from "@sammlerraum/db/media-lock";
import { LocalPersistentStorage } from "@sammlerraum/storage";
import { createBillingOverviewService } from "./billing-overview";
import { createTabularExportJob } from "../../../../apps/worker/src/jobs/tabular-export-runtime";
import { createPrismaTabularExportRepository } from "../../../../apps/worker/src/jobs/tabular-export-repository";
import { createInsuranceReportJob } from "../../../../apps/worker/src/jobs/insurance-report-runtime";
import { createPrismaReportRepository } from "../../../../apps/worker/src/jobs/insurance-report-repository";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { beforeAll, afterAll, afterEach, describe, it, expect, vi } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { CreateItemInputSchema } from "@sammlerraum/contracts/items";
import { createResourceQuery } from "../api/resource-query";
import { createItemService } from "../items/item-service";
import { createMediaService } from "../media/media-service";
import { Prisma } from "@sammlerraum/db/search-sql";
import { withMarketBatch } from "../market-data/market-batch";
import { disabledSearchMarket } from "../search/search-selection";
import { createScopedSearchService } from "../search/scoped-search-service";
import { createMembershipService } from "../collaboration/membership-service";
import { createCollaborativeItemService } from "../collaboration/item-authoring-service";
import { createDashboardService } from "../dashboard/dashboard-service";
import { createValuationQuery } from "../valuations/valuation-query";
import { createImportService } from "../imports/import-service";
import { createItemSearchService } from "../search/item-search-service";
import { createRestoreService } from "../audit/restore-service";
import { createAIAnalysisService } from "../ai/ai-analysis-service";
import { createAIUsageService } from "../ai/usage-service";
import { createReportService } from "../reports/report-service";
import { createExportService } from "../exports/export-service";
import type { StorageProvider } from "@sammlerraum/storage";
const free = {
  ITEM_CREATE: 1,
  MEDIA_COUNT: 0,
  MEDIA_BYTES: 0,
  AI_MONTHLY: 1,
  IMPORT_PROFILES: 1,
  MARKET_DATA: false,
  EXTENDED_HISTORY: false,
  ADVANCED_ANALYTICS: false,
  XLSX: false,
  ADVANCED_FILTERS: false,
};
const premium = {
  ITEM_CREATE: 10,
  MEDIA_COUNT: 10,
  MEDIA_BYTES: 1000000,
  AI_MONTHLY: 10,
  IMPORT_PROFILES: 10,
  MARKET_DATA: true,
  EXTENDED_HISTORY: true,
  ADVANCED_ANALYTICS: true,
  XLSX: true,
  ADVANCED_FILTERS: true,
};
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "real server-enforced plan boundaries",
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
    afterEach(() => vi.unstubAllEnvs());
    async function fixture(paid = false) {
      vi.stubEnv("BILLING_PLAN_LIMITS", JSON.stringify({ FREE: free, PREMIUM: premium }));
      vi.stubEnv("BILLING_ENVIRONMENT", "test");
      const userId = "entitlement-" + randomUUID();
      await db.user.create({
        data: {
          id: userId,
          email: userId + "@example.invalid",
          name: "Own quota fixture",
          emailVerified: true,
        },
      });
      const collection = await db.collection.create({
          data: { ownerId: userId, name: "Quota collection" },
        }),
        item = await db.collectibleItem.create({
          data: { ownerId: userId, collectionId: collection.id, title: "Retained original" },
        });
      if (paid) {
        await db.$executeRaw`INSERT INTO "BillingAccount" ("subjectId",provider,"providerCustomerId") VALUES (${userId},'stripe_test',${"cus_" + randomUUID()})`;
        await db.$executeRaw`INSERT INTO "BillingSubscription" (id,"subjectId",provider,"providerSubscriptionId","planEligible",status,"currentPeriodStart","currentPeriodEnd","providerUpdatedAt") VALUES (${randomUUID()}::uuid,${userId},'stripe_test',${"sub_" + randomUUID()},true,'ACTIVE',${new Date(Date.now() - 1000)},${new Date(Date.now() + 3600000)},CURRENT_TIMESTAMP)`;
      }
      return { userId, collection, item };
    }
    it("blocks premium-only XLSX while leaving actual CSV export available to Free", async () => {
      const f = await fixture(),
        exports = createExportService(db),
        input = { scope: { kind: "COLLECTION", collectionId: f.collection.id }, locale: "de" };
      await expect(
        exports.requestExport({ userId: f.userId }, { ...input, format: "XLSX" }),
      ).rejects.toMatchObject({ code: "PREMIUM_REQUIRED" });
      await expect(
        exports.requestExport({ userId: f.userId }, { ...input, format: "CSV" }),
      ).resolves.toMatchObject({ status: "PENDING" });
      expect(
        await db.$queryRaw`SELECT format::text FROM "ExportJob" WHERE "ownerId"=${f.userId}`,
      ).toEqual([{ format: "CSV" }]);
    });
    it("rejects a real item insertion at the configured Free boundary without changing retained data", async () => {
      const f = await fixture();
      await expect(
        createItemService(db, f.userId).createItem(
          CreateItemInputSchema.parse({ collectionId: f.collection.id, title: "Over quota" }),
        ),
      ).rejects.toMatchObject({ code: "PLAN_LIMIT_REACHED" });
      expect(await db.collectibleItem.count({ where: { ownerId: f.userId } })).toBe(1);
    });
    it("rejects a media admission before creating an intent or writing original bytes", async () => {
      const f = await fixture(),
        written = new Map<string, Uint8Array>(),
        storage = {
          put: async (key: string, bytes: Uint8Array) => {
            written.set(key, bytes);
          },
        } as unknown as StorageProvider;
      const image = await sharp({
        create: { width: 2, height: 2, channels: 3, background: "#609060" },
      })
        .png()
        .toBuffer();
      await expect(
        createMediaService(db, storage).createImageUpload(f.userId, image, {
          fileName: "owned.png",
          claimedMime: "image/png",
        }),
      ).rejects.toMatchObject({ code: "PLAN_LIMIT_REACHED" });
      expect(written.size).toBe(0);
      expect(await db.mediaAsset.count({ where: { ownerId: f.userId } })).toBe(0);
    });
    it("permits the same paid server operations with a current local Premium subscription", async () => {
      const f = await fixture(true);
      await expect(
        createItemService(db, f.userId).createItem(
          CreateItemInputSchema.parse({
            collectionId: f.collection.id,
            title: "Permitted capacity",
          }),
        ),
      ).resolves.toMatchObject({ title: "Permitted capacity" });
      await expect(
        createExportService(db).requestExport(
          { userId: f.userId },
          {
            scope: { kind: "COLLECTION", collectionId: f.collection.id },
            locale: "de",
            format: "XLSX",
          },
        ),
      ).resolves.toMatchObject({ status: "PENDING" });
    });
    it("a downgrade blocks new excess writes while preserving existing item reads", async () => {
      const f = await fixture(true),
        items = createItemService(db, f.userId);
      await items.createItem(
        CreateItemInputSchema.parse({ collectionId: f.collection.id, title: "Preserved second" }),
      );
      await db.$executeRaw`UPDATE "BillingSubscription" SET status='CANCELED' WHERE "subjectId"=${f.userId}`;
      await expect(
        items.createItem(
          CreateItemInputSchema.parse({ collectionId: f.collection.id, title: "Blocked third" }),
        ),
      ).rejects.toMatchObject({ code: "PLAN_LIMIT_REACHED" });
      expect(await db.collectibleItem.count({ where: { ownerId: f.userId } })).toBe(2);
      await expect(createResourceQuery(db).loadItem(f.item.id)).resolves.toMatchObject({
        item: { title: "Retained original" },
      });
    });
    it("serializes concurrent item admissions at the last available slot", async () => {
      const f = await fixture();
      vi.stubEnv(
        "BILLING_PLAN_LIMITS",
        JSON.stringify({ FREE: { ...free, ITEM_CREATE: 2 }, PREMIUM: premium }),
      );
      const results = await Promise.allSettled(
        ["One", "Two"].map((title) =>
          createItemService(db, f.userId).createItem(
            CreateItemInputSchema.parse({ collectionId: f.collection.id, title }),
          ),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toMatchObject([
        { reason: { code: "PLAN_LIMIT_REACHED" } },
      ]);
      expect(await db.collectibleItem.count({ where: { ownerId: f.userId } })).toBe(2);
    });
    it("frees a slot by soft deletion and rejects restoration until another slot is freed", async () => {
      const f = await fixture(),
        who = { userId: f.userId },
        restore = createRestoreService(db),
        items = createItemService(db, f.userId);
      const deletion = await restore.softDeleteItem(who, { itemId: f.item.id }),
        preview = await restore.getRestorePreview(who, { eventId: deletion.eventId });
      const replacement = await items.createItem(
        CreateItemInputSchema.parse({ collectionId: f.collection.id, title: "Replacement" }),
      );
      await expect(
        restore.restoreItem(who, { itemId: f.item.id, ...preview.preconditions }),
      ).rejects.toMatchObject({ code: "PLAN_LIMIT_REACHED" });
      await restore.softDeleteItem(who, { itemId: replacement.id });
      await expect(
        restore.restoreItem(who, { itemId: f.item.id, ...preview.preconditions }),
      ).resolves.toBeDefined();
    });
    it("counts saved import profiles atomically, while allowing edits and reads of an existing profile", async () => {
      const f = await fixture(),
        service = createImportService(db),
        actor = { userId: f.userId },
        mapping = { schemaVersion: 1, locale: "de", columns: { title: 0 } };
      const first = await service.saveImportProfile(actor, { name: "First", mapping });
      await expect(
        service.saveImportProfile(actor, { name: "Second", mapping }),
      ).rejects.toMatchObject({ code: "PLAN_LIMIT_REACHED" });
      await expect(
        service.saveImportProfile(actor, {
          profileId: first.id,
          expectedRevision: first.revision,
          name: "Updated first",
          mapping,
        }),
      ).resolves.toMatchObject({ name: "Updated first" });
      expect((await service.listImportProfiles(actor)).profiles).toHaveLength(1);
    });
    it("preserves basic text and collection filters but rejects advanced filters on the actual search path", async () => {
      const f = await fixture(),
        service = createItemSearchService(db),
        actor = { userId: f.userId };
      expect(
        (
          await service.searchItems(actor, {
            text: "Retained",
            filter: {
              version: 1,
              root: { kind: "collection", test: { op: "eq", value: f.collection.id } },
            },
          })
        ).total,
      ).toBe(1);
      await expect(
        service.searchItems(actor, {
          filter: { version: 1, root: { kind: "acquisitionDate", test: { op: "missing" } } },
        }),
      ).rejects.toMatchObject({ code: "PREMIUM_REQUIRED" });
    });
    async function aiFixture(f: Awaited<ReturnType<typeof fixture>>) {
      const asset = await db.mediaAsset.create({
        data: {
          ownerId: f.userId,
          kind: "IMAGE",
          status: "READY",
          storageKey: "originals/" + randomUUID(),
          mimeType: "image/png",
          byteSize: 100n,
          checksumSha256: "a".repeat(64),
          originalFileName: "owned.png",
          width: 10,
          height: 10,
        },
      });
      await db.mediaVariant.create({
        data: {
          assetId: asset.id,
          name: "MEDIUM",
          storageKey: "variants/" + randomUUID(),
          mimeType: "image/webp",
          byteSize: 50n,
          checksumSha256: "b".repeat(64),
          width: 10,
          height: 10,
        },
      });
      await db.mediaLink.create({
        data: {
          assetId: asset.id,
          ownerId: f.userId,
          itemId: f.item.id,
          purpose: "GALLERY",
          position: 0,
        },
      });
      return {
        asset,
        service: createAIAnalysisService(db, {
          providerId: "fixture",
          model: "fixture",
          monthlyRequestLimit: 10,
        }),
      };
    }
    it("enforces the plan AI allowance before queueing and preserves exact-request retries", async () => {
      const f = await fixture(),
        a = await aiFixture(f),
        actor = { userId: f.userId },
        key = randomUUID();
      const first = await a.service.requestItemAnalysis(actor, f.item.id, [a.asset.id], key);
      await expect(
        a.service.requestItemAnalysis(actor, f.item.id, [a.asset.id], key),
      ).resolves.toMatchObject({ id: first.id });
      await expect(
        a.service.requestItemAnalysis(actor, f.item.id, [a.asset.id], randomUUID()),
      ).rejects.toMatchObject({ code: "PLAN_LIMIT_REACHED" });
      expect(
        await db.$queryRaw`SELECT count(*)::int AS count FROM "AIAnalysisAdmission" WHERE "ownerId"=${f.userId}`,
      ).toEqual([{ count: 1 }]);
    });
    it("retains monthly AI consumption after physical collection erasure and removes it with the actual account", async () => {
      const f = await fixture(),
        a = await aiFixture(f);
      await a.service.requestItemAnalysis(
        { userId: f.userId },
        f.item.id,
        [a.asset.id],
        randomUUID(),
      );
      await db.collection.delete({ where: { id: f.collection.id } });
      expect(
        await db.$queryRaw`SELECT count(*)::int AS count FROM "AIAnalysisAdmission" WHERE "ownerId"=${f.userId}`,
      ).toEqual([{ count: 1 }]);
      const usage = await createAIUsageService(db).getAIUsage(
        f.userId,
        new Date().toISOString().slice(0, 7),
      );
      expect(usage).toMatchObject({ requests: 0, admittedRequests: 1 });
      const collection = await db.collection.create({
          data: { ownerId: f.userId, name: "New empty collection" },
        }),
        item = await db.collectibleItem.create({
          data: { ownerId: f.userId, collectionId: collection.id, title: "Other" },
        }),
        next = { ...f, collection, item },
        b = await aiFixture(next);
      await expect(
        b.service.requestItemAnalysis({ userId: f.userId }, item.id, [b.asset.id], randomUUID()),
      ).rejects.toMatchObject({ code: "PLAN_LIMIT_REACHED" });
      await db.collection.delete({ where: { id: collection.id } });
      await db.mediaVariant.deleteMany({ where: { asset: { ownerId: f.userId } } });
      await db.mediaAsset.deleteMany({ where: { ownerId: f.userId } });
      await db.user.delete({ where: { id: f.userId } });
      expect(
        await db.$queryRaw`SELECT count(*)::int AS count FROM "AIAnalysisAdmission" WHERE "ownerId"=${f.userId}`,
      ).toEqual([{ count: 0 }]);
    });

    it("keeps the basic dashboard usable without returning premium analyses or fake zeros", async () => {
      const f = await fixture(),
        data = await createDashboardService(db).getDashboard({ userId: f.userId }, {});
      expect(data).toMatchObject({
        advancedAnalytics: "PREMIUM_REQUIRED",
        selection: { itemCount: 1 },
        manualChange: null,
        condition: null,
        grading: null,
        topCollections: null,
      });
      expect(data.recentAdditions.items).toHaveLength(1);
    });
    it("retains manual value reads but rejects explicitly requested historical mappings on Free", async () => {
      const f = await fixture(),
        service = createValuationQuery(db);
      await expect(
        service.getItemValuationSummary(f.item.id, { userId: f.userId }),
      ).resolves.toBeDefined();
      await expect(
        service.getItemValuationSummary(
          f.item.id,
          { userId: f.userId },
          { scope: "HISTORICAL_MAPPING" },
        ),
      ).rejects.toMatchObject({ code: "PREMIUM_REQUIRED" });
    });

    it("charges the collection owner allowance, not an Editor personal Premium allowance", async () => {
      const owner = await fixture(),
        editor = await fixture(true),
        members = createMembershipService(db);
      await members.addMember(
        { userId: owner.userId },
        {
          collectionId: owner.collection.id,
          userId: editor.userId,
          role: "EDITOR",
          expectedRevision: 0,
        },
      );
      await expect(
        createCollaborativeItemService(db, editor.userId).createItem({
          collectionId: owner.collection.id,
          title: "Actor must not pay for owner",
        }),
      ).rejects.toMatchObject({ code: "PLAN_LIMIT_REACHED" });
      expect(await db.collectibleItem.count({ where: { collectionId: owner.collection.id } })).toBe(
        1,
      );
    });
    it("rejects an incoming ownership transfer beyond recipient item capacity without partial changes", async () => {
      const source = await fixture(true),
        recipient = await fixture(),
        members = createMembershipService(db);
      await members.addMember(
        { userId: source.userId },
        {
          collectionId: source.collection.id,
          userId: recipient.userId,
          role: "EDITOR",
          expectedRevision: 0,
        },
      );
      await expect(
        members.transferOwnership(
          { userId: source.userId },
          {
            collectionId: source.collection.id,
            newOwnerId: recipient.userId,
            expectedRevision: 1,
            confirmPrivateTransfer: true,
          },
        ),
      ).rejects.toMatchObject({ code: "PLAN_LIMIT_REACHED" });
      expect(
        (await db.collection.findUniqueOrThrow({ where: { id: source.collection.id } })).ownerId,
      ).toBe(source.userId);
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: source.item.id } })).ownerId,
      ).toBe(source.userId);
    });
    it("serializes image count and byte admissions before writing either original", async () => {
      const f = await fixture(),
        image = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#709070" } })
          .png()
          .toBuffer(),
        written = new Map<string, Uint8Array>();
      vi.stubEnv(
        "BILLING_PLAN_LIMITS",
        JSON.stringify({
          FREE: { ...free, MEDIA_COUNT: 1, MEDIA_BYTES: image.length },
          PREMIUM: premium,
        }),
      );
      const service = createMediaService(db, {
        put: async (key: string, bytes: Uint8Array) => {
          written.set(key, bytes);
        },
      } as unknown as StorageProvider);
      const results = await Promise.allSettled(
        [1, 2].map(() =>
          service.createImageUpload(f.userId, image, {
            fileName: "owned.png",
            claimedMime: "image/png",
          }),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toMatchObject([
        { reason: { code: "PLAN_LIMIT_REACHED" } },
      ]);
      expect(written.size).toBe(1);
      expect(await db.mediaAsset.count({ where: { ownerId: f.userId } })).toBe(1);
    });
    it("checks the exact decoded image byte size even when the count allowance is available", async () => {
      const f = await fixture(),
        image = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#909070" } })
          .png()
          .toBuffer(),
        put = vi.fn(async () => {});
      vi.stubEnv(
        "BILLING_PLAN_LIMITS",
        JSON.stringify({
          FREE: { ...free, MEDIA_COUNT: 2, MEDIA_BYTES: image.length - 1 },
          PREMIUM: premium,
        }),
      );
      await expect(
        createMediaService(db, { put } as unknown as StorageProvider).createImageUpload(
          f.userId,
          image,
          { fileName: "owned.png", claimedMime: "image/png" },
        ),
      ).rejects.toMatchObject({ code: "PLAN_LIMIT_REACHED" });
      expect(put).not.toHaveBeenCalled();
      expect(await db.mediaAsset.count({ where: { ownerId: f.userId } })).toBe(0);
    });
    it("requires a market entitlement separately from actual provider redistribution rights", async () => {
      const f = await fixture(),
        selector = {
          mode: "CURRENT_ITEM_MAPPING",
          providerId: "fixture",
          identifierNamespace: "fixture",
          identifierType: "product",
          kind: "LAST_SOLD",
          sourceMetric: "sold_item",
          qualifiers: {},
          currency: "EUR",
          minorUnitExponent: 2,
        } as const;
      await expect(
        db.$transaction((tx) =>
          withMarketBatch(
            {
              tx,
              scope: { actorUserId: f.userId, lifecycle: "ACTIVE" },
              ownedCandidates: Prisma.sql`SELECT id FROM "CollectibleItem" WHERE false`,
              checkBudget: () => {},
            },
            [selector],
            { purpose: "FILTER" },
            disabledSearchMarket,
            async () => true,
          ),
        ),
      ).rejects.toMatchObject({ code: "PREMIUM_REQUIRED" });
    });

    it("prevents the member-scoped search route from bypassing advanced-filter entitlements", async () => {
      const owner = await fixture(true),
        member = await fixture(),
        members = createMembershipService(db);
      await members.addMember(
        { userId: owner.userId },
        {
          collectionId: owner.collection.id,
          userId: member.userId,
          role: "EDITOR",
          expectedRevision: 0,
        },
      );
      await expect(
        createScopedSearchService(db).search(
          { userId: member.userId },
          { kind: "MEMBER_COLLECTION", collectionId: owner.collection.id },
          { filter: { version: 1, root: { kind: "acquisitionDate", test: { op: "missing" } } } },
        ),
      ).rejects.toMatchObject({ code: "PREMIUM_REQUIRED" });
    });
    it("preserves actual collaborator authorship when the collection owner has sufficient Premium capacity", async () => {
      const owner = await fixture(true),
        editor = await fixture(),
        members = createMembershipService(db);
      await members.addMember(
        { userId: owner.userId },
        {
          collectionId: owner.collection.id,
          userId: editor.userId,
          role: "EDITOR",
          expectedRevision: 0,
        },
      );
      const item = await createCollaborativeItemService(db, editor.userId).createItem({
        collectionId: owner.collection.id,
        title: "Owned budget, real Editor",
      });
      const [audit] = await db.$queryRaw<
        { actorId: string }[]
      >`SELECT "actorId" FROM "AuditEvent" WHERE "resourceId"=${item.id}::uuid AND action='ITEM_CREATED'`;
      expect(audit?.actorId).toBe(editor.userId);
    });
    it("checks recipient original media capacity during a transfer even with item capacity remaining", async () => {
      const source = await fixture(true),
        recipient = await fixture(),
        photo = await aiFixture(source),
        members = createMembershipService(db);
      vi.stubEnv(
        "BILLING_PLAN_LIMITS",
        JSON.stringify({ FREE: { ...free, ITEM_CREATE: 5 }, PREMIUM: premium }),
      );
      await members.addMember(
        { userId: source.userId },
        {
          collectionId: source.collection.id,
          userId: recipient.userId,
          role: "EDITOR",
          expectedRevision: 0,
        },
      );
      await expect(
        members.transferOwnership(
          { userId: source.userId },
          {
            collectionId: source.collection.id,
            newOwnerId: recipient.userId,
            expectedRevision: 1,
            confirmPrivateTransfer: true,
          },
        ),
      ).rejects.toMatchObject({ code: "PLAN_LIMIT_REACHED" });
      expect(
        (await db.mediaAsset.findUniqueOrThrow({ where: { id: photo.asset.id } })).ownerId,
      ).toBe(source.userId);
    });
    it("rejects advanced-filter Free export and report before creating jobs or artifacts", async () => {
      const f = await fixture();
      const input = {
        scope: { kind: "ALL" },
        locale: "de",
        query: {
          filter: { version: 1, root: { kind: "acquisitionDate", test: { op: "missing" } } },
        },
      };
      await expect(
        createExportService(db).requestExport({ userId: f.userId }, { ...input, format: "CSV" }),
      ).rejects.toMatchObject({ code: "PREMIUM_REQUIRED" });
      await expect(
        createReportService(db).requestInsuranceReport({ userId: f.userId }, input),
      ).rejects.toMatchObject({ code: "PREMIUM_REQUIRED" });
      expect(await db.exportJob.count({ where: { ownerId: f.userId } })).toBe(0);
      expect(await db.reportJob.count({ where: { ownerId: f.userId } })).toBe(0);
      expect(await db.mediaAsset.count({ where: { ownerId: f.userId } })).toBe(0);
    });
    it.each(["TABULAR", "REPORT"] as const)(
      "completes an admitted %s after downgrade, without consuming original-upload capacity",
      async (kind) => {
        const f = await fixture(true),
          actor = { userId: f.userId };
        const exports = createExportService(db),
          reports = createReportService(db);
        const input = {
          scope: { kind: "ALL" },
          locale: "de",
          query: {
            filter: { version: 1, root: { kind: "acquisitionDate", test: { op: "missing" } } },
          },
        };
        const job =
          kind === "TABULAR"
            ? await exports.requestExport(actor, { ...input, format: "XLSX" })
            : await reports.requestInsuranceReport(actor, input);
        await db.$executeRaw`UPDATE "BillingSubscription" SET status='CANCELED' WHERE "subjectId"=${f.userId}`;
        const folder = await mkdtemp(join(tmpdir(), "billing-artifact-")),
          lock = createMediaAssetLocker(isolated.databaseUrl),
          storage = new LocalPersistentStorage(folder, lock);
        try {
          if (kind === "TABULAR")
            await createTabularExportJob(
              createPrismaTabularExportRepository(db),
              exports,
              storage,
              lock,
            )({ jobId: job.id });
          else
            await createInsuranceReportJob(
              createPrismaReportRepository(db),
              reports,
              storage,
              lock,
            )({ jobId: job.id });
          const row =
            kind === "TABULAR"
              ? await db.exportJob.findUniqueOrThrow({ where: { id: job.id } })
              : await db.reportJob.findUniqueOrThrow({ where: { id: job.id } });
          expect(row.status).toBe("READY");
          const artifact = await db.mediaAsset.findUniqueOrThrow({
            where: { id: row.artifactId! },
          });
          expect(
            Buffer.from(
              await storage.read(artifact.storageKey, { maxBytes: Number(artifact.byteSize) }),
            ),
          ).toHaveLength(Number(artifact.byteSize));
          expect(artifact.byteSize).toBeGreaterThan(0n);
          expect(
            (
              await createBillingOverviewService(
                db,
                { FREE: free, PREMIUM: premium },
                { providerIds: ["stripe_test"] },
              ).getOverview(f.userId)
            ).usage,
          ).toMatchObject({ MEDIA_COUNT: "0", MEDIA_BYTES: "0" });
          const policy = {
            FREE: { ...free, MEDIA_COUNT: 1, MEDIA_BYTES: 100000 },
            PREMIUM: premium,
          };
          vi.stubEnv("BILLING_PLAN_LIMITS", JSON.stringify(policy));
          const image = await sharp({
            create: { width: 2, height: 2, channels: 3, background: "#609060" },
          })
            .png()
            .toBuffer();
          await expect(
            createMediaService(db, storage).createImageUpload(f.userId, image, {
              fileName: "owned.png",
              claimedMime: "image/png",
            }),
          ).resolves.toBeDefined();
        } finally {
          await rm(folder, { recursive: true, force: true });
        }
      },
    );
    it("generated basic CSV leaves original upload usage at zero", async () => {
      const f = await fixture(),
        actor = { userId: f.userId },
        service = createExportService(db);
      const job = await service.requestExport(actor, {
        scope: { kind: "ALL" },
        locale: "en",
        format: "CSV",
      });
      const folder = await mkdtemp(join(tmpdir(), "billing-csv-")),
        lock = createMediaAssetLocker(isolated.databaseUrl),
        storage = new LocalPersistentStorage(folder, lock);
      try {
        await expect(
          createTabularExportJob(
            createPrismaTabularExportRepository(db),
            service,
            {
              ...storage,
              put: async () => {
                throw Error("Owned synthetic storage failure");
              },
            } as unknown as StorageProvider,
            lock,
          )({ jobId: job.id }),
        ).rejects.toThrow("Export temporarily unavailable");
        await createTabularExportJob(
          createPrismaTabularExportRepository(db),
          service,
          storage,
          lock,
        )({ jobId: job.id });
        expect(await db.mediaAsset.count({ where: { ownerId: f.userId } })).toBe(2);
        expect((await db.exportJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe(
          "READY",
        );
        expect(
          (
            await createBillingOverviewService(
              db,
              { FREE: free, PREMIUM: premium },
              { providerIds: ["stripe_test"] },
            ).getOverview(f.userId)
          ).usage,
        ).toMatchObject({ MEDIA_COUNT: "0", MEDIA_BYTES: "0" });
      } finally {
        await rm(folder, { recursive: true, force: true });
      }
    });
    it("a retained artifact admission cannot authorize another owner, changed query or an unadmitted job", async () => {
      const f = await fixture(true),
        foreign = await fixture(),
        service = createExportService(db),
        actor = { userId: f.userId };
      const job = await service.requestExport(actor, {
        scope: { kind: "ALL" },
        locale: "de",
        format: "CSV",
        query: {
          filter: { version: 1, root: { kind: "acquisitionDate", test: { op: "missing" } } },
        },
      });
      const row = await db.exportJob.findUniqueOrThrow({ where: { id: job.id } });
      await db.$executeRaw`UPDATE "BillingSubscription" SET status='CANCELED' WHERE "subjectId"=${f.userId}`;
      const permit = { kind: "TABULAR" as const, jobId: job.id, request: row.request };
      await expect(
        service.captureExportSource({ userId: foreign.userId }, row.request, permit),
      ).rejects.toMatchObject({ code: "PREMIUM_REQUIRED" });
      await expect(
        service.captureExportSource(
          actor,
          {
            ...(row.request as object),
            query: {
              filter: { version: 1, root: { kind: "acquisitionDate", test: { op: "present" } } },
            },
          },
          permit,
        ),
      ).rejects.toBeDefined();
      await db.$executeRaw`UPDATE "ExportJob" SET "billingAdmitted"=false WHERE id=${job.id}::uuid`;
      await expect(service.captureExportSource(actor, row.request, permit)).rejects.toMatchObject({
        code: "PREMIUM_REQUIRED",
      });
    });
    it("does not charge generated document originals during an otherwise authorized ownership transfer", async () => {
      const source = await fixture(true),
        recipient = await fixture(),
        members = createMembershipService(db),
        assetId = randomUUID();
      vi.stubEnv(
        "BILLING_PLAN_LIMITS",
        JSON.stringify({ FREE: { ...free, ITEM_CREATE: 10 }, PREMIUM: premium }),
      );
      await db.$executeRaw`INSERT INTO "MediaAsset" (id,"ownerId",kind,status,"storageKey","mimeType","byteSize","checksumSha256","originalFileName","generatedArtifact","updatedAt") VALUES (${assetId}::uuid,${source.userId},'DOCUMENT','READY',${"reports/" + randomUUID()},'application/pdf',500,${"a".repeat(64)},'retained.pdf',true,now())`;
      await db.documentLink.create({
        data: {
          ownerId: source.userId,
          itemId: source.item.id,
          assetId,
          category: "OTHER_PRIVATE",
          visibility: "PRIVATE",
          position: 0,
        },
      });
      await members.addMember(
        { userId: source.userId },
        {
          collectionId: source.collection.id,
          userId: recipient.userId,
          role: "EDITOR",
          expectedRevision: 0,
        },
      );
      await expect(
        members.transferOwnership(
          { userId: source.userId },
          {
            collectionId: source.collection.id,
            newOwnerId: recipient.userId,
            expectedRevision: 1,
            confirmPrivateTransfer: true,
          },
        ),
      ).resolves.toBeDefined();
      expect(
        (
          await createBillingOverviewService(
            db,
            { FREE: free, PREMIUM: premium },
            { providerIds: ["stripe_test"] },
          ).getOverview(recipient.userId)
        ).usage,
      ).toMatchObject({ MEDIA_COUNT: "0", MEDIA_BYTES: "0" });
    });
  },
);
