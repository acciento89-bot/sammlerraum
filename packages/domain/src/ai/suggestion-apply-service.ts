import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@sammlerraum/db/search-sql";
import {
  AIAnalysisError,
  AIIdSchema,
  ApplyAISuggestionsSchema,
  AIApplyReceiptSchema,
  type CollectibleAnalysis,
} from "@sammlerraum/contracts/ai";
import { MembershipActorIdSchema } from "@sammlerraum/contracts/collaboration";
import { UpdateItemInputSchema } from "@sammlerraum/contracts/items";
import { readOwnedAIAnalysisInTransaction } from "./ai-analysis-service";
import {
  readOwnedItemInTransaction,
  updateItemInTransaction,
  linkItemToCatalogInTransaction,
  ItemServiceError,
  type ItemTransaction,
} from "../items/item-service";
import {
  setFieldValueInTransaction,
  CustomFieldServiceError,
  type CustomFieldTransaction,
} from "../custom-fields/custom-field-service";
import {
  setItemCategoryInTransaction,
  ConditionServiceError,
} from "../condition/condition-service";
import { parseItemIdentifiers } from "../items/identifier-service";
import { lockCatalogParents } from "../catalog/item-catalog-locks";
import { createTrustedAuditContext } from "../audit/audit-context";
import {
  beginMutationAudit,
  appendMutationAudit,
  auditSqlTransaction,
  type MutationAuditPort,
} from "../audit/mutation-audit";
import type { BoundedSearchReadTransaction } from "../search/search-read";
import { isReadDependencyFailure, isReadSerializationFailure } from "../api/read-dependency-errors";
type Tx = ItemTransaction & CustomFieldTransaction;
export type AIApplyDatabase = {
  $transaction<T>(
    work: (tx: Tx) => Promise<T>,
    options: { isolationLevel: "ReadCommitted"; maxWait: number; timeout: number },
  ): Promise<T>;
};
const fail = (code: AIAnalysisError["code"]): never => {
  throw new AIAnalysisError(code);
};
const hash = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
function parse<T>(
  schema: z.ZodType<T>,
  value: unknown,
  code: AIAnalysisError["code"] = "AI_INVALID_SELECTION",
): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : fail(code);
}
type Decision = {
  jobId: string;
  requestKey: string;
  requestDigest: string;
  accepted: unknown;
  createdAt: Date;
};
const receipt = (row: Decision) =>
  AIApplyReceiptSchema.parse({
    analysisId: row.jobId,
    requestKey: row.requestKey,
    accepted: row.accepted,
    decidedAt: row.createdAt.toISOString(),
  });
