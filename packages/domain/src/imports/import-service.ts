import {
  ImportMappingSchema,
  ImportRawRowSchema,
  ImportRowContextSchema,
  ImportPreviewRowSchema,
  ImportDecisionInputSchema,
  importFail,
  type ImportMappedValues,
  type ImportPreviewRow,
} from "@sammlerraum/contracts/imports";
import { CollectibleItemSchema, AcquisitionDateSchema } from "@sammlerraum/contracts/items";
import { validateMoneyImportRow } from "../money/money-transfer";
import { parseItemIdentifiers } from "../items/identifier-service";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@sammlerraum/db/search-sql";
import { searchFail } from "@sammlerraum/contracts/item-search";
import {
  ImportJobCreateInputSchema,
  ImportParserOptionsSchema,
  ImportJobDtoSchema,
  ImportProfileMutationSchema,
  ImportProfileDtoSchema,
  type ImportJobDto,
  type ImportProfileDto,
} from "@sammlerraum/contracts/imports";
import {
  runSearchTransaction,
  type SearchDatabase,
  type BoundedSearchReadTransaction,
} from "../search/search-read";
import {
  ImportPreviewInputSchema,
  ImportPreviewBatchSchema,
  type ImportPreviewBatch,
  type ImportMapping,
} from "@sammlerraum/contracts/imports";
import {
  ImportPreviewPageInputSchema,
  ImportPreviewPageSchema,
  type ImportPreviewPage,
} from "@sammlerraum/contracts/imports";

