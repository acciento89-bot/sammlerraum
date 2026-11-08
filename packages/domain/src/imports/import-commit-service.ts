import { BillingError } from "@sammlerraum/contracts/billing";
import { communityEventHandlers } from "../notifications/community-event-handlers";
import {
  beginMutationAudit,
  appendMutationAudit,
  auditSqlTransaction,
} from "../audit/mutation-audit";
import { createTrustedAuditContext } from "../audit/audit-context";
import { captureMoneyAuditSnapshot } from "../audit/money-audit";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@sammlerraum/db/search-sql";
import {
  ImportMappingSchema,
  ImportPreviewRowSchema,
  ImportDecisionsInputSchema,
  ImportMergeTargetInputSchema,
  ImportCommitApprovalInputSchema,
  ImportDecisionInputSchema,
  ImportServiceError,
  importFail,
  type ImportMapping,
  type ImportPreviewRow,
  type ImportDecisionInput,
} from "@sammlerraum/contracts/imports";
import { CreateItemInputSchema, UpdateItemInputSchema } from "@sammlerraum/contracts/items";
import {
  createItemInTransaction,
  updateItemInTransaction,
  readOwnedItemInTransaction,
  type ItemTransaction,
  ItemServiceError,
} from "../items/item-service";
import {
  createIdentifierService,
  type IdentifierTransaction,
  IdentifierServiceError,
} from "../items/identifier-service";
import {
  readMoneyFact,
  requireMoneyToken,
  appendMoneyAssertion,
} from "../money/legacy-money-store";
import { moneyTransaction } from "../money/legacy-money-transaction";
import { validateMoneyImportRow } from "../money/money-transfer";
import { LegacyMoneyError } from "@sammlerraum/contracts/legacy-money";
import {
  ValidatedMoneyImportRowSchema,
  MoneyTransferError,
} from "@sammlerraum/contracts/money-transfer";
import { previewImportRow } from "./import-service";
export class ImportCommitRejected extends ImportServiceError {
  constructor(
    readonly expectedJobRevision: number,
    readonly failureCode:
      | "IMPORT_COMMIT_CONFLICT"
      | "IMPORT_PLAN_LIMIT_REACHED" = "IMPORT_COMMIT_CONFLICT",
  ) {
    super("IMPORT_CONFLICT");
  }
}
function permanent(error: unknown) {
  return (
    (error instanceof BillingError && error.code === "PLAN_LIMIT_REACHED") ||
    error instanceof ImportServiceError ||
    error instanceof MoneyTransferError ||
    error instanceof ItemServiceError ||
    error instanceof IdentifierServiceError ||
    error instanceof z.ZodError ||
    (error instanceof LegacyMoneyError && error.code !== "MONEY_UNAVAILABLE")
  );
}
type Tx = ItemTransaction & IdentifierTransaction;
export type ImportCommitDatabase = {
  $transaction<T>(
    work: (tx: Tx) => Promise<T>,
    options: { isolationLevel: "ReadCommitted"; maxWait: number; timeout: number },
  ): Promise<T>;
};
type Job = {
  id: string;
  ownerId: string;
  collectionId: string;
  status: string;
  revision: number;
  sourceVerifiedAt: Date | null;
  sourceChecksumSha256: string;
  totalRows: number | null;
  parsedRows: number;
  previewedRows: number;
  committedRows: number;
  previewGeneration: number;
  mappingSnapshot: unknown;
  mappingHash: string | null;
  commitApprovedAt: Date | null;
  commitApprovalRevision: number | null;
};
type Row = {
  id: string;
  rowNumber: number;
  rowKey: string;
  rawCells: unknown;
  status: string;
  previewGeneration: number;
  preview: unknown;
  decision: unknown;
  committedItemId: string | null;
  commitReceipt: unknown;
  committedAt: Date | null;
};
const idSchema = z.uuid().transform((v) => v.toLowerCase());
const q = <T>(tx: Tx, sql: Prisma.Sql) => moneyTransaction(tx).$queryRaw<T>(sql);
function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, v]) => JSON.stringify(key) + ":" + stable(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
function digest(value: unknown) {
  return createHash("sha256").update(stable(value)).digest("hex");
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) return importFail("IMPORT_INVALID");
  return result.data;
}
function actor(input: { userId: string }) {
  if (!input || typeof input.userId !== "string" || !input.userId || input.userId.length > 512)
    return importFail("IMPORT_NOT_FOUND");
  return input.userId;
}
async function lockJob(tx: Tx, id: string, owner?: string): Promise<Job> {
  const [discovered] = await q<{ ownerId: string }[]>(
    tx,
    Prisma.sql`SELECT j."ownerId" FROM "ImportJob" j JOIN "Collection" c ON c.id=j."collectionId" AND c."ownerId"=j."ownerId" WHERE j.id=${id}::uuid AND c."deletedAt" IS NULL ${owner === undefined ? Prisma.empty : Prisma.sql`AND j."ownerId"=${owner}`}`,
  );
  if (!discovered) return importFail("IMPORT_NOT_FOUND");
  await beginMutationAudit(
    tx,
    discovered.ownerId,
    () => new ImportServiceError("IMPORT_NOT_FOUND"),
  );
  const [job] = await q<Job[]>(
    tx,
    Prisma.sql`SELECT j.* FROM "ImportJob" j JOIN "Collection" c ON c.id=j."collectionId" AND c."ownerId"=j."ownerId" WHERE j.id=${id}::uuid AND j."ownerId"=${discovered.ownerId} AND c."deletedAt" IS NULL ${owner === undefined ? Prisma.empty : Prisma.sql`AND j."ownerId"=${owner} AND j."sourceExpiresAt">timezone('UTC',CURRENT_TIMESTAMP)`} FOR UPDATE OF j,c`,
  );
  if (!job) return importFail("IMPORT_NOT_FOUND");
  return job;
}
function mapping(job: Job): ImportMapping {
  const value = parse(ImportMappingSchema, job.mappingSnapshot);
  if (
    !job.sourceVerifiedAt ||
    job.totalRows === null ||
    job.totalRows !== job.parsedRows ||
    job.previewedRows !== job.totalRows ||
    job.previewGeneration < 1 ||
    createHash("sha256").update(JSON.stringify(value)).digest("hex") !== job.mappingHash
  )
    return importFail("IMPORT_CONFLICT");
  return value;
}
async function coverage(tx: Tx, job: Job, decisions = false) {
  const [counts] = await q<
    { count: bigint; min: number | null; max: number | null; invalid: bigint; finished: bigint }[]
  >(
    tx,
    Prisma.sql`SELECT count(*) AS count,min("rowNumber") AS min,max("rowNumber") AS max,count(*) FILTER (WHERE "previewGeneration"<>${job.previewGeneration} OR preview IS NULL OR (${decisions} AND (decision IS NULL OR decision->>'previewGeneration' IS DISTINCT FROM ${String(job.previewGeneration)}))) AS invalid,count(*) FILTER(WHERE status IN ('COMMITTED','SKIPPED')) AS finished FROM "ImportRow" WHERE "jobId"=${job.id}::uuid`,
  );
  if (
    !counts ||
    Number(counts.count) !== job.totalRows ||
    Number(counts.invalid) !== 0 ||
    Number(counts.finished) !== job.committedRows ||
    (job.totalRows! > 0 && (counts.min !== 1 || counts.max !== job.totalRows))
  )
    return importFail("IMPORT_CONFLICT");
}
async function loadRow(tx: Tx, job: Job, rowNumber: number) {
  const [row] = await q<Row[]>(
    tx,
    Prisma.sql`SELECT * FROM "ImportRow" WHERE "jobId"=${job.id}::uuid AND "rowNumber"=${rowNumber} FOR UPDATE`,
  );
  if (!row) return importFail("IMPORT_NOT_FOUND");
  return row;
}
function preview(job: Job, row: Row, map: ImportMapping): ImportPreviewRow {
  const value = parse(ImportPreviewRowSchema, row.preview);
  if (
    row.rowKey !== `${job.id}:${row.rowNumber}` ||
    row.previewGeneration !== job.previewGeneration ||
    value.rowKey !== row.rowKey
  )
    return importFail("IMPORT_CONFLICT");
  const rebuilt = previewImportRow(row.rawCells, map, {
    rowKey: row.rowKey,
    matchingItemIds: value.matchingItemIds,
    duplicateInSource: value.duplicateInSource,
  });
  if (digest(rebuilt) !== digest(value)) return importFail("IMPORT_CONFLICT");
  if (value.values?.purchaseMoney)
    validateMoneyImportRow(value.values.purchaseMoney.source, value.values.purchaseMoney);
  return value;
}
const storedDecisionSchema = z
  .object({
    schemaVersion: z.literal(1),
    previewGeneration: z.number().int().positive(),
    previewDigest: z.string().regex(/^[0-9a-f]{64}$/u),
    choice: ImportDecisionInputSchema,
    targetFactToken: z.string().max(4096).nullable(),
    replacementMoneyPreview: ValidatedMoneyImportRowSchema.nullable(),
  })
  .strict();