async function decision(raw: BoundedSearchReadTransaction, id: string) {
  return (
    await raw.$queryRaw<Decision[]>(
      Prisma.sql`SELECT "jobId","requestKey","requestDigest",accepted,"createdAt" FROM "AIAnalysisDecision" WHERE "jobId"=${id}::uuid`,
    )
  )[0];
}
type Field = { id: string; name: string; type: "SHORT_TEXT" | "INTEGER"; value: string | null };
async function capture(
  tx: Tx,
  raw: BoundedSearchReadTransaction,
  who: string,
  detail: Awaited<ReturnType<typeof readOwnedAIAnalysisInTransaction>>,
) {
  const item = await readOwnedItemInTransaction(tx, who, detail.job.itemId);
  const fields = await raw.$queryRaw<Field[]>(
    Prisma.sql`SELECT d.id,d.name,d.type::text,CASE WHEN d.type='SHORT_TEXT' THEN v."shortTextValue" ELSE v."integerValue"::text END AS value FROM "CustomFieldDefinition" d LEFT JOIN "CustomFieldValue" v ON v."fieldDefinitionId"=d.id AND v."itemId"=${item.id}::uuid WHERE d."collectionId"=${item.collectionId}::uuid AND d.type IN ('SHORT_TEXT','INTEGER') ORDER BY d.id LIMIT 101`,
  );
  const identifiers = await raw.$queryRaw<
    { type: string; value: string; normalizedValue: string }[]
  >(
    Prisma.sql`SELECT type,value,"normalizedValue" FROM "ItemIdentifier" WHERE "itemId"=${item.id}::uuid ORDER BY type,"normalizedValue",id LIMIT 101`,
  );
  if (identifiers.length > 100) return fail("AI_INVALID_SELECTION");
  const ids = detail.analysis.catalogCandidates.map((candidate) => candidate.catalogEntryId),
    variantIds = detail.analysis.catalogCandidates.flatMap((candidate) =>
      candidate.catalogVariantId ? [candidate.catalogVariantId] : [],
    );
  const entries = await raw.$queryRaw<
    { id: string; revision: number; categoryTemplateId: string; authored: unknown; title: string }[]
  >(
    Prisma.sql`SELECT id,revision,"categoryTemplateId",authored,authored#>>'{text,title}' AS title FROM "CatalogEntry" WHERE id=ANY(${ids}::uuid[]) ORDER BY id`,
  );
  const variants = await raw.$queryRaw<
    { id: string; entryId: string; active: boolean; authored: unknown }[]
  >(
    Prisma.sql`SELECT id,"entryId",active,authored FROM "CatalogVariant" WHERE id=ANY(${variantIds}::uuid[]) ORDER BY id`,
  );
  const categories = await raw.$queryRaw<{ id: string; key: string }[]>(
    Prisma.sql`SELECT id,key FROM "CategoryTemplate" WHERE key=${detail.analysis.categoryKey} ORDER BY id`,
  );
  const [clock] = await raw.$queryRaw<{ updatedAt: Date }[]>(
    Prisma.sql`SELECT "updatedAt" FROM "CollectibleItem" WHERE id=${item.id}::uuid`,
  );
  const baseline = hash({
    item,
    updatedAt: clock?.updatedAt.toISOString(),
    fields,
    identifiers,
    entries,
    variants,
    categories,
    analysis: detail.analysis,
  });
  return {
    item,
    fields: fields.slice(0, 100),
    fieldsTruncated: fields.length > 100,
    identifiers,
    entries,
    variants,
    categories,
    baseline,
  };
}
/** Real audited mutation helpers share this actual transaction; no fake nested transactions. */
export function createSuggestionApplyService(database: AIApplyDatabase) {
  async function run<T>(
    work: (tx: Tx, raw: BoundedSearchReadTransaction) => Promise<T>,
  ): Promise<T> {
    const stop = performance.now() + 12000;
    for (let attempt = 0; attempt < 3; attempt++) {
      const left = Math.floor(stop - performance.now());
      if (left < 1) return fail("AI_UNAVAILABLE");
      try {
        return await database.$transaction(
          async (tx) => {
            const txStop = Math.min(stop, performance.now() + 5000),
              checkBudget = () => {
                if (performance.now() >= txStop) return fail("AI_UNAVAILABLE");
              };
            await tx.$queryRaw`SELECT set_config('TimeZone','UTC',true),set_config('statement_timeout','2000ms',true),set_config('lock_timeout','500ms',true),set_config('transaction_timeout',${`${Math.min(left, 5000)}ms`},true)`;
            const sql = auditSqlTransaction(tx),
              raw: BoundedSearchReadTransaction = {
                checkBudget,
                $queryRaw: async <T>(query: Prisma.Sql) => {
                  checkBudget();
                  const result = await sql.$queryRaw<T>(query);
                  checkBudget();
                  return result;
                },
              };
            const result = await work(tx, raw);
            checkBudget();
            return result;
          },
          {
            isolationLevel: "ReadCommitted",
            maxWait: Math.min(left, 2000),
            timeout: Math.min(left, 5000),
          },
        );
      } catch (error) {
        if (error instanceof AIAnalysisError) throw error;
        if (isReadSerializationFailure(error) && attempt < 2) continue;
        if (isReadDependencyFailure(error)) return fail("AI_UNAVAILABLE");
        if (error instanceof ItemServiceError)
          return fail(
            error.code === "ITEM_NOT_FOUND" ? "AI_ITEM_NOT_FOUND" : "AI_INVALID_SELECTION",
          );
        if (error instanceof CustomFieldServiceError || error instanceof ConditionServiceError)
          return fail("AI_INVALID_SELECTION");
        throw error;
      }
    }
    return fail("AI_UNAVAILABLE");
  }
  return {
    async getReview(actor: { userId: string }, idInput: unknown) {
      const who = parse(MembershipActorIdSchema, actor?.userId, "AI_ITEM_NOT_FOUND"),
        id = parse(AIIdSchema, idInput, "AI_ITEM_NOT_FOUND");
      return run(async (tx, raw) => {
        const detail = await readOwnedAIAnalysisInTransaction(raw, { userId: who }, id),
          state = await capture(tx, raw, who, detail),
          prior = await decision(raw, id);
        return {
          job: detail.job,
          analysis: detail.analysis,
          baseline: state.baseline,
          item: {
            id: state.item.id,
            collectionId: state.item.collectionId,
            title: state.item.title,
            categoryTemplateId: state.item.categoryTemplateId,
            catalogEntryId: state.item.catalogEntryId,
            catalogVariantId: state.item.catalogVariantId,
          },
          fields: state.fields,
          fieldsTruncated: state.fieldsTruncated,
          identifiers: state.identifiers.map(({ type, value }) => ({ type, value })),
          catalogCandidates: detail.analysis.catalogCandidates.map((candidate, index) => ({
            index,
            ...candidate,
            title:
              state.entries.find((entry) => entry.id === candidate.catalogEntryId)?.title ?? null,
          })),
          decision: prior ? receipt(prior) : null,
        };
      });
    },
    async applySuggestions(actor: { userId: string }, idInput: unknown, selections: unknown) {
      const who = parse(MembershipActorIdSchema, actor?.userId, "AI_ITEM_NOT_FOUND"),
        id = parse(AIIdSchema, idInput, "AI_ITEM_NOT_FOUND"),
        input = parse(ApplyAISuggestionsSchema, selections),
        digest = hash(input);
      return run(async (tx, raw) => {
        const context = createTrustedAuditContext({ source: "AI", actorId: who });
        await beginMutationAudit(tx, who, () => new AIAnalysisError("AI_ITEM_NOT_FOUND"), context);
        // Read immutable proposal for catalog-parent lock ordering before taking the personal item lock.
        const [preview] = await raw.$queryRaw<{ itemId: string; payload: unknown }[]>(
          Prisma.sql`SELECT j."itemId",s.payload FROM "AIAnalysisJob" j JOIN "AIAnalysisSuggestion" s ON s."jobId"=j.id WHERE j.id=${id}::uuid AND j."requesterId"=${who} AND j.status='READY'`,
        );
        if (!preview) return fail("AI_ITEM_NOT_FOUND");
        const prior = await decision(raw, id);
        if (prior) {
          await readOwnedItemInTransaction(tx, who, preview.itemId);
          if (prior.requestDigest !== digest) return fail("AI_REQUEST_CONFLICT");
          return receipt(prior);
        }
        const analysis = parseAnalysis(preview.payload),
          candidate =
            input.catalogCandidateIndex === null
              ? undefined
              : analysis.catalogCandidates[input.catalogCandidateIndex];
        if (input.catalogCandidateIndex !== null && !candidate) return fail("AI_INVALID_SELECTION");
        if (candidate) await lockCatalogParents(tx, candidate);
        const detail = await readOwnedAIAnalysisInTransaction(raw, { userId: who }, id),
          state = await capture(tx, raw, who, detail);
        if (state.baseline !== input.baseline) return fail("AI_ITEM_CHANGED");
        if (state.item.archivedAt !== null || state.item.disposedAt !== null)
          return fail("AI_INVALID_SELECTION");
        const selected: {
          key: "manufacturer" | "seriesOrSet" | "year";
          id: string;
          value: string | number;
        }[] = [];
        for (const [key, fieldId, type] of [
          ["manufacturer", input.manufacturerFieldId, "SHORT_TEXT"],
          ["seriesOrSet", input.seriesOrSetFieldId, "SHORT_TEXT"],
          ["year", input.yearFieldId, "INTEGER"],
        ] as const) {
          if (fieldId === null) continue;
          const value = analysis[key];
          if (
            value === null ||
            !state.fields.some((field) => field.id === fieldId && field.type === type)
          )
            return fail("AI_INVALID_SELECTION");
          selected.push({ key, id: fieldId, value });
        }
        if (input.title && analysis.title === null) return fail("AI_INVALID_SELECTION");
        if (input.category && (!analysis.categoryKey || state.categories.length !== 1))
          return fail("AI_INVALID_SELECTION");
        if (input.identifierIndices.some((index) => !analysis.identifiers[index]))
          return fail("AI_INVALID_SELECTION");
        const accepted: string[] = [];
        if (input.category) {
          await setItemCategoryInTransaction(
            tx,
            who,
            state.item.id,
            { categoryTemplateId: state.categories[0]!.id, clearCondition: false },
            context,
          );
          accepted.push("category");
        }
        if (candidate) {
          await linkItemToCatalogInTransaction(
            tx,
            who,
            state.item.id,
            candidate.catalogEntryId,
            candidate.catalogVariantId,
            { auditContext: context },
          );
          accepted.push("catalogCandidate");
        }
        if (input.title) {
          await updateItemInTransaction(
            tx,
            who,
            state.item.id,
            UpdateItemInputSchema.parse({ title: analysis.title }),
            { auditContext: context },
          );
          accepted.push("title");
        }
        const auditPort: MutationAuditPort = {
          begin: (transaction, actorId, missing) =>
            beginMutationAudit(transaction, actorId, missing, context),
          append: appendMutationAudit,
        };
        for (const selection of selected) {
          await setFieldValueInTransaction(tx, who, state.item.id, selection.id, selection.value, {
            auditPort,
          });
          accepted.push(selection.key);
        }
        if (input.identifierIndices.length) {
          const additions = parseItemIdentifiers(
            input.identifierIndices.map((index) => analysis.identifiers[index]!),
          );
          if (parseItemIdentifiers([...state.identifiers, ...additions]).length > 100)
            return fail("AI_INVALID_SELECTION");
          for (const identifier of additions)
            await raw.$queryRaw(
              Prisma.sql`INSERT INTO "ItemIdentifier" (id,"itemId",type,value,"normalizedValue") VALUES (${randomUUID()}::uuid,${state.item.id}::uuid,${identifier.type},${identifier.value},${identifier.normalizedValue}) ON CONFLICT ("itemId",type,"normalizedValue") DO NOTHING`,
            );
          accepted.push(...input.identifierIndices.map((index) => `identifier:${index}`));
        }
        await appendMutationAudit(tx, context, {
          resourceType: "ITEM",
          resourceId: state.item.id,
          action: "AI_SUGGESTIONS_APPLIED",
          before: null,
          after: { analysisId: id, accepted },
        });
        const [saved] = await raw.$queryRaw<Decision[]>(
          Prisma.sql`INSERT INTO "AIAnalysisDecision" ("jobId","requestKey","requestDigest",selections,accepted) VALUES (${id}::uuid,${input.requestKey}::uuid,${digest},${JSON.stringify(input)}::jsonb,${JSON.stringify(accepted)}::jsonb) RETURNING "jobId","requestKey","requestDigest",accepted,"createdAt"`,
        );
        if (!saved) return fail("AI_UNAVAILABLE");
        return receipt(saved);
      });
    },
  };
}
// Canonical provider-neutral output validation is shared with admission and result persistence.
import { parseCollectibleAnalysis as parseAnalysis } from "@sammlerraum/contracts/ai";