/** Pure row interpretation. Matching context is supplied only by the owned server selection. */
export function previewImportRow(
  input: unknown,
  mappingInput: unknown,
  contextInput: unknown,
): ImportPreviewRow {
  const mapping = ImportMappingSchema.safeParse(mappingInput),
    context = ImportRowContextSchema.safeParse(contextInput);
  if (!mapping.success || !context.success) return importFail("IMPORT_INVALID");
  const raw = ImportRawRowSchema.safeParse(input),
    errors: ImportPreviewRow["errors"] = [],
    columns = mapping.data.columns;
  const matchingItemIds = [...new Set(context.data.matchingItemIds)].sort();
  const base = {
    rowKey: context.data.rowKey,
    matchingItemIds,
    duplicateInSource: context.data.duplicateInSource,
    decision: null,
  };
  if (!raw.success)
    return ImportPreviewRowSchema.parse({
      ...base,
      status: "INVALID",
      values: null,
      errors: [{ field: "row", code: "INVALID_VALUE" }],
      allowedActions: ["SKIP"],
    });
  const cell = (index: number) => raw.data[index] ?? "";
  const read = <T>(
    field: ImportPreviewRow["errors"][number]["field"],
    work: () => T,
    fallback: T,
  ): T => {
    try {
      return work();
    } catch {
      errors.push({ field, code: "INVALID_VALUE" });
      return fallback;
    }
  };
  const title = read(
    "title",
    () => CollectibleItemSchema.shape.title.parse(cell(columns.title)),
    "",
  );
  const quantity = read(
    "quantity",
    () => {
      if (columns.quantity === undefined) return 1;
      const value = cell(columns.quantity).trim();
      if (!/^[1-9][0-9]{0,9}$/u.test(value)) throw Error();
      return CollectibleItemSchema.shape.quantity.parse(Number(value));
    },
    1,
  );
  const identifier =
    columns.identifier === undefined
      ? null
      : read(
          "identifier",
          () => {
            const value = cell(columns.identifier!.column).trim();
            if (!value) return null;
            return parseItemIdentifiers([{ type: columns.identifier!.type, value }])[0] ?? null;
          },
          null,
        );
  const purchaseMoney =
    columns.purchaseMoney === undefined
      ? null
      : read(
          "purchaseMoney",
          () => {
            const m = columns.purchaseMoney!,
              amount = cell(m.amountColumn).trim(),
              currency = m.fixedCurrency ?? cell(m.currencyColumn!).trim();
            if (!amount && !currency) return null;
            if (!amount && m.fixedCurrency !== undefined) return null;
            if (m.sourceKind === "DECIMAL")
              return validateMoneyImportRow({
                schemaVersion: 1,
                rowKey: context.data.rowKey,
                profileId: m.profileId,
                sourceKind: "DECIMAL",
                authoring: { kind: "DECIMAL", profileId: m.profileId, currency, decimal: amount },
                intent: "NEW",
              });
            if (m.profileId === null)
              return validateMoneyImportRow({
                schemaVersion: 1,
                rowKey: context.data.rowKey,
                profileId: null,
                sourceKind: "RAW",
                sourceContract: m.sourceContract,
                authoring: { amountMinor: amount, currency },
                intent: "NEW",
              });
            const rawExponent = cell(m.exponentColumn!).trim();
            if (!/^[0-9]$/u.test(rawExponent)) throw Error();
            return validateMoneyImportRow({
              schemaVersion: 1,
              rowKey: context.data.rowKey,
              profileId: m.profileId,
              sourceKind: "RAW",
              sourceContract: m.sourceContract,
              authoring: {
                kind: "RAW",
                profileId: m.profileId,
                currency,
                amountMinor: amount,
                exponent: Number(rawExponent),
                unitKey: cell(m.unitKeyColumn!).trim(),
              },
              intent: "NEW",
            });
          },
          null,
        );
  const acquiredOn =
    columns.acquiredOn === undefined
      ? null
      : read(
          "acquiredOn",
          () => {
            const m = columns.acquiredOn!,
              value = cell(m.column).trim();
            if (!value) return null;
            let canonical = value;
            if (m.format === "DD.MM.YYYY") {
              const parts = /^([0-9]{2})\.([0-9]{2})\.([0-9]{4})$/u.exec(value);
              if (!parts) throw Error();
              canonical = `${parts[3]}-${parts[2]}-${parts[1]}`;
            }
            if (!/^[0-9]{4}-/u.test(canonical) || canonical.startsWith("0000")) throw Error();
            return AcquisitionDateSchema.parse(canonical);
          },
          null,
        );
  const conflict = matchingItemIds.length > 0 || context.data.duplicateInSource;
  const values: ImportMappedValues = { title, quantity, identifier, purchaseMoney, acquiredOn };
  return ImportPreviewRowSchema.parse({
    ...base,
    status: errors.length ? "INVALID" : conflict ? "CONFLICT" : "READY",
    values: errors.length ? null : values,
    errors,
    allowedActions: errors.length
      ? ["SKIP"]
      : conflict
        ? matchingItemIds.length
          ? ["SKIP", "MERGE", "CREATE_SEPARATE"]
          : ["SKIP", "CREATE_SEPARATE"]
        : ["CREATE", "SKIP"],
  });
}

