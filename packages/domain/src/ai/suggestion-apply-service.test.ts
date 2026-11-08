import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createAIAnalysisService } from "./ai-analysis-service";
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual field-by-field AI confirmation",
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
    async function fixture(
      options: {
        noModelCandidates?: boolean;
        badIdentifier?: boolean;
        useCatalogTitle?: boolean;
        visibleCode?: string;
      } = {},
    ) {
      const owner = `ai-confirm-${randomUUID()}`;
      await db.user.create({
        data: {
          id: owner,
          email: `${owner}@example.invalid`,
          name: "Own fixture",
          emailVerified: true,
        },
      });
      const collection = await db.collection.create({
          data: { ownerId: owner, name: "Own metadata" },
        }),
        item = await db.collectibleItem.create({
          data: { ownerId: owner, collectionId: collection.id, title: "Original title" },
        });
      const category = await db.categoryTemplate.create({
        data: { key: `ai_${randomUUID().replaceAll("-", "")}` },
      });
      const entry = await db.catalogEntry.create({
        data: {
          categoryTemplateId: category.id,
          authored: {
            text: { language: "de", title: `Public reference ${randomUUID()}`, translations: [] },
            sources: [],
          },
        },
      });
      const fields = [];
      for (const [name, type] of [
        ["Maker", "SHORT_TEXT"],
        ["Series", "SHORT_TEXT"],
        ["Year", "INTEGER"],
      ] as const)
        fields.push(
          await db.customFieldDefinition.create({
            data: { collectionId: collection.id, name, normalizedName: name.toLowerCase(), type },
          }),
        );
      await db.customFieldValue.create({
        data: {
          itemId: item.id,
          collectionId: collection.id,
          fieldDefinitionId: fields[0]!.id,
          fieldType: "SHORT_TEXT",
          shortTextValue: "Original maker",
        },
      });
      await db.itemIdentifier.create({
        data: { itemId: item.id, type: "SERIAL", value: "Original", normalizedValue: "original" },
      });
      const asset = await db.mediaAsset.create({
        data: {
          ownerId: owner,
          kind: "IMAGE",
          status: "READY",
          storageKey: `source/${randomUUID()}`,
          mimeType: "image/png",
          byteSize: 100n,
          checksumSha256: "a".repeat(64),
          originalFileName: "private.png",
        },
      });
      await db.mediaVariant.create({
        data: {
          assetId: asset.id,
          name: "MEDIUM",
          storageKey: `display/${randomUUID()}`,
          mimeType: "image/webp",
          byteSize: 50n,
          checksumSha256: "b".repeat(64),
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
      const analysisService = createAIAnalysisService(db, {
          providerId: "fixture",
          model: "fixture",
          monthlyRequestLimit: 10,
        }),
        actor = { userId: owner };
      const job = await analysisService.requestItemAnalysis(
          actor,
          item.id,
          [asset.id],
          randomUUID(),
        ),
        claim = await analysisService.claimAnalysis(job.id);
      const analysis = {
        categoryKey: category.key,
        title: "Suggested title",
        manufacturer: "Suggested maker",
        seriesOrSet: "Suggested series",
        year: 2020,
        identifiers: [{ type: "MARKING", value: "A-100" }],
        catalogCandidates: [
          {
            catalogEntryId: entry.id,
            catalogVariantId: null,
            confidence: 0.7,
            evidence: ["Visible marking"],
          },
        ],
        warnings: ["Confirm every suggestion."],
      };
      if (options.noModelCandidates) analysis.catalogCandidates = [];
      if (options.visibleCode) analysis.identifiers[0]!.value = options.visibleCode;
      if (options.badIdentifier) analysis.identifiers = [{ type: "EAN", value: "---" }];
      if (options.useCatalogTitle) {
        analysis.title = (entry.authored as { text: { title: string } }).text.title;
        analysis.identifiers = [];
      }
      await analysisService.storeAnalysisResult(claim!, analysis);
      const path = "./suggestion-apply-service",
        module = await import(path).catch(() => null);
      expect(
        module?.createSuggestionApplyService,
        "real confirmation service must exist",
      ).toBeTypeOf("function");
      const service = module!.createSuggestionApplyService(db),
        review = await service.getReview(actor, job.id);
      const input = (selection: Record<string, unknown> = {}) => ({
        requestKey: randomUUID(),
        baseline: review.baseline,
        title: false,
        category: false,
        manufacturerFieldId: null,
        seriesOrSetFieldId: null,
        yearFieldId: null,
        identifierIndices: [],
        catalogCandidateIndex: null,
        ...selection,
      });
      return {
        owner,
        actor,
        collection,
        item,
        category,
        entry,
        fields,
        asset,
        link,
        analysisService,
        analysis,
        job,
        service,
        review,
        input,
      };
    }
    it("applies only selected title and leaves rejected maker, category and catalog untouched", async () => {
      const f = await fixture();
      await f.service.applySuggestions(f.actor, f.job.id, f.input({ title: true }));
      expect(await db.collectibleItem.findUnique({ where: { id: f.item.id } })).toMatchObject({
        title: "Suggested title",
        categoryTemplateId: null,
        catalogEntryId: null,
      });
      expect(await db.customFieldValue.findFirst({ where: { itemId: f.item.id } })).toMatchObject({
        shortTextValue: "Original maker",
      });
      expect((await f.analysisService.getAnalysis(f.actor, f.job.id)).analysis).toEqual(f.analysis);
      expect(
        await db.auditEvent.findMany({ where: { resourceId: f.item.id, source: "AI" } }),
      ).toHaveLength(2);
    });
    it("maps approved metadata to explicit existing personal fields and merges selected identifiers", async () => {
      const f = await fixture();
      await f.service.applySuggestions(
        f.actor,
        f.job.id,
        f.input({
          manufacturerFieldId: f.fields[0]!.id,
          seriesOrSetFieldId: f.fields[1]!.id,
          yearFieldId: f.fields[2]!.id,
          identifierIndices: [0],
        }),
      );
      const fields = await db.customFieldValue.findMany({
        where: { itemId: f.item.id },
        orderBy: { fieldDefinitionId: "asc" },
      });
      expect(
        fields.find((field) => field.fieldDefinitionId === f.fields[0]!.id)!.shortTextValue,
      ).toBe("Suggested maker");
      expect(
        fields.find((field) => field.fieldDefinitionId === f.fields[2]!.id)!.integerValue,
      ).toBe(2020n);
      expect(await db.itemIdentifier.findMany({ where: { itemId: f.item.id } })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "SERIAL", value: "Original" }),
          expect.objectContaining({ type: "MARKING", value: "A-100" }),
        ]),
      );
    });
    it("records rejection without changing item data or its custom fields", async () => {
      const f = await fixture(),
        before = await db.collectibleItem.findUnique({ where: { id: f.item.id } }),
        fields = await db.customFieldValue.findMany({ where: { itemId: f.item.id } });
      const result = await f.service.applySuggestions(f.actor, f.job.id, f.input());
      expect(result.accepted).toEqual([]);
      expect(await db.collectibleItem.findUnique({ where: { id: f.item.id } })).toEqual(before);
      expect(await db.customFieldValue.findMany({ where: { itemId: f.item.id } })).toEqual(fields);
    });
    it("serializes repeated confirmation and rejects changing its nonce or selections", async () => {
      const f = await fixture(),
        input = f.input({ title: true });
      const results = await Promise.all([
        f.service.applySuggestions(f.actor, f.job.id, input),
        f.service.applySuggestions(f.actor, f.job.id, input),
      ]);
      expect(results[0]).toEqual(results[1]);
      await expect(
        f.service.applySuggestions(f.actor, f.job.id, { ...input, title: false }),
      ).rejects.toMatchObject({ code: "AI_REQUEST_CONFLICT" });
      expect(
        await db.auditEvent.count({
          where: { resourceId: f.item.id, action: "AI_SUGGESTIONS_APPLIED" },
        }),
      ).toBe(1);
    });
    it("refuses a stale item or custom-field baseline without any partial title mutation", async () => {
      const f = await fixture();
      await db.customFieldValue.updateMany({
        where: { itemId: f.item.id },
        data: { shortTextValue: "New human edit" },
      });
      await expect(
        f.service.applySuggestions(
          f.actor,
          f.job.id,
          f.input({ title: true, manufacturerFieldId: f.fields[0]!.id }),
        ),
      ).rejects.toMatchObject({ code: "AI_ITEM_CHANGED" });
      expect((await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item.id } })).title).toBe(
        "Original title",
      );
    });
    it("rejects unsafe targets and rolls back an invalid personal-field destination", async () => {
      const f = await fixture();
      for (const input of [
        f.input({ title: true, authenticity: true }),
        f.input({ title: true, yearFieldId: f.fields[0]!.id }),
        f.input({ manufacturerFieldId: randomUUID() }),
      ])
        await expect(f.service.applySuggestions(f.actor, f.job.id, input)).rejects.toMatchObject({
          code: "AI_INVALID_SELECTION",
        });
      expect((await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item.id } })).title).toBe(
        "Original title",
      );
    });
    it("requires a separate explicit catalog choice, validates real references and applies its category coherently", async () => {
      const f = await fixture();
      await f.service.applySuggestions(f.actor, f.job.id, f.input({ catalogCandidateIndex: 0 }));
      expect(await db.collectibleItem.findUnique({ where: { id: f.item.id } })).toMatchObject({
        catalogEntryId: f.entry.id,
        categoryTemplateId: f.category.id,
        conditionOptionId: null,
      });
    });
    it("denies foreign actors and a source unlinked after analysis before accepting any data", async () => {
      const f = await fixture();
      await expect(f.service.getReview({ userId: "unrelated" }, f.job.id)).rejects.toMatchObject({
        code: "AI_ITEM_NOT_FOUND",
      });
      await db.mediaLink.delete({ where: { id: f.link.id } });
      await expect(
        f.service.applySuggestions(f.actor, f.job.id, f.input({ title: true })),
      ).rejects.toMatchObject({ code: "AI_SOURCE_NOT_AUTHORIZED" });
      expect((await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item.id } })).title).toBe(
        "Original title",
      );
    });
    it("keeps the final decision immutable and compatible with actual collection erasure", async () => {
      const f = await fixture();
      await f.service.applySuggestions(f.actor, f.job.id, f.input({ title: true }));
      await expect(
        db.$executeRaw`UPDATE "AIAnalysisDecision" SET accepted='[]'::jsonb WHERE "jobId"=${f.job.id}::uuid`,
      ).rejects.toThrow();
      await db.collection.delete({ where: { id: f.collection.id } });
      expect(await db.aIAnalysisDecision.count({ where: { jobId: f.job.id } })).toBe(0);
    });
    it("accepts an existing identifier at the supported100 boundary without rejecting a selected title", async () => {
      const f = await fixture();
      await db.itemIdentifier.deleteMany({ where: { itemId: f.item.id } });
      await db.itemIdentifier.createMany({
        data: Array.from({ length: 100 }, (_, index) => ({
          itemId: f.item.id,
          type: index === 0 ? "MARKING" : "SERIAL",
          value: index === 0 ? "A-100" : `ID-${index}`,
          normalizedValue: index === 0 ? "A-100" : `ID-${index}`,
        })),
      });
      const before = await db.itemIdentifier.findMany({
          where: { itemId: f.item.id },
          orderBy: { id: "asc" },
        }),
        review = await f.service.getReview(f.actor, f.job.id);
      const result = await f.service.applySuggestions(
        f.actor,
        f.job.id,
        f.input({ baseline: review.baseline, title: true, identifierIndices: [0] }),
      );
      expect(result.accepted).toContain("title");
      expect(
        await db.itemIdentifier.findMany({ where: { itemId: f.item.id }, orderBy: { id: "asc" } }),
      ).toEqual(before);
      expect((await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item.id } })).title).toBe(
        "Suggested title",
      );
    });
    it("returns a correctable selection error for a malformed visible identifier and rolls the title back", async () => {
      const f = await fixture({ badIdentifier: true });
      await expect(
        f.service.applySuggestions(
          f.actor,
          f.job.id,
          f.input({ title: true, identifierIndices: [0] }),
        ),
      ).rejects.toMatchObject({ code: "AI_INVALID_SELECTION" });
      expect((await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item.id } })).title).toBe(
        "Original title",
      );
      expect(await db.aIAnalysisDecision.count({ where: { jobId: f.job.id } })).toBe(0);
    });
    it("finds bounded explicit catalog choices from a visible code despite an unrelated personal title", async () => {
      const f = await fixture({ noModelCandidates: true });
      await db.catalogExternalIdentifier.create({
        data: {
          entryId: f.entry.id,
          namespace: "fixture",
          type: "marking",
          value: "A-100",
          sources: [],
        },
      });
      const other = await db.catalogEntry.create({
        data: {
          categoryTemplateId: f.category.id,
          authored: {
            text: { language: "en", title: "Ambiguous public reference", translations: [] },
            sources: [],
          },
        },
      });
      await db.catalogExternalIdentifier.create({
        data: {
          entryId: other.id,
          namespace: "another",
          type: "marking",
          value: "A-100",
          sources: [],
        },
      });
      const review = await f.service.getReview(f.actor, f.job.id);
      expect(review.catalogCandidates).toHaveLength(2);
      expect(review.catalogCandidates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            catalogEntryId: f.entry.id,
            matchSource: "VISIBLE_IDENTIFIER",
            confidence: null,
          }),
          expect.objectContaining({
            catalogEntryId: other.id,
            matchSource: "VISIBLE_IDENTIFIER",
            confidence: null,
          }),
        ]),
      );
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item.id } })).catalogEntryId,
      ).toBeNull();
      const chosen = review.catalogCandidates.find(
        (candidate: any) => candidate.catalogEntryId === f.entry.id,
      )!;
      await f.service.applySuggestions(
        f.actor,
        f.job.id,
        f.input({ baseline: review.baseline, catalogCandidateIndex: chosen.index }),
      );
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item.id } })).catalogEntryId,
      ).toBe(f.entry.id);
      expect(
        (await f.analysisService.getAnalysis(f.actor, f.job.id)).analysis!.catalogCandidates,
      ).toEqual([]);
    });
    it("retrieves an exact public suggested title without requiring the old personal title to match", async () => {
      const f = await fixture({ noModelCandidates: true, useCatalogTitle: true }),
        review = await f.service.getReview(f.actor, f.job.id);
      expect(review.catalogCandidates).toEqual([
        expect.objectContaining({
          catalogEntryId: f.entry.id,
          matchSource: "SUGGESTED_TITLE",
          confidence: null,
        }),
      ]);
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item.id } })).catalogEntryId,
      ).toBeNull();
    });
    it("rejects a retired derived match with a stale baseline before applying a selected title", async () => {
      const code = `photo-${randomUUID()}`,
        f = await fixture({ noModelCandidates: true, visibleCode: code });
      const identifier = await db.catalogExternalIdentifier.create({
        data: {
          entryId: f.entry.id,
          namespace: "fixture",
          type: "marking",
          value: code,
          sources: [],
        },
      });
      const review = await f.service.getReview(f.actor, f.job.id);
      expect(review.catalogCandidates).toHaveLength(1);
      await db.catalogExternalIdentifier.update({
        where: { id: identifier.id },
        data: { active: false },
      });
      await expect(
        f.service.applySuggestions(
          f.actor,
          f.job.id,
          f.input({ baseline: review.baseline, title: true, catalogCandidateIndex: 0 }),
        ),
      ).rejects.toMatchObject({ code: "AI_ITEM_CHANGED" });
      expect(await db.collectibleItem.findUnique({ where: { id: f.item.id } })).toMatchObject({
        title: "Original title",
        catalogEntryId: null,
      });
    });
    it("bounds local matches, permits a derived index beyond model indices and freezes its actual selected identity", async () => {
      const code = `photo-${randomUUID()}`,
        f = await fixture({ visibleCode: code });
      for (let index = 0; index < 20; index++) {
        const entry = await db.catalogEntry.create({
          data: {
            categoryTemplateId: f.category.id,
            authored: {
              text: { language: "en", title: `Bounded local reference ${index}`, translations: [] },
              sources: [],
            },
          },
        });
        await db.catalogExternalIdentifier.create({
          data: {
            entryId: entry.id,
            namespace: "fixture",
            type: "marking",
            value: code,
            sources: [],
          },
        });
      }
      const review = await f.service.getReview(f.actor, f.job.id);
      expect(review.catalogCandidates).toHaveLength(11);
      const selected = review.catalogCandidates[10]!;
      expect(selected.matchSource).toBe("VISIBLE_IDENTIFIER");
      expect(selected.confidence).toBeNull();
      await f.service.applySuggestions(
        f.actor,
        f.job.id,
        f.input({ baseline: review.baseline, catalogCandidateIndex: 10 }),
      );
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: f.item.id } })).catalogEntryId,
      ).toBe(selected.catalogEntryId);
      expect(
        (await db.aIAnalysisDecision.findUniqueOrThrow({ where: { jobId: f.job.id } })).selections,
      ).toMatchObject({
        catalogSelection: {
          catalogEntryId: selected.catalogEntryId,
          catalogVariantId: null,
          matchSource: "VISIBLE_IDENTIFIER",
        },
      });
    });
    it("uses the additive public exact-title index on a realistically populated local lookup", async () => {
      const f = await fixture({ noModelCandidates: true, useCatalogTitle: true });
      await db.catalogEntry.createMany({
        data: Array.from({ length: 2000 }, (_, index) => ({
          categoryTemplateId: f.category.id,
          authored: {
            text: {
              language: "en",
              title: `Other public lookup reference ${index}`,
              translations: [],
            },
            sources: [],
          },
        })),
      });
      await db.$executeRaw`ANALYZE "CatalogEntry"`;
      const plan = await db.$queryRaw<
        unknown[]
      >`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT id FROM "CatalogEntry" WHERE lower(authored#>>'{text,title}')=lower(${f.analysis.title}) ORDER BY id LIMIT 10`;
      expect(JSON.stringify(plan)).toContain("CatalogEntry_ai_exact_title_idx");
      const review = await f.service.getReview(f.actor, f.job.id);
      expect(review.catalogCandidates).toEqual([
        expect.objectContaining({ catalogEntryId: f.entry.id, matchSource: "SUGGESTED_TITLE" }),
      ]);
    });
  },
);