type StoredDecision = z.infer<typeof storedDecisionSchema>;
function chosenFields(choice: ImportDecisionInput, value: ImportPreviewRow, map: ImportMapping) {
  if (!value.allowedActions.includes(choice.action)) return importFail("IMPORT_CONFLICT");
  if (choice.action === "MERGE") {
    if (!value.values || !value.matchingItemIds.includes(choice.targetItemId))
      return importFail("IMPORT_CONFLICT");
    for (const field of choice.fields) {
      if (
        (field === "quantity" && map.columns.quantity === undefined) ||
        (field === "identifier" && (!map.columns.identifier || !value.values.identifier)) ||
        (field === "purchaseMoney" &&
          (!map.columns.purchaseMoney || !value.values.purchaseMoney)) ||
        (field === "acquiredOn" && (!map.columns.acquiredOn || !value.values.acquiredOn))
      )
        return importFail("IMPORT_INVALID");
    }
  }
}
async function target(tx: Tx, job: Job, row: Row, value: ImportPreviewRow, targetId: string) {
  if (!value.matchingItemIds.includes(targetId)) return importFail("IMPORT_NOT_FOUND");
  const item = await readOwnedItemInTransaction(tx, job.ownerId, targetId);
  if (
    item.collectionId !== job.collectionId ||
    item.archivedAt !== null ||
    item.disposedAt !== null
  )
    return importFail("IMPORT_CONFLICT");
  const ids = await tx.itemIdentifier.findMany({
    where: { itemId: targetId },
    select: { id: true, itemId: true, type: true, value: true, normalizedValue: true },
  });
  const purchase = await readMoneyFact(
    moneyTransaction(tx),
    { family: "PURCHASE", itemId: targetId },
    { userId: job.ownerId },
  );
  const preconditionToken = digest({
    jobId: job.id,
    rowKey: row.rowKey,
    previewGeneration: job.previewGeneration,
    previewDigest: digest(value),
    item,
    identifiers: ids
      .map(({ type, value, normalizedValue }) => ({ type, value, normalizedValue }))
      .sort((a, b) => stable(a).localeCompare(stable(b), "en")),
    factToken: purchase.factToken,
  });
  return { targetItemId: targetId, preconditionToken, item, purchase };
}
async function recheckMatches(tx: Tx, job: Job, value: ImportPreviewRow) {
  const identifier = value.values?.identifier;
  if (!identifier) return;
  const matches = await q<{ id: string }[]>(
    tx,
    Prisma.sql`SELECT i.id FROM "CollectibleItem" i JOIN "ItemIdentifier" ii ON ii."itemId"=i.id WHERE i."ownerId"=${job.ownerId} AND i."collectionId"=${job.collectionId}::uuid AND i."deletedAt" IS NULL AND ii.type=${identifier.type} AND ii."normalizedValue"=${identifier.normalizedValue} AND NOT EXISTS(SELECT 1 FROM "ImportRow" r WHERE r."jobId"=${job.id}::uuid AND r."committedItemId"=i.id AND r.status='COMMITTED' AND r.decision->'choice'->>'action' IN ('CREATE','CREATE_SEPARATE') AND r.preview->'values'->'identifier'->>'type'=ii.type AND r.preview->'values'->'identifier'->>'normalizedValue'=ii."normalizedValue") ORDER BY i.id LIMIT 10001`,
  );
  if (
    matches.length > 10000 ||
    digest(matches.map((x) => x.id).sort()) !== digest(value.matchingItemIds)
  )
    return importFail("IMPORT_CONFLICT");
}
const receiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    rowKey: z.string().max(128),
    action: z.enum(["CREATE", "CREATE_SEPARATE", "MERGE", "SKIP"]),
    itemId: z.uuid().nullable(),
    previewGeneration: z.number().int().positive(),
    decisionDigest: z.string().regex(/^[0-9a-f]{64}$/u),
    committedAt: z.string().datetime(),
  })
  .strict();