type ImportActor = { userId: string };
type JobRow = {
  id: string;
  ownerId: string;
  collectionId: string;
  locale: string;
  status: string;
  revision: number;
  sourceFormat: string;
  sourceFileName: string;
  sourceByteSize: string;
  sourceChecksumSha256: string;
  sourceStorageKey: string;
  sourceVerifiedAt: Date | null;
  parsedHeader: unknown;
  errorCode: string | null;
  uploadCompletedAt: Date | null;
  sourceExpiresAt: Date;
  parserOptions: unknown;
  totalRows: number | null;
  parsedRows: number;
  previewedRows: number;
  committedRows: number;
  previewGeneration: number;
  mappingSnapshot: unknown;
  mappingHash: string | null;
  mappingProfileId: string | null;
  mappingProfileRevision: number | null;
  createdAt: Date;
  updatedAt: Date;
};
const jobColumns = Prisma.sql`j.*,j."sourceByteSize"::text AS "sourceByteSize"`;
function actor(input: ImportActor): string {
  if (!input || typeof input.userId !== "string" || !input.userId || input.userId.includes("\0"))
    return importFail("IMPORT_INVALID");
  return input.userId;
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) return importFail("IMPORT_INVALID");
  return result.data;
}
function iso(input: Date): string {
  if (!(input instanceof Date) || !Number.isFinite(input.getTime()))
    return searchFail("SEARCH_INVARIANT");
  return input.toISOString();
}
function jobDto(row: JobRow): ImportJobDto {
  const checked = ImportJobDtoSchema.safeParse({
    id: row.id,
    collectionId: row.collectionId,
    locale: row.locale,
    status: row.status,
    revision: row.revision,
    source: {
      format: row.sourceFormat,
      fileName: row.sourceFileName,
      byteSize: row.sourceByteSize,
      checksumSha256: row.sourceChecksumSha256,
      verified: row.sourceVerifiedAt !== null,
    },
    progress: {
      totalRows: row.totalRows,
      parsedRows: row.parsedRows,
      previewedRows: row.previewedRows,
      committedRows: row.committedRows,
    },
    previewGeneration: row.previewGeneration,
    mapping: row.mappingSnapshot,
    mappingHash: row.mappingHash,
    mappingProfile:
      row.mappingProfileId === null
        ? null
        : { id: row.mappingProfileId, revision: row.mappingProfileRevision },
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  });
  if (!checked.success) return searchFail("SEARCH_INVARIANT");
  return checked.data;
}
async function loadJob(
  tx: BoundedSearchReadTransaction,
  owner: string,
  id: string,
  lock = false,
): Promise<JobRow> {
  const rows = await tx.$queryRaw<JobRow[]>(
    Prisma.sql`SELECT ${jobColumns} FROM "ImportJob" j JOIN "Collection" c ON c.id=j."collectionId" AND c."ownerId"=j."ownerId" WHERE j.id=${id}::uuid AND j."ownerId"=${owner} AND c."ownerId"=${owner} AND c."deletedAt" IS NULL AND (j."sourceExpiresAt">timezone('UTC',CURRENT_TIMESTAMP) OR j.status='COMMITTING') ${lock ? Prisma.sql`FOR UPDATE OF j,c` : Prisma.empty}`,
  );
  if (!rows.length) return importFail("IMPORT_NOT_FOUND");
  if (rows.length !== 1) return searchFail("SEARCH_INVARIANT");
  return rows[0]!;
}
type ProfileRow = {
  id: string;
  ownerId: string;
  name: string;
  normalizedName: string;
  revision: number;
  mapping: unknown;
  createdAt: Date;
  updatedAt: Date;
};
function profileDto(row: ProfileRow): ImportProfileDto {
  const result = ImportProfileDtoSchema.safeParse({
    id: row.id,
    name: row.name,
    revision: row.revision,
    mapping: row.mapping,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  });
  if (!result.success) return searchFail("SEARCH_INVARIANT");
  return result.data;
}
export function createImportService(database: SearchDatabase) {
  return {
    async createImportJob(
      who: ImportActor,
      input: unknown,
      upload?: { requestId: string; options: unknown },
    ): Promise<ImportJobDto> {
      const owner = actor(who),
        value = parse(ImportJobCreateInputSchema, input),
        id = randomUUID();
      const uploadValue =
        upload === undefined
          ? null
          : parse(
              z
                .object({ requestId: z.string().uuid(), options: ImportParserOptionsSchema })
                .strict(),
              upload,
            );
      if (uploadValue && uploadValue.options.format !== value.source.format)
        return importFail("IMPORT_INVALID");
      return runSearchTransaction(database, async (tx) => {
        const owned = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM "Collection" WHERE id=${value.collectionId}::uuid AND "ownerId"=${owner} AND "deletedAt" IS NULL FOR UPDATE`,
        );
        if (owned.length !== 1) return importFail("IMPORT_NOT_FOUND");
        if (uploadValue) {
          const own = await tx.$queryRaw<{ id: string }[]>(
            Prisma.sql`UPDATE "user" SET id=id WHERE id=${owner} RETURNING id`,
          );
          if (own.length !== 1) return importFail("IMPORT_NOT_FOUND");
          const existing = await tx.$queryRaw<{ id: string; same: boolean; expired: boolean }[]>(
            Prisma.sql`SELECT id, ("collectionId"=${value.collectionId}::uuid AND locale=${value.locale} AND "sourceFormat"=${value.source.format}::"ImportSourceFormat" AND "sourceFileName"=${value.source.fileName} AND "sourceByteSize"=${value.source.byteSize}::bigint AND "sourceChecksumSha256"=${value.source.checksumSha256} AND "uploadOptions"=${JSON.stringify(uploadValue.options)}::jsonb) AS same, "sourceExpiresAt"<=timezone('UTC',CURRENT_TIMESTAMP) AS expired FROM "ImportJob" WHERE "ownerId"=${owner} AND "uploadRequestId"=${uploadValue.requestId}::uuid`,
          );
          if (existing.length) {
            if (!existing[0]!.same || existing[0]!.expired) return importFail("IMPORT_CONFLICT");
            return jobDto(await loadJob(tx, owner, existing[0]!.id));
          }
          const [counts] = await tx.$queryRaw<{ active: bigint; retained: bigint }[]>(
            Prisma.sql`SELECT count(*) FILTER(WHERE status NOT IN ('COMPLETED','FAILED','CANCELLED')) AS active,count(*) AS retained FROM "ImportJob" WHERE "ownerId"=${owner} AND "sourceExpiresAt">timezone('UTC',CURRENT_TIMESTAMP)`,
          );
          if (!counts || counts.active >= 3n || counts.retained >= 20n)
            return importFail("IMPORT_CONFLICT");
        }
        await tx.$queryRaw(
          Prisma.sql`INSERT INTO "ImportJob" (id,"ownerId","collectionId",locale,"sourceFormat","sourceFileName","sourceByteSize","sourceChecksumSha256","sourceStorageKey","uploadRequestId","uploadOptions","createdAt","updatedAt") VALUES (${id}::uuid,${owner},${value.collectionId}::uuid,${value.locale},${value.source.format}::"ImportSourceFormat",${value.source.fileName},${value.source.byteSize}::bigint,${value.source.checksumSha256},${`imports/${id}/source`},${uploadValue?.requestId ?? null}::uuid,${uploadValue ? JSON.stringify(uploadValue.options) : null}::jsonb,date_trunc('milliseconds',clock_timestamp()),date_trunc('milliseconds',clock_timestamp())) RETURNING id`,
        );
        return jobDto(await loadJob(tx, owner, id));
      });
    },
    async getImportJob(who: ImportActor, input: unknown): Promise<ImportJobDto> {
      const owner = actor(who),
        id = parse(z.string().uuid(), input);
      return runSearchTransaction(database, async (tx) => jobDto(await loadJob(tx, owner, id)));
    },
    async getImportState(who: ImportActor, input: unknown) {
      const owner = actor(who),
        id = parse(z.string().uuid(), input);
      return runSearchTransaction(database, async (tx) => {
        const row = await loadJob(tx, owner, id);
        const [counts] = await tx.$queryRaw<{ saved: bigint; columns: number | null }[]>(
          Prisma.sql`SELECT count(*) FILTER(WHERE decision IS NOT NULL AND "previewGeneration"=${row.previewGeneration}) AS saved,max(jsonb_array_length("rawCells")) AS columns FROM "ImportRow" WHERE "jobId"=${id}::uuid`,
        );
        return {
          job: jobDto(row),
          header: row.parsedHeader === null ? null : parse(ImportRawRowSchema, row.parsedHeader),
          columnCount: counts?.columns ?? 0,
          savedRows: Number(counts?.saved ?? 0n),
          errorCode: row.errorCode,
          uploadReady: row.uploadCompletedAt !== null,
          expiresAt: iso(row.sourceExpiresAt),
          parserOptions:
            row.parserOptions === null ? null : parse(ImportParserOptionsSchema, row.parserOptions),
        };
      });
    },
    async getImportReviewPage(who: ImportActor, input: unknown) {
      const owner = actor(who),
        request = parse(ImportPreviewPageInputSchema, input),
        page = await readPreviewPage(database, owner, request);
      const decisions = await runSearchTransaction(database, async (tx) => {
        const job = await loadJob(tx, owner, request.jobId);
        if (job.revision !== page.job.revision) return importFail("IMPORT_CONFLICT");
        const rows = await tx.$queryRaw<{ decision: { choice: unknown } }[]>(
          Prisma.sql`SELECT decision FROM "ImportRow" WHERE "jobId"=${job.id}::uuid AND "rowNumber">${request.afterRowNumber} AND "previewGeneration"=${job.previewGeneration} ORDER BY "rowNumber" LIMIT ${request.limit}`,
        );
        return rows.flatMap((row) =>
          row.decision === null ? [] : [parse(ImportDecisionInputSchema, row.decision.choice)],
        );
      });
      return { ...page, decisions };
    },
    async listImportProfiles(who: ImportActor) {
      const owner = actor(who);
      return runSearchTransaction(database, async (tx) => {
        const rows = await tx.$queryRaw<ProfileRow[]>(
          Prisma.sql`SELECT * FROM "ImportMappingProfile" WHERE "ownerId"=${owner} ORDER BY "normalizedName",id LIMIT 51`,
        );
        return { profiles: rows.slice(0, 50).map(profileDto), hasMore: rows.length > 50 };
      });
    },
    async buildImportPreview(who: ImportActor, input: unknown) {
      return buildPreview(database, actor(who), input);
    },
    async getImportPreviewPage(who: ImportActor, input: unknown) {
      return readPreviewPage(database, actor(who), input);
    },
    async saveImportProfile(who: ImportActor, input: unknown): Promise<ImportProfileDto> {
      const owner = actor(who),
        value = parse(ImportProfileMutationSchema, input),
        name = value.name,
        normalizedName = name.toLowerCase();
      if (normalizedName.length > 120) return importFail("IMPORT_INVALID");
      return runSearchTransaction(database, async (tx) => {
        // Advance the owner's MVCC version as well as locking it: a stale
        // RepeatableRead contender must retry before checking unique names.
        const own = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`UPDATE "user" SET id=id WHERE id=${owner} RETURNING id`,
        );
        if (own.length !== 1) return importFail("IMPORT_NOT_FOUND");
        if (value.profileId !== undefined) {
          const current = await tx.$queryRaw<ProfileRow[]>(
            Prisma.sql`SELECT * FROM "ImportMappingProfile" WHERE id=${value.profileId}::uuid AND "ownerId"=${owner} FOR UPDATE`,
          );
          if (current.length !== 1) return importFail("IMPORT_NOT_FOUND");
          if (
            current[0]!.revision !== value.expectedRevision ||
            current[0]!.revision === 2147483647
          )
            return importFail("IMPORT_CONFLICT");
        }
        const collision = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM "ImportMappingProfile" WHERE "ownerId"=${owner} AND "normalizedName"=${normalizedName}`,
        );
        if (collision.some((p) => p.id !== value.profileId)) return importFail("IMPORT_CONFLICT");
        if (value.profileId === undefined) {
          const rows = await tx.$queryRaw<ProfileRow[]>(
            Prisma.sql`INSERT INTO "ImportMappingProfile" (id,"ownerId",name,"normalizedName",mapping,"createdAt","updatedAt") VALUES (${randomUUID()}::uuid,${owner},${name},${normalizedName},${JSON.stringify(value.mapping)}::jsonb,date_trunc('milliseconds',clock_timestamp()),date_trunc('milliseconds',clock_timestamp())) RETURNING *`,
          );
          if (rows.length !== 1) return searchFail("SEARCH_INVARIANT");
          return profileDto(rows[0]!);
        }
        const updated = await tx.$queryRaw<ProfileRow[]>(
          Prisma.sql`UPDATE "ImportMappingProfile" SET name=${name},"normalizedName"=${normalizedName},mapping=${JSON.stringify(value.mapping)}::jsonb,revision=revision+1,"updatedAt"=date_trunc('milliseconds',clock_timestamp()) WHERE id=${value.profileId}::uuid AND "ownerId"=${owner} AND revision=${value.expectedRevision} RETURNING *`,
        );
        if (updated.length !== 1) return importFail("IMPORT_CONFLICT");
        return profileDto(updated[0]!);
      });
    },
  };
}

