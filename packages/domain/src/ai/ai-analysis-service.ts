import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@sammlerraum/db/search-sql";
import { MembershipActorIdSchema, MembershipError } from "@sammlerraum/contracts/collaboration";
import {
  AIAnalysisError,
  AIAnalysisJobSchema,
  AIErrorCodeSchema,
  AIIdSchema,
  AIReportedUsageSchema,
  RequestAIAnalysisSchema,
  parseCollectibleAnalysis,
  type AIAnalysisJob,
} from "@sammlerraum/contracts/ai";
import {
  runTransferTransaction,
  type MembershipDatabase,
} from "../collaboration/transfer-transaction";
import type { BoundedSearchReadTransaction } from "../search/search-read";
const SourceSchema = z
  .object({
    assetId: AIIdSchema,
    linkId: AIIdSchema,
    variantId: AIIdSchema,
    storageKey: z.string().min(1).max(512),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    byteSize: z
      .string()
      .regex(/^[1-9][0-9]{0,6}$/u)
      .refine((value) => BigInt(value) <= 2097152n),
    mimeType: z.literal("image/webp"),
    width: z.number().int().min(1).max(640),
    height: z.number().int().min(1).max(640),
  })
  .strict();
const SourcesSchema = z.array(SourceSchema).min(1).max(4);
export type AIAnalysisSource = z.infer<typeof SourceSchema>;
export type AIAnalysisClaim = Readonly<{
  jobId: string;
  token: string;
  attempt: number;
  providerId: string;
  model: string;
  sources: readonly AIAnalysisSource[];
}>;
type JobRow = {
  id: string;
  requesterId: string;
  itemId: string;
  collectionId: string;
  requestKey: string;
  requestDigest: string;
  sources: unknown;
  providerId: string;
  model: string;
  status: AIAnalysisJob["status"];
  attempts: number;
  leaseToken: string | null;
  leaseUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
  errorCode: AIAnalysisJob["errorCode"];
};
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const failure = (code: AIAnalysisError["code"]): never => {
  throw new AIAnalysisError(code);
};
function parse<T>(
  schema: z.ZodType<T>,
  input: unknown,
  code: AIAnalysisError["code"] = "AI_INVALID_REQUEST",
): T {
  const result = schema.safeParse(input);
  if (!result.success) return failure(code);
  return result.data;
}
function owner(actor: { userId: string }) {
  return parse(MembershipActorIdSchema, actor?.userId);
}
function summary(row: JobRow): AIAnalysisJob {
  return AIAnalysisJobSchema.parse({
    id: row.id,
    itemId: row.itemId,
    status: row.status,
    imageCount: SourcesSchema.parse(row.sources).length,
    providerId: row.providerId,
    model: row.model,
    errorCode: row.errorCode,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
/** Canonical user→parent→item lock order, without granting a member/share third-party processing rights. */
async function ownedItem(tx: BoundedSearchReadTransaction, actor: string, itemId: string) {
  const user = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id FROM "user" WHERE id=${actor} AND "emailVerified" FOR UPDATE`,
  );
  if (!user.length) return failure("AI_ITEM_NOT_FOUND");
  const parents = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT c.id FROM "Collection" c WHERE c."ownerId"=${actor} AND c."deletedAt" IS NULL AND c.id=(SELECT "collectionId" FROM "CollectibleItem" WHERE id=${itemId}::uuid AND "ownerId"=${actor} AND "deletedAt" IS NULL) FOR SHARE`,
  );
  if (!parents[0]) return failure("AI_ITEM_NOT_FOUND");
  const items = await tx.$queryRaw<{ id: string; collectionId: string }[]>(
    Prisma.sql`SELECT id,"collectionId" FROM "CollectibleItem" WHERE id=${itemId}::uuid AND "ownerId"=${actor} AND "collectionId"=${parents[0].id}::uuid AND "deletedAt" IS NULL FOR SHARE`,
  );
  if (!items[0]) return failure("AI_ITEM_NOT_FOUND");
  return items[0];
}
async function sources(
  tx: BoundedSearchReadTransaction,
  actor: string,
  itemId: string,
  ids: readonly string[],
): Promise<AIAnalysisSource[]> {
  const rows = await tx.$queryRaw<(Omit<AIAnalysisSource, "byteSize"> & { byteSize: bigint })[]>(
    Prisma.sql`SELECT a.id AS "assetId",l.id AS "linkId",v.id AS "variantId",v."storageKey",v."checksumSha256",v."byteSize",v."mimeType",v.width,v.height FROM "MediaLink" l JOIN "MediaAsset" a ON a.id=l."assetId" AND a."ownerId"=l."ownerId" JOIN "MediaVariant" v ON v."assetId"=a.id AND v.name='MEDIUM' WHERE l."itemId"=${itemId}::uuid AND l."ownerId"=${actor} AND l.purpose='GALLERY' AND a.id=ANY(${[...ids]}::uuid[]) AND a.kind='IMAGE' AND a.status='READY' AND a."cleanupStartedAt" IS NULL AND NOT EXISTS(SELECT 1 FROM "DocumentLink" d WHERE d."assetId"=a.id) ORDER BY array_position(${[...ids]}::uuid[],a.id) FOR SHARE OF l,a,v`,
  );
  if (rows.length !== ids.length) return failure("AI_SOURCE_NOT_AUTHORIZED");
  return parse(
    SourcesSchema,
    rows.map((row) => ({ ...row, byteSize: row.byteSize.toString() })),
    "AI_SOURCE_NOT_AUTHORIZED",
  );
}
async function currentSources(tx: BoundedSearchReadTransaction, row: JobRow) {
  const saved = parse(SourcesSchema, row.sources, "AI_SOURCE_NOT_AUTHORIZED");
  const actual = await sources(
    tx,
    row.requesterId,
    row.itemId,
    saved.map((source) => source.assetId),
  );
  if (sha(saved) !== sha(actual)) return failure("AI_SOURCE_NOT_AUTHORIZED");
  return actual;
}
export function createAIAnalysisService(
  database: MembershipDatabase,
  options: { providerId: string; model: string; monthlyRequestLimit: number; leaseMs?: number },
) {
  const config = z
    .object({
      providerId: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/u),
      model: z
        .string()
        .min(1)
        .max(128)
        .refine((value) => !/[\x00-\x1f]/u.test(value)),
      monthlyRequestLimit: z.number().int().min(0).max(10000),
      leaseMs: z.number().int().min(50).max(120000).default(90000),
    })
    .strict()
    .parse(options);
  async function run<T>(work: (tx: BoundedSearchReadTransaction) => Promise<T>): Promise<T> {
    try {
      return await runTransferTransaction(database, work);
    } catch (error) {
      if (error instanceof AIAnalysisError) throw error;
      if (error instanceof MembershipError) return failure("AI_UNAVAILABLE");
      throw error;
    }
  }
  async function load(
    tx: BoundedSearchReadTransaction,
    id: string,
    actor?: string,
    locked = false,
  ) {
    const rows = await tx.$queryRaw<JobRow[]>(
      Prisma.sql`SELECT * FROM "AIAnalysisJob" WHERE id=${id}::uuid ${actor ? Prisma.sql`AND "requesterId"=${actor}` : Prisma.empty} ${locked ? Prisma.sql`FOR UPDATE` : Prisma.empty}`,
    );
    return rows[0];
  }
  async function lockRequester(tx: BoundedSearchReadTransaction, row: JobRow) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM "user" WHERE id=${row.requesterId} FOR UPDATE`);
  }
  async function closePending(
    tx: BoundedSearchReadTransaction,
    row: JobRow,
    code: AIAnalysisError["code"],
  ) {
    await tx.$queryRaw(
      Prisma.sql`UPDATE "AIAnalysisAttempt" SET outcome='ABANDONED',"errorCode"=${code},"finishedAt"=date_trunc('milliseconds',clock_timestamp() AT TIME ZONE 'UTC') WHERE "jobId"=${row.id}::uuid AND outcome='PENDING'`,
    );
    await tx.$queryRaw(
      Prisma.sql`UPDATE "AIAnalysisJob" SET status='FAILED',"errorCode"=${code},"leaseToken"=NULL,"leaseUntil"=NULL,"updatedAt"=date_trunc('milliseconds',clock_timestamp() AT TIME ZONE 'UTC') WHERE id=${row.id}::uuid`,
    );
  }
  async function activeClaim(tx: BoundedSearchReadTransaction, id: string, token: string) {
    const initial = await load(tx, id);
    if (!initial) return failure("AI_STALE_JOB");
    const item = await ownedItem(tx, initial.requesterId, initial.itemId);
    const row = await load(tx, id, undefined, true);
    if (!row) return failure("AI_STALE_JOB");
    const [active] = await tx.$queryRaw<{ active: boolean }[]>(
      Prisma.sql`SELECT status='PROCESSING' AND "leaseToken"=${token}::uuid AND "leaseUntil">clock_timestamp() AT TIME ZONE 'UTC' AS active FROM "AIAnalysisJob" WHERE id=${id}::uuid`,
    );
    if (!active?.active) return failure("AI_STALE_JOB");
    if (item.collectionId !== row.collectionId) return failure("AI_SOURCE_NOT_AUTHORIZED");
    await currentSources(tx, row);
    return row;
  }
  return {
    async recordAnalysisUsage(
      claim: Pick<AIAnalysisClaim, "jobId" | "token">,
      usageInput: unknown,
    ) {
      const id = parse(AIIdSchema, claim?.jobId),
        token = parse(AIIdSchema, claim?.token),
        usage = parse(AIReportedUsageSchema, usageInput, "AI_INVALID_RESPONSE");
      return run(async (tx) => {
        const [attempt] = await tx.$queryRaw<{ token: string }[]>(
          Prisma.sql`SELECT token FROM "AIAnalysisAttempt" WHERE "jobId"=${id}::uuid AND token=${token}::uuid FOR KEY SHARE`,
        );
        if (!attempt) return false; // Erasure may have removed the whole private job while HTTP settled.
        await tx.$queryRaw(
          Prisma.sql`INSERT INTO "AIAnalysisUsageReport" ("attemptToken","inputTokens","outputTokens") VALUES (${token}::uuid,${usage.inputTokens},${usage.outputTokens}) ON CONFLICT ("attemptToken") DO NOTHING`,
        );
        const [report] = await tx.$queryRaw<
          { inputTokens: number | null; outputTokens: number | null }[]
        >(
          Prisma.sql`SELECT "inputTokens","outputTokens" FROM "AIAnalysisUsageReport" WHERE "attemptToken"=${token}::uuid`,
        );
        if (
          !report ||
          report.inputTokens !== usage.inputTokens ||
          report.outputTokens !== usage.outputTokens
        )
          return failure("AI_REQUEST_CONFLICT");
        return true;
      });
    },
    async dispatchCandidates(limit = 32) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 32) return failure("AI_INVALID_REQUEST");
      return run(async (tx) =>
        (
          await tx.$queryRaw<{ id: string }[]>(
            Prisma.sql`SELECT id FROM "AIAnalysisJob" WHERE (status='PENDING' AND "nextAttemptAt"<=clock_timestamp() AT TIME ZONE 'UTC' AND ("lastDispatchedAt" IS NULL OR "lastDispatchedAt"<clock_timestamp() AT TIME ZONE 'UTC'-interval '30 seconds')) OR (status='PROCESSING' AND "leaseUntil"<=clock_timestamp() AT TIME ZONE 'UTC') ORDER BY "nextAttemptAt",id LIMIT ${limit}`,
          )
        ).map((row) => row.id),
      );
    },
    async noteDispatched(idInput: unknown) {
      const id = parse(AIIdSchema, idInput);
      await run(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`UPDATE "AIAnalysisJob" SET "lastDispatchedAt"=date_trunc('milliseconds',clock_timestamp() AT TIME ZONE 'UTC') WHERE id=${id}::uuid AND status='PENDING'`,
        );
      });
    },
    async renewAnalysis(claim: Pick<AIAnalysisClaim, "jobId" | "token">) {
      const id = parse(AIIdSchema, claim?.jobId),
        token = parse(AIIdSchema, claim?.token);
      return run(async (tx) => {
        await activeClaim(tx, id, token);
        const rows = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`UPDATE "AIAnalysisJob" SET "leaseUntil"=GREATEST("leaseUntil",date_trunc('milliseconds',clock_timestamp() AT TIME ZONE 'UTC')+${config.leaseMs}*interval '1 millisecond') WHERE id=${id}::uuid AND status='PROCESSING' AND "leaseToken"=${token}::uuid AND "leaseUntil">clock_timestamp() AT TIME ZONE 'UTC' RETURNING id`,
        );
        return rows.length === 1;
      });
    },
    async getWorkerContext(claim: Pick<AIAnalysisClaim, "jobId" | "token">) {
      const id = parse(AIIdSchema, claim?.jobId),
        token = parse(AIIdSchema, claim?.token);
      return run(async (tx) => {
        const row = await activeClaim(tx, id, token);
        const categories = await tx.$queryRaw<{ key: string }[]>(
          Prisma.sql`SELECT key FROM "CategoryTemplate" ORDER BY key LIMIT 100`,
        );
        // Match locally against the personal title; only public catalog titles leave this boundary.
        const candidates = await tx.$queryRaw<
          { catalogEntryId: string; catalogVariantId: null; title: string }[]
        >(
          Prisma.sql`SELECT e.id AS "catalogEntryId",NULL::uuid AS "catalogVariantId",e.authored#>>'{text,title}' AS title FROM "CatalogEntry" e JOIN "CollectibleItem" i ON i.id=${row.itemId}::uuid WHERE (i."categoryTemplateId" IS NULL OR e."categoryTemplateId"=i."categoryTemplateId") AND length(e.authored#>>'{text,title}') BETWEEN 1 AND 200 AND strpos(lower(e.authored#>>'{text,title}'),lower(left(i.title,80)))>0 ORDER BY e.id LIMIT 20`,
        );
        return {
          categories: categories.map((category) => category.key),
          catalogCandidates: candidates,
        };
      });
    },
    async failAnalysis(
      claim: Pick<AIAnalysisClaim, "jobId" | "token">,
      codeInput: unknown,
      retry: boolean,
      usageInput: unknown = { inputTokens: null, outputTokens: null },
    ) {
      const id = parse(AIIdSchema, claim?.jobId),
        token = parse(AIIdSchema, claim?.token),
        code = parse(AIErrorCodeSchema, codeInput),
        usage = parse(AIReportedUsageSchema, usageInput, "AI_INVALID_RESPONSE");
      return run(async (tx) => {
        const initial = await load(tx, id);
        if (!initial) return false;
        await lockRequester(tx, initial);
        const row = await load(tx, id, undefined, true);
        if (!row || row.status !== "PROCESSING" || row.leaseToken !== token) return false;
        await tx.$queryRaw(
          Prisma.sql`UPDATE "AIAnalysisAttempt" SET outcome='FAILED',"errorCode"=${code},"inputTokens"=${usage.inputTokens},"outputTokens"=${usage.outputTokens},"finishedAt"=date_trunc('milliseconds',clock_timestamp() AT TIME ZONE 'UTC') WHERE "jobId"=${id}::uuid AND token=${token}::uuid AND outcome='PENDING'`,
        );
        const state = retry && row.attempts < 3 ? "PENDING" : "FAILED";
        await tx.$queryRaw(
          Prisma.sql`UPDATE "AIAnalysisJob" SET status=${state}::"AIAnalysisStatus","errorCode"=${code},"leaseToken"=NULL,"leaseUntil"=NULL,"nextAttemptAt"=date_trunc('milliseconds',clock_timestamp() AT TIME ZONE 'UTC')+interval '30 seconds',"lastDispatchedAt"=NULL,"updatedAt"=date_trunc('milliseconds',clock_timestamp() AT TIME ZONE 'UTC') WHERE id=${id}::uuid`,
        );
        return true;
      });
    },
    async requestItemAnalysis(
      actor: { userId: string },
      itemId: unknown,
      assetIds: unknown,
      requestKey: unknown,
    ) {
      const who = owner(actor),
        input = parse(RequestAIAnalysisSchema, { itemId, assetIds, requestKey });
      const digest = sha({ itemId: input.itemId, assetIds: input.assetIds });
      return run(async (tx) => {
        const item = await ownedItem(tx, who, input.itemId);
        const prior = await tx.$queryRaw<JobRow[]>(
          Prisma.sql`SELECT * FROM "AIAnalysisJob" WHERE "requesterId"=${who} AND "requestKey"=${input.requestKey}::uuid`,
        );
        if (prior[0]) {
          if (prior[0].requestDigest !== digest) return failure("AI_REQUEST_CONFLICT");
          return summary(prior[0]);
        }
        const selected = await sources(tx, who, input.itemId, input.assetIds);
        const [count] = await tx.$queryRaw<{ total: bigint }[]>(
          Prisma.sql`SELECT count(*) AS total FROM "AIAnalysisJob" WHERE "requesterId"=${who} AND "createdAt">=date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC') AND "createdAt"<date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')+interval '1 month'`,
        );
        if (!count || count.total >= BigInt(config.monthlyRequestLimit))
          return failure("AI_LIMIT_REACHED");
        const [row] = await tx.$queryRaw<JobRow[]>(
          Prisma.sql`INSERT INTO "AIAnalysisJob" (id,"requesterId","itemId","collectionId","requestKey","requestDigest",sources,"providerId",model,"createdAt","updatedAt") VALUES (${randomUUID()}::uuid,${who},${input.itemId}::uuid,${item.collectionId}::uuid,${input.requestKey}::uuid,${digest},${JSON.stringify(selected)}::jsonb,${config.providerId},${config.model},date_trunc('milliseconds',clock_timestamp() AT TIME ZONE 'UTC'),date_trunc('milliseconds',clock_timestamp() AT TIME ZONE 'UTC')) RETURNING *`,
        );
        if (!row) return failure("AI_UNAVAILABLE");
        return summary(row);
      });
    },
    async getAnalysis(actor: { userId: string }, idInput: unknown) {
      const who = owner(actor),
        id = parse(AIIdSchema, idInput);
      return run(async (tx) => {
        const row = await load(tx, id, who);
        if (!row) return failure("AI_ITEM_NOT_FOUND");
        await ownedItem(tx, who, row.itemId);
        const current = await load(tx, id, who);
        if (!current) return failure("AI_ITEM_NOT_FOUND");
        const [result] = await tx.$queryRaw<{ payload: unknown; payloadSha256: string }[]>(
          Prisma.sql`SELECT payload,"payloadSha256" FROM "AIAnalysisSuggestion" WHERE "jobId"=${id}::uuid`,
        );
        const analysis =
          current.status === "READY" && result ? parseCollectibleAnalysis(result.payload) : null;
        if (current.status === "READY" && (!analysis || sha(analysis) !== result?.payloadSha256))
          return failure("AI_UNAVAILABLE");
        return { job: summary(current), analysis };
      });
    },
    async claimAnalysis(idInput: unknown): Promise<AIAnalysisClaim | null> {
      const id = parse(AIIdSchema, idInput);
      return run(async (tx) => {
        const initial = await load(tx, id);
        if (!initial || !["PENDING", "PROCESSING"].includes(initial.status)) return null;
        await lockRequester(tx, initial);
        let invalid: AIAnalysisError["code"] | undefined;
        try {
          await ownedItem(tx, initial.requesterId, initial.itemId);
        } catch (error) {
          if (error instanceof AIAnalysisError) invalid = error.code;
          else throw error;
        }
        const row = await load(tx, id, undefined, true);
        if (!row || !["PENDING", "PROCESSING"].includes(row.status)) return null;
        if (invalid) {
          await closePending(tx, row, "AI_SOURCE_NOT_AUTHORIZED");
          return null;
        }
        const [eligible] = await tx.$queryRaw<{ ready: boolean; expired: boolean }[]>(
          Prisma.sql`SELECT ((status='PENDING' AND "nextAttemptAt"<=clock_timestamp() AT TIME ZONE 'UTC') OR (status='PROCESSING' AND "leaseUntil"<=clock_timestamp() AT TIME ZONE 'UTC')) AND attempts<3 AS ready, (status='PROCESSING' AND "leaseUntil"<=clock_timestamp() AT TIME ZONE 'UTC') AS expired FROM "AIAnalysisJob" WHERE id=${id}::uuid`,
        );
        if (!eligible?.ready) {
          if (row.status === "PROCESSING" && row.attempts >= 3 && eligible?.expired)
            await closePending(tx, row, "AI_PROVIDER_UNAVAILABLE");
          return null;
        }
        let selected: AIAnalysisSource[];
        try {
          selected = await currentSources(tx, row);
          if (row.collectionId !== (await ownedItem(tx, row.requesterId, row.itemId)).collectionId)
            return failure("AI_SOURCE_NOT_AUTHORIZED");
        } catch (error) {
          if (!(error instanceof AIAnalysisError)) throw error;
          await closePending(tx, row, "AI_SOURCE_NOT_AUTHORIZED");
          return null;
        }
        await tx.$queryRaw(
          Prisma.sql`UPDATE "AIAnalysisAttempt" SET outcome='ABANDONED',"finishedAt"=date_trunc('milliseconds',clock_timestamp() AT TIME ZONE 'UTC') WHERE "jobId"=${id}::uuid AND outcome='PENDING'`,
        );
        const token = randomUUID();
        const [claimed] = await tx.$queryRaw<JobRow[]>(
          Prisma.sql`UPDATE "AIAnalysisJob" SET status='PROCESSING',attempts=attempts+1,"leaseToken"=${token}::uuid,"leaseUntil"=date_trunc('milliseconds',clock_timestamp() AT TIME ZONE 'UTC')+${config.leaseMs}*interval '1 millisecond',"errorCode"=NULL,"updatedAt"=date_trunc('milliseconds',clock_timestamp() AT TIME ZONE 'UTC') WHERE id=${id}::uuid RETURNING *`,
        );
        if (!claimed) return failure("AI_STALE_JOB");
        await tx.$queryRaw(
          Prisma.sql`INSERT INTO "AIAnalysisAttempt" ("jobId",number,token) VALUES (${id}::uuid,${claimed.attempts},${token}::uuid)`,
        );
        return Object.freeze({
          jobId: id,
          token,
          attempt: claimed.attempts,
          providerId: row.providerId,
          model: row.model,
          sources: Object.freeze(selected),
        });
      });
    },
    async storeAnalysisResult(
      claim: Pick<AIAnalysisClaim, "jobId" | "token">,
      input: unknown,
      usageInput: unknown = { inputTokens: null, outputTokens: null },
    ) {
      const id = parse(AIIdSchema, claim?.jobId),
        token = parse(AIIdSchema, claim?.token),
        analysis = parseCollectibleAnalysis(input),
        usage = parse(AIReportedUsageSchema, usageInput, "AI_INVALID_RESPONSE");
      return run(async (tx) => {
        const initial = await load(tx, id);
        if (!initial) return failure("AI_STALE_JOB");
        await ownedItem(tx, initial.requesterId, initial.itemId);
        const row = await load(tx, id, undefined, true);
        if (!row) return failure("AI_STALE_JOB");
        const item = await ownedItem(tx, row.requesterId, row.itemId);
        if (item.collectionId !== row.collectionId) return failure("AI_SOURCE_NOT_AUTHORIZED");
        await currentSources(tx, row);
        const [active] = await tx.$queryRaw<{ active: boolean }[]>(
          Prisma.sql`SELECT status='PROCESSING' AND "leaseToken"=${token}::uuid AND "leaseUntil">clock_timestamp() AT TIME ZONE 'UTC' AS active FROM "AIAnalysisJob" WHERE id=${id}::uuid`,
        );
        if (!active?.active) return failure("AI_STALE_JOB");
        if (analysis.categoryKey !== null) {
          const category = await tx.$queryRaw<{ id: string }[]>(
            Prisma.sql`SELECT id FROM "CategoryTemplate" WHERE key=${analysis.categoryKey}`,
          );
          if (!category.length) return failure("AI_INVALID_RESPONSE");
        }
        for (const candidate of analysis.catalogCandidates) {
          const match = await tx.$queryRaw<{ id: string }[]>(
            Prisma.sql`SELECT e.id FROM "CatalogEntry" e JOIN "CategoryTemplate" c ON c.id=e."categoryTemplateId" WHERE e.id=${candidate.catalogEntryId}::uuid AND (${analysis.categoryKey}::text IS NULL OR c.key=${analysis.categoryKey}) AND (${candidate.catalogVariantId}::uuid IS NULL OR EXISTS(SELECT 1 FROM "CatalogVariant" v WHERE v.id=${candidate.catalogVariantId}::uuid AND v."entryId"=e.id AND v.active))`,
          );
          if (!match.length) return failure("AI_INVALID_RESPONSE");
        }
        await tx.$queryRaw(
          Prisma.sql`INSERT INTO "AIAnalysisSuggestion" ("jobId","completionToken",payload,"payloadSha256") VALUES (${id}::uuid,${token}::uuid,${JSON.stringify(analysis)}::jsonb,${sha(analysis)})`,
        );
        await tx.$queryRaw(
          Prisma.sql`UPDATE "AIAnalysisAttempt" SET outcome='SUCCEEDED',"inputTokens"=${usage.inputTokens},"outputTokens"=${usage.outputTokens},"finishedAt"=date_trunc('milliseconds',clock_timestamp() AT TIME ZONE 'UTC') WHERE "jobId"=${id}::uuid AND token=${token}::uuid AND outcome='PENDING'`,
        );
        const [ready] = await tx.$queryRaw<JobRow[]>(
          Prisma.sql`UPDATE "AIAnalysisJob" SET status='READY',"leaseToken"=NULL,"leaseUntil"=NULL,"updatedAt"=date_trunc('milliseconds',clock_timestamp() AT TIME ZONE 'UTC') WHERE id=${id}::uuid AND status='PROCESSING' AND "leaseToken"=${token}::uuid AND "leaseUntil">clock_timestamp() AT TIME ZONE 'UTC' RETURNING *`,
        );
        if (!ready) return failure("AI_STALE_JOB");
        return summary(ready);
      });
    },
  };
}