function decisionFor(row: Pick<Row, "decision" | "rowNumber">, job: Job) {
  const top = parse(
    z.object({ action: z.enum(["CREATE", "CREATE_SEPARATE", "MERGE", "SKIP"]) }).passthrough(),
    row.decision,
  );
  const { action, ...body } = top,
    decision = parse(storedDecisionSchema, body);
  if (
    action !== decision.choice.action ||
    decision.choice.rowNumber !== row.rowNumber ||
    decision.previewGeneration !== job.previewGeneration
  )
    return importFail("IMPORT_CONFLICT");
  return decision;
}
async function validateReceipts(tx: Tx, job: Job, expected: number) {
  let cursor = 0,
    count = 0;
  while (true) {
    const rows = await q<Row[]>(
      tx,
      Prisma.sql`SELECT id,"rowNumber","rowKey",decision,"committedItemId","commitReceipt","committedAt",status FROM "ImportRow" WHERE "jobId"=${job.id}::uuid AND "rowNumber">${cursor} AND status IN ('COMMITTED','SKIPPED') ORDER BY "rowNumber" LIMIT 100`,
    );
    if (!rows.length) break;
    for (const row of rows) {
      const checked = receiptSchema.safeParse(row.commitReceipt);
      if (!checked.success) return importFail("IMPORT_CONFLICT");
      const receipt = checked.data,
        decision = decisionFor(row, job);
      if (
        row.rowKey !== `${job.id}:${row.rowNumber}` ||
        receipt.rowKey !== row.rowKey ||
        receipt.previewGeneration !== job.previewGeneration ||
        receipt.action !== decision.choice.action ||
        receipt.itemId !== row.committedItemId ||
        receipt.decisionDigest !== digest(row.decision) ||
        !row.committedAt ||
        receipt.committedAt !== new Date(row.committedAt).toISOString() ||
        (receipt.action === "SKIP"
          ? row.status !== "SKIPPED" || receipt.itemId !== null
          : row.status !== "COMMITTED" || receipt.itemId === null)
      )
        return importFail("IMPORT_CONFLICT");
      cursor = row.rowNumber;
      count++;
    }
  }
  if (count !== expected) return importFail("IMPORT_CONFLICT");
}
export function createImportCommitService(database: ImportCommitDatabase) {
  const run = <T>(work: (tx: Tx) => Promise<T>) =>
    database.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT set_config('TimeZone','UTC',true),set_config('statement_timeout','4000ms',true),set_config('lock_timeout','1000ms',true)`;
        return work(tx);
      },
      { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 10000 },
    );
  async function prepareMergeTarget(actorInput: { userId: string }, input: unknown) {
    const owner = actor(actorInput),
      request = parse(ImportMergeTargetInputSchema, input);
    return run(async (tx) => {
      const job = await lockJob(tx, request.jobId, owner),
        map = mapping(job);
      if (job.status !== "REVIEW_READY" || request.previewGeneration !== job.previewGeneration)
        return importFail("IMPORT_NOT_READY");
      const row = await loadRow(tx, job, request.rowNumber),
        value = preview(job, row, map);
      if (!value.allowedActions.includes("MERGE")) return importFail("IMPORT_CONFLICT");
      return target(tx, job, row, value, request.targetItemId);
    });
  }
  async function saveDecisions(actorInput: { userId: string }, input: unknown) {
    const owner = actor(actorInput);
    if (
      typeof input === "object" &&
      input !== null &&
      "decisions" in input &&
      Array.isArray(input.decisions) &&
      input.decisions.length > 100
    )
      return importFail("IMPORT_LIMIT_EXCEEDED");
    const request = parse(ImportDecisionsInputSchema, input);
    return run(async (tx) => {
      const job = await lockJob(tx, request.jobId, owner),
        map = mapping(job);
      if (
        job.status !== "REVIEW_READY" ||
        job.revision !== request.expectedRevision ||
        job.previewGeneration !== request.previewGeneration
      )
        return importFail("IMPORT_CONFLICT");
      await coverage(tx, job);
      for (const choice of request.decisions) {
        const row = await loadRow(tx, job, choice.rowNumber),
          value = preview(job, row, map);
        chosenFields(choice, value, map);
        let targetFactToken: string | null = null;
        if (choice.action === "MERGE") {
          const selected = await target(tx, job, row, value, choice.targetItemId);
          if (selected.preconditionToken !== choice.expectedTargetToken)
            return importFail("IMPORT_CONFLICT");
          targetFactToken = selected.purchase.factToken;
        }
        const decision: StoredDecision = {
          schemaVersion: 1,
          previewGeneration: job.previewGeneration,
          previewDigest: digest(value),
          choice,
          targetFactToken,
          replacementMoneyPreview:
            choice.action === "MERGE" &&
            choice.fields.includes("purchaseMoney") &&
            value.values?.purchaseMoney
              ? validateMoneyImportRow({
                  ...value.values.purchaseMoney.source,
                  intent: "REPLACE",
                  expectedFactToken: targetFactToken,
                })
              : null,
        };
        // action remains top-level for the original durable receipt CHECK; choice retains strict user input.
        await q(
          tx,
          Prisma.sql`UPDATE "ImportRow" SET decision=${JSON.stringify({ ...decision, action: choice.action })}::jsonb,"updatedAt"=date_trunc('milliseconds',clock_timestamp()) WHERE id=${row.id}::uuid RETURNING id`,
        );
      }
      const [result] = await q<{ revision: number }[]>(
        tx,
        Prisma.sql`UPDATE "ImportJob" SET revision=revision+1,"updatedAt"=date_trunc('milliseconds',clock_timestamp()) WHERE id=${job.id}::uuid RETURNING revision`,
      );
      return { revision: result!.revision, saved: request.decisions.length };
    });
  }
  async function approveCommit(actorInput: { userId: string }, input: unknown) {
    const owner = actor(actorInput),
      request = parse(ImportCommitApprovalInputSchema, input);
    return run(async (tx) => {
      const job = await lockJob(tx, request.jobId, owner);
      mapping(job);
      if (
        job.status !== "REVIEW_READY" ||
        job.revision !== request.expectedRevision ||
        job.previewGeneration !== request.previewGeneration ||
        job.committedRows !== 0
      )
        return importFail("IMPORT_CONFLICT");
      await coverage(tx, job, true);
      const duplicates = await q<{ id: string }[]>(
        tx,
        Prisma.sql`SELECT decision->'choice'->>'targetItemId' AS id FROM "ImportRow" WHERE "jobId"=${job.id}::uuid AND decision->>'action'='MERGE' GROUP BY decision->'choice'->>'targetItemId' HAVING count(*)>1 LIMIT 1`,
      );
      if (duplicates.length) return importFail("IMPORT_CONFLICT");
      const [result] = await q<{ revision: number; status: string }[]>(
        tx,
        Prisma.sql`UPDATE "ImportJob" SET status='COMMITTING',"lastDispatchedAt"=NULL,"commitApprovedAt"=date_trunc('milliseconds',clock_timestamp()),"commitApprovalRevision"=revision,revision=revision+1,"updatedAt"=date_trunc('milliseconds',clock_timestamp()) WHERE id=${job.id}::uuid RETURNING revision,status`,
      );
      return result!;
    });
  }
  async function commitNextBatch(input: unknown) {
    const jobId = parse(idSchema, input);
    let observedRevision: number | undefined;
    try {
      return await run(async (tx) => {
        const job = await lockJob(tx, jobId);
        const audit = createTrustedAuditContext({ source: "IMPORT", actorId: job.ownerId });
        observedRevision = job.revision;
        const map = mapping(job);
        if (
          !["COMMITTING", "COMPLETED"].includes(job.status) ||
          !job.commitApprovedAt ||
          !job.commitApprovalRevision
        )
          return importFail("IMPORT_NOT_READY");
        await coverage(tx, job, true);
        const rows = await q<Row[]>(
          tx,
          Prisma.sql`SELECT * FROM "ImportRow" WHERE "jobId"=${job.id}::uuid AND status NOT IN ('COMMITTED','SKIPPED') ORDER BY "rowNumber" LIMIT 10 FOR UPDATE`,
        );
        if (job.status === "COMPLETED") {
          if (rows.length || job.committedRows !== job.totalRows)
            return importFail("IMPORT_CONFLICT");
          await validateReceipts(tx, job, job.committedRows);
          return { complete: true, processed: 0, committedRows: job.committedRows };
        }
        let processed = 0;
        for (const row of rows) {
          const value = preview(job, row, map);
          const raw = parse(
            z
              .object({ action: z.enum(["CREATE", "CREATE_SEPARATE", "MERGE", "SKIP"]) })
              .passthrough(),
            row.decision,
          );
          const { action: _action, ...body } = raw;
          const decision = parse(storedDecisionSchema, body),
            choice = decision.choice;
          if (
            decision.previewGeneration !== job.previewGeneration ||
            decision.previewDigest !== digest(value) ||
            choice.rowNumber !== row.rowNumber ||
            choice.action !== raw.action
          )
            return importFail("IMPORT_CONFLICT");
          chosenFields(choice, value, map);
          let itemId: string | null = null;
          if (choice.action !== "SKIP") {
            if (!value.values) return importFail("IMPORT_CONFLICT");
            await recheckMatches(tx, job, value);
            let beforeMoney: Awaited<ReturnType<typeof captureMoneyAuditSnapshot>> | null = null;
            const values = value.values,
              imported = values.purchaseMoney;
            let meaning = imported ? validateMoneyImportRow(imported.source, imported) : null;
            if (choice.action === "MERGE" && choice.fields.includes("purchaseMoney")) {
              const replacement = decision.replacementMoneyPreview;
              if (
                !replacement ||
                !imported ||
                replacement.source.intent !== "REPLACE" ||
                replacement.source.expectedFactToken !== decision.targetFactToken
              )
                return importFail("IMPORT_CONFLICT");
              const { expectedFactToken: _token, ...source } = replacement.source;
              if (digest({ ...source, intent: "NEW" }) !== digest(imported.source))
                return importFail("IMPORT_CONFLICT");
              meaning = validateMoneyImportRow(replacement.source, replacement);
            } else if (decision.replacementMoneyPreview !== null)
              return importFail("IMPORT_CONFLICT");
            const rawMoney =
              meaning?.kind === "CANONICAL"
                ? meaning.receipt.raw
                : meaning?.kind === "LEGACY_UNKNOWN"
                  ? meaning.raw
                  : null;
            if (choice.action === "MERGE") {
              const selected = await target(tx, job, row, value, choice.targetItemId);
              if (
                selected.preconditionToken !== choice.expectedTargetToken ||
                selected.purchase.factToken !== decision.targetFactToken
              )
                return importFail("IMPORT_CONFLICT");
              itemId = choice.targetItemId;
              if (choice.fields.includes("purchaseMoney"))
                beforeMoney = await captureMoneyAuditSnapshot(
                  moneyTransaction(tx),
                  { family: "PURCHASE", itemId },
                  job.ownerId,
                );
              const fields: Record<string, unknown> = {};
              for (const field of choice.fields) {
                if (field === "title") fields.title = values.title;
                if (field === "quantity") fields.quantity = values.quantity;
                if (field === "acquiredOn") fields.acquisitionDate = values.acquiredOn;
                if (field === "purchaseMoney") {
                  if (!rawMoney || !decision.targetFactToken) return importFail("IMPORT_CONFLICT");
                  await requireMoneyToken(
                    moneyTransaction(tx),
                    { family: "PURCHASE", itemId },
                    { userId: job.ownerId },
                    decision.targetFactToken,
                  );
                }
              }
              const metadata = Object.keys(fields).length
                ? UpdateItemInputSchema.parse(fields)
                : {};
              const write = choice.fields.includes("purchaseMoney")
                ? {
                    ...metadata,
                    purchaseAmountMinor: Number(rawMoney!.amountMinor),
                    purchaseCurrency: rawMoney!.currency,
                  }
                : metadata;
              if (Object.keys(write).length)
                await updateItemInTransaction(tx, job.ownerId, itemId, write, {
                  auditContext: audit,
                });
              if (choice.fields.includes("identifier") && values.identifier) {
                const current = await tx.itemIdentifier.findMany({
                  where: { itemId },
                  select: {
                    id: true,
                    itemId: true,
                    type: true,
                    value: true,
                    normalizedValue: true,
                  },
                });
                await createIdentifierService(
                  { $transaction: (work) => work(tx) },
                  job.ownerId,
                ).setItemIdentifiers(itemId, [...current, values.identifier]);
              }
            } else {
              const item = await createItemInTransaction(
                tx,
                job.ownerId,
                {
                  ...CreateItemInputSchema.parse({
                    collectionId: job.collectionId,
                    title: values.title,
                    quantity: values.quantity,
                    acquisitionDate: values.acquiredOn,
                    visibility: "PRIVATE",
                    tradeStatus: "NOT_FOR_TRADE",
                  }),
                  purchaseAmountMinor: rawMoney ? Number(rawMoney.amountMinor) : null,
                  purchaseCurrency: rawMoney?.currency ?? null,
                },
                { auditContext: audit },
              );
              itemId = item.id;
              if (values.identifier)
                await createIdentifierService(
                  { $transaction: (work) => work(tx) },
                  job.ownerId,
                ).setItemIdentifiers(itemId, [values.identifier]);
            }
            if (
              meaning?.kind === "CANONICAL" &&
              (choice.action !== "MERGE" || choice.fields.includes("purchaseMoney"))
            ) {
              const money = moneyTransaction(tx),
                subject = { family: "PURCHASE" as const, itemId: itemId! },
                view = await readMoneyFact(money, subject, { userId: job.ownerId }),
                fact = await requireMoneyToken(
                  money,
                  subject,
                  { userId: job.ownerId },
                  view.factToken,
                );
              await appendMoneyAssertion(money, fact, { kind: "AUTHOR", receipt: meaning.receipt });
            }
            if (
              rawMoney &&
              (choice.action !== "MERGE" || choice.fields.includes("purchaseMoney"))
            ) {
              const after = await captureMoneyAuditSnapshot(
                moneyTransaction(tx),
                { family: "PURCHASE", itemId: itemId! },
                job.ownerId,
              );
              if (JSON.stringify(beforeMoney) !== JSON.stringify(after))
                await appendMutationAudit(tx, audit, {
                  resourceType: "ITEM",
                  resourceId: itemId!,
                  action: "ITEM_MONEY_CHANGED",
                  before: beforeMoney,
                  after,
                });
            }
          }
          const committedAt = new Date().toISOString(),
            receipt = {
              schemaVersion: 1,
              rowKey: row.rowKey,
              action: choice.action,
              itemId,
              previewGeneration: job.previewGeneration,
              decisionDigest: digest(row.decision),
              committedAt,
            };
          await q(
            tx,
            Prisma.sql`UPDATE "ImportRow" SET status=${choice.action === "SKIP" ? "SKIPPED" : "COMMITTED"}::"ImportRowStatus","committedItemId"=${itemId}::uuid,"commitReceipt"=${JSON.stringify(receipt)}::jsonb,"committedAt"=${new Date(committedAt)},"updatedAt"=${new Date(committedAt)} WHERE id=${row.id}::uuid RETURNING id`,
          );
          processed++;
        }
        const committedRows = job.committedRows + processed,
          complete = committedRows === job.totalRows;
        if (!processed && !complete) return importFail("IMPORT_CONFLICT");
        if (complete) await validateReceipts(tx, job, committedRows);
        await q(
          tx,
          Prisma.sql`UPDATE "ImportJob" SET "committedRows"=${committedRows},status=${complete ? "COMPLETED" : "COMMITTING"}::"ImportJobStatus",revision=revision+1,"updatedAt"=date_trunc('milliseconds',clock_timestamp()) WHERE id=${job.id}::uuid RETURNING id`,
        );
        await appendMutationAudit(tx, audit, {
          resourceType: "IMPORT_JOB",
          resourceId: job.id,
          action: "IMPORT_BATCH_COMMITTED",
          before: { committedRows: job.committedRows, status: job.status, revision: job.revision },
          after: {
            committedRows,
            status: complete ? "COMPLETED" : "COMMITTING",
            revision: job.revision + 1,
          },
        });
        if (complete)
          await communityEventHandlers(auditSqlTransaction(tx)).onJobCompleted({
            id: job.id,
            recipientId: job.ownerId,
            kind: "IMPORT",
          });
        return { complete, processed, committedRows };
      });
    } catch (error) {
      if (observedRevision !== undefined && permanent(error))
        throw new ImportCommitRejected(
          observedRevision,
          error instanceof BillingError && error.code === "PLAN_LIMIT_REACHED"
            ? "IMPORT_PLAN_LIMIT_REACHED"
            : "IMPORT_COMMIT_CONFLICT",
        );
      throw error;
    }
  }
  async function failCommit(
    input: unknown,
    expectedJobRevision: number,
    failureCode: "IMPORT_COMMIT_CONFLICT" | "IMPORT_PLAN_LIMIT_REACHED" = "IMPORT_COMMIT_CONFLICT",
  ) {
    if (!["IMPORT_COMMIT_CONFLICT", "IMPORT_PLAN_LIMIT_REACHED"].includes(failureCode))
      return false;
    const jobId = parse(idSchema, input);
    return run(async (tx) => {
      const job = await lockJob(tx, jobId);
      if (
        job.revision !== expectedJobRevision ||
        !job.commitApprovedAt ||
        !["COMMITTING", "COMPLETED"].includes(job.status)
      )
        return false;
      await q(
        tx,
        Prisma.sql`UPDATE "ImportJob" SET status='FAILED',"errorCode"=${failureCode},revision=revision+1,"updatedAt"=date_trunc('milliseconds',clock_timestamp()) WHERE id=${job.id}::uuid RETURNING id`,
      );
      return true;
    });
  }
  return { prepareMergeTarget, saveDecisions, approveCommit, commitNextBatch, failCommit };
}