function mappingDigest(mapping: ImportMapping): string {
  return createHash("sha256").update(JSON.stringify(mapping)).digest("hex");
}
type PendingRow = { id: string; rowNumber: number; rowKey: string; rawCells: unknown };
async function buildPreview(
  database: SearchDatabase,
  owner: string,
  input: unknown,
): Promise<ImportPreviewBatch> {
  const request = parse(ImportPreviewInputSchema, input);
  return runSearchTransaction(database, async (tx) => {
    const job = await loadJob(tx, owner, request.jobId, true);
    if (job.revision !== request.expectedRevision || job.revision === 2147483647)
      return importFail("IMPORT_CONFLICT");
    if (
      !["PARSED", "PREVIEWING", "REVIEW_READY"].includes(job.status) ||
      job.sourceVerifiedAt === null ||
      job.totalRows === null ||
      job.parsedRows !== job.totalRows
    )
      return importFail("IMPORT_NOT_READY");
    let mapping: ImportMapping,
      profileId: string | null = job.mappingProfileId,
      profileRevision: number | null = job.mappingProfileRevision;
    if (job.mappingSnapshot !== null) {
      const parsed = ImportMappingSchema.safeParse(job.mappingSnapshot);
      if (!parsed.success) return searchFail("SEARCH_INVARIANT");
      mapping = parsed.data;
      if (mappingDigest(mapping) !== job.mappingHash) return searchFail("SEARCH_INVARIANT");
      if (
        request.mapping !== undefined
          ? job.mappingProfileId !== null || mappingDigest(request.mapping) !== job.mappingHash
          : request.mappingProfileId !== job.mappingProfileId ||
            request.expectedProfileRevision !== job.mappingProfileRevision
      )
        return importFail("IMPORT_CONFLICT");
    } else if (request.mapping !== undefined) {
      mapping = request.mapping;
      profileId = null;
      profileRevision = null;
    } else {
      const profiles = await tx.$queryRaw<ProfileRow[]>(
        Prisma.sql`SELECT * FROM "ImportMappingProfile" WHERE id=${request.mappingProfileId}::uuid AND "ownerId"=${owner}`,
      );
      if (profiles.length !== 1) return importFail("IMPORT_NOT_FOUND");
      if (profiles[0]!.revision !== request.expectedProfileRevision)
        return importFail("IMPORT_CONFLICT");
      const profile = profileDto(profiles[0]!);
      mapping = profile.mapping;
      profileId = profile.id;
      profileRevision = profile.revision;
    }
    if (mapping.locale !== job.locale) return importFail("IMPORT_INVALID");
    const generation = job.mappingSnapshot === null ? 1 : job.previewGeneration;
    const [coverage] = await tx.$queryRaw<{ total: string; pending: string; bad: boolean }[]>(
      Prisma.sql`SELECT count(*)::text AS total,(count(*) FILTER(WHERE status='PENDING'))::text AS pending,coalesce(bool_or(status NOT IN ('PENDING','READY','CONFLICT','INVALID') OR (status<>'PENDING' AND "previewGeneration"<>${generation})),false) AS bad FROM "ImportRow" WHERE "jobId"=${job.id}::uuid`,
    );
    if (
      !coverage ||
      coverage.bad ||
      coverage.total !== job.totalRows.toString() ||
      Number(coverage.total) - Number(coverage.pending) !== job.previewedRows
    )
      return searchFail("SEARCH_INVARIANT");
    if (job.status === "REVIEW_READY")
      return ImportPreviewBatchSchema.parse({ job: jobDto(job), rows: [], complete: true });
    const rows = await tx.$queryRaw<PendingRow[]>(
      Prisma.sql`SELECT id,"rowNumber","rowKey","rawCells" FROM "ImportRow" WHERE "jobId"=${job.id}::uuid AND status='PENDING' ORDER BY "rowNumber" LIMIT ${request.batchSize}`,
    );
    const initial = rows.map((row) => {
      tx.checkBudget();
      return {
        row,
        preview: previewImportRow(row.rawCells, mapping, {
          rowKey: row.rowKey,
          matchingItemIds: [],
          duplicateInSource: false,
        }),
      };
    });
    const identifiers = new Map<string, { type: string; value: string }>();
    for (const entry of initial) {
      const id = entry.preview.values?.identifier;
      if (id)
        identifiers.set(JSON.stringify([id.type, id.normalizedValue]), {
          type: id.type,
          value: id.normalizedValue,
        });
    }
    const matches = new Map<string, string[]>();
    if (identifiers.size) {
      const predicates = [...identifiers.values()].map(
        (i) => Prisma.sql`(ii.type=${i.type} AND ii."normalizedValue"=${i.value})`,
      );
      const candidates = await tx.$queryRaw<
        { id: string; type: string; normalizedValue: string }[]
      >(
        Prisma.sql`SELECT i.id,ii.type,ii."normalizedValue" FROM "ItemIdentifier" ii JOIN "CollectibleItem" i ON i.id=ii."itemId" JOIN "Collection" c ON c.id=i."collectionId" AND c."ownerId"=i."ownerId" WHERE i."ownerId"=${owner} AND c."ownerId"=${owner} AND i."collectionId"=${job.collectionId}::uuid AND i."deletedAt" IS NULL AND c."deletedAt" IS NULL AND (${Prisma.join(predicates, " OR ")}) ORDER BY ii.type COLLATE pg_catalog."C",ii."normalizedValue" COLLATE pg_catalog."C",i.id LIMIT 10001`,
      );
      if (candidates.length > 10000) return importFail("IMPORT_LIMIT_EXCEEDED");
      for (const candidate of candidates) {
        const key = JSON.stringify([candidate.type, candidate.normalizedValue]),
          ids = matches.get(key) ?? [];
        ids.push(candidate.id);
        matches.set(key, ids);
      }
    }
    if (initial.length) {
      const tuples = initial.map((entry) => {
        tx.checkBudget();
        const id = entry.preview.values?.identifier,
          matchingItemIds = id
            ? (matches.get(JSON.stringify([id.type, id.normalizedValue])) ?? [])
            : [];
        const preview = previewImportRow(entry.row.rawCells, mapping, {
          rowKey: entry.row.rowKey,
          matchingItemIds,
          duplicateInSource: false,
        });
        return Prisma.sql`(${entry.row.id}::uuid,${preview.status}::"ImportRowStatus",${JSON.stringify(preview)}::jsonb,${id?.type ?? null}::text,${id?.normalizedValue ?? null}::text)`;
      });
      const changed = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`UPDATE "ImportRow" r SET status=v.status,preview=v.preview,"previewGeneration"=${generation},"normalizedIdentifierType"=v.type,"normalizedIdentifierValue"=v.value,"updatedAt"=date_trunc('milliseconds',clock_timestamp()) FROM (VALUES ${Prisma.join(tuples)}) AS v(id,status,preview,type,value) WHERE r.id=v.id AND r."jobId"=${job.id}::uuid AND r.status='PENDING' RETURNING r.id`,
      );
      if (changed.length !== rows.length) return searchFail("SEARCH_INVARIANT");
      // Final and intermediate batches update every known source duplicate. No
      // user can commit until the entire preview generation reaches REVIEW_READY.
      await tx.$queryRaw(
        Prisma.sql`WITH duplicates AS (SELECT "normalizedIdentifierType" AS type,"normalizedIdentifierValue" AS value FROM "ImportRow" WHERE "jobId"=${job.id}::uuid AND "normalizedIdentifierType" IS NOT NULL GROUP BY "normalizedIdentifierType","normalizedIdentifierValue" HAVING count(*)>1) UPDATE "ImportRow" r SET status='CONFLICT',preview=r.preview||jsonb_build_object('status','CONFLICT','duplicateInSource',true,'allowedActions',CASE WHEN jsonb_array_length(r.preview->'matchingItemIds')>0 THEN '["SKIP","MERGE","CREATE_SEPARATE"]'::jsonb ELSE '["SKIP","CREATE_SEPARATE"]'::jsonb END),"updatedAt"=date_trunc('milliseconds',clock_timestamp()) FROM duplicates d WHERE r."jobId"=${job.id}::uuid AND r."normalizedIdentifierType"=d.type AND r."normalizedIdentifierValue"=d.value AND r.status IN ('READY','CONFLICT') RETURNING r.id`,
      );
    }
    const previewed = job.previewedRows + rows.length,
      complete = previewed === job.totalRows;
    if (!rows.length && !complete) return searchFail("SEARCH_INVARIANT");
    const changedJob = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`UPDATE "ImportJob" SET status=${complete ? "REVIEW_READY" : "PREVIEWING"}::"ImportJobStatus","previewedRows"=${previewed},"previewGeneration"=${generation},"mappingSnapshot"=${JSON.stringify(mapping)}::jsonb,"mappingHash"=${mappingDigest(mapping)},"mappingProfileId"=${profileId}::uuid,"mappingProfileRevision"=${profileRevision},revision=revision+1,"updatedAt"=date_trunc('milliseconds',clock_timestamp()) WHERE id=${job.id}::uuid AND revision=${request.expectedRevision} RETURNING id`,
    );
    if (changedJob.length !== 1) return importFail("IMPORT_CONFLICT");
    const processed = rows.length
      ? await tx.$queryRaw<{ preview: unknown }[]>(
          Prisma.sql`SELECT preview FROM "ImportRow" WHERE "jobId"=${job.id}::uuid AND id IN (${Prisma.join(rows.map((r) => Prisma.sql`${r.id}::uuid`))}) ORDER BY "rowNumber"`,
        )
      : [];
    const result = {
      job: jobDto(await loadJob(tx, owner, job.id)),
      rows: processed.map((r) => r.preview),
      complete,
    };
    if (Buffer.byteLength(JSON.stringify(result), "utf8") > 2 * 1024 * 1024)
      return importFail("IMPORT_LIMIT_EXCEEDED");
    const checked = ImportPreviewBatchSchema.safeParse(result);
    if (!checked.success) return searchFail("SEARCH_INVARIANT");
    tx.checkBudget();
    return checked.data;
  });
}

async function readPreviewPage(
  database: SearchDatabase,
  owner: string,
  input: unknown,
): Promise<ImportPreviewPage> {
  const request = parse(ImportPreviewPageInputSchema, input);
  return runSearchTransaction(database, async (tx) => {
    const job = await loadJob(tx, owner, request.jobId);
    if (job.status !== "REVIEW_READY") return importFail("IMPORT_NOT_READY");
    // Validate the whole frozen generation before LIMIT; a missing/corrupted row
    // outside this page must not make a partial preview look complete.
    const [coverage] = await tx.$queryRaw<{ total: string; bad: boolean }[]>(
      Prisma.sql`SELECT count(*)::text AS total,coalesce(bool_or(status NOT IN ('READY','CONFLICT','INVALID') OR "previewGeneration"<>${job.previewGeneration} OR preview IS NULL),false) AS bad FROM "ImportRow" WHERE "jobId"=${job.id}::uuid`,
    );
    if (
      !coverage ||
      coverage.bad ||
      coverage.total !== job.totalRows?.toString() ||
      job.previewedRows !== job.totalRows
    )
      return searchFail("SEARCH_INVARIANT");
    const rows = await tx.$queryRaw<{ rowNumber: number; preview: unknown }[]>(
      Prisma.sql`SELECT "rowNumber",preview FROM "ImportRow" WHERE "jobId"=${job.id}::uuid AND "rowNumber">${request.afterRowNumber} ORDER BY "rowNumber" LIMIT ${request.limit + 1}`,
    );
    const hasMore = rows.length > request.limit,
      selected = rows.slice(0, request.limit);
    const output = {
      job: jobDto(job),
      items: selected.map((row) => ({ rowNumber: row.rowNumber.toString(), preview: row.preview })),
      hasMore,
      nextAfterRowNumber: hasMore ? selected.at(-1)!.rowNumber : null,
    };
    if (Buffer.byteLength(JSON.stringify(output), "utf8") > 2 * 1024 * 1024)
      return importFail("IMPORT_LIMIT_EXCEEDED");
    const checked = ImportPreviewPageSchema.safeParse(output);
    if (!checked.success) return searchFail("SEARCH_INVARIANT");
    tx.checkBudget();
    return checked.data;
  });
}
