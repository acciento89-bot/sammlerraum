import { createHash } from "node:crypto";
import { z } from "zod";
import { ExportError, EXPORT_MAX_BYTES, ExportScopeSchema } from "@sammlerraum/contracts/exports";
import { parseInsuranceReportOptions } from "@sammlerraum/contracts/reports";
import { Prisma } from "@sammlerraum/db/search-sql";
import type { StorageProvider, StorageStagingLocker } from "@sammlerraum/storage";
import {
  runSearchTransaction,
  type SearchDatabase,
  type BoundedSearchReadTransaction,
} from "../search/search-read";
import { createExportService } from "./export-service";
const kind = z.enum(["TABULAR", "REPORT"]),
  id = z.uuid().transform((v) => v.toLowerCase());
const downloadInput = z.object({ kind, jobId: id }).strict();
const historyInput = z
  .object({
    limit: z.number().int().min(1).max(50).default(20),
    before: z.object({ createdAt: z.iso.datetime(), id, kind }).strict().optional(),
  })
  .strict();
type Kind = z.infer<typeof kind>;
type Row = {
  id: string;
  ownerId: string;
  kind: Kind;
  format: "CSV" | "XLSX" | "PDF";
  locale: string;
  request: unknown;
  status: string;
  createdAt: Date;
  expiresAt: Date;
  artifactId: string | null;
  expired: boolean;
  available: boolean;
  errorCode: string | null;
};
type ArtifactRow = Row & {
  storageKey: string;
  mimeType: string;
  byteSize: bigint;
  checksumSha256: string;
  assetStatus: string;
  cleanupStartedAt: Date | null;
};
function fail(code: ExportError["code"]): never {
  throw new ExportError(code);
}
function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const checked = schema.safeParse(value);
  if (!checked.success) return fail("EXPORT_INVALID");
  return checked.data;
}
function actor(input: { userId: string }) {
  if (
    !input ||
    typeof input.userId !== "string" ||
    !input.userId ||
    input.userId.length > 512 ||
    input.userId.includes("\0")
  )
    return fail("EXPORT_NOT_FOUND");
  return input.userId;
}
const mime = (format: Row["format"]) =>
  format === "PDF"
    ? "application/pdf"
    : format === "CSV"
      ? "text/csv"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const table = (value: Kind) => Prisma.raw(value === "TABULAR" ? '"ExportJob"' : '"ReportJob"');
/** Private immutable snapshots remain readable for24h while their current scope is still owned. */
export function createArtifactAccessService(
  database: SearchDatabase,
  storage: StorageProvider,
  lock: StorageStagingLocker,
  options: { canonicalMoneyEnabled?: boolean } = {},
) {
  const exports = createExportService(database, options);
  async function permission(tx: BoundedSearchReadTransaction, owner: string, row: Row) {
    if (row.kind === "TABULAR") {
      await exports.validateExportRequestInTransaction(tx, { userId: owner }, row.request);
      return;
    }
    const request = parseInsuranceReportOptions(row.request);
    await exports.validateExportRequestInTransaction(
      tx,
      { userId: owner },
      {
        scope: request.scope,
        locale: request.locale,
        query: request.query,
        money: request.money,
        format: "CSV",
        includePrivateNotes: request.include.includes("privateNotes"),
        includeLocations: request.include.includes("storageLocations"),
      },
    );
  }
  async function resolve(
    owner: string,
    request: z.infer<typeof downloadInput>,
  ): Promise<ArtifactRow> {
    return runSearchTransaction(database, async (tx) => {
      const [row] = await tx.$queryRaw<ArtifactRow[]>(
        Prisma.sql`SELECT j.id,j."ownerId",${request.kind}::text AS kind,j.format,j.locale,j.request,j.status,j."createdAt",j."expiresAt",j."artifactId",j."errorCode",j."expiresAt"<=timezone('UTC',CURRENT_TIMESTAMP) AS expired,a."storageKey",a."mimeType",a."byteSize",a."checksumSha256",a.status AS "assetStatus",a."cleanupStartedAt" FROM ${table(request.kind)} j LEFT JOIN "MediaAsset" a ON a.id=j."artifactId" AND a."ownerId"=j."ownerId" AND a.kind='DOCUMENT' WHERE j.id=${request.jobId}::uuid AND j."ownerId"=${owner}`,
      );
      if (!row || row.expired) return fail("EXPORT_NOT_FOUND");
      await permission(tx, owner, row);
      if (
        row.status !== "READY" ||
        !row.artifactId ||
        row.assetStatus !== "READY" ||
        row.cleanupStartedAt !== null
      )
        return fail("EXPORT_NOT_READY");
      const prefix = request.kind === "TABULAR" ? "exports" : "reports";
      if (
        !["CSV", "XLSX", "PDF"].includes(row.format) ||
        (request.kind === "REPORT") !== (row.format === "PDF") ||
        row.mimeType !== mime(row.format) ||
        typeof row.byteSize !== "bigint" ||
        row.byteSize <= 0n ||
        row.byteSize > BigInt(EXPORT_MAX_BYTES) ||
        !/^[a-f0-9]{64}$/u.test(row.checksumSha256) ||
        !new RegExp(
          `^${prefix}/${request.jobId}/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/data\\.${row.format.toLowerCase()}$`,
          "u",
        ).test(row.storageKey)
      )
        return fail("EXPORT_INTEGRITY");
      return row;
    });
  }
  return {
    async listProofOptions(who: { userId: string }, input: unknown) {
      const owner = actor(who),
        request = parse(
          z
            .object({
              scope: ExportScopeSchema,
              query: z.unknown().optional(),
              afterAssetId: id.optional(),
            })
            .strict(),
          input,
        );
      const source = await exports.captureExportSource(
          { userId: owner },
          { scope: request.scope, query: request.query, locale: "de", format: "CSV" },
        ),
        ids = source.money.rows.map((row) => row.itemId);
      if (!ids.length) return { items: [], hasMore: false, nextAfterAssetId: null };
      return runSearchTransaction(database, async (tx) => {
        const rows = await tx.$queryRaw<
          {
            assetId: string;
            fileName: string;
            byteSize: string;
            mimeType: string;
            itemId: string;
            itemTitle: string;
          }[]
        >(
          Prisma.sql`SELECT a.id AS "assetId",a."originalFileName" AS "fileName",a."byteSize"::text AS "byteSize",a."mimeType",selected."itemId",selected."itemTitle" FROM "MediaAsset" a JOIN LATERAL (SELECT i.id AS "itemId",i.title AS "itemTitle" FROM "DocumentLink" l JOIN "CollectibleItem" i ON i.id=l."itemId" AND i."ownerId"=l."ownerId" JOIN "Collection" c ON c.id=i."collectionId" AND c."ownerId"=i."ownerId" WHERE l."assetId"=a.id AND l."ownerId"=${owner} AND i.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) AND i."deletedAt" IS NULL AND c."deletedAt" IS NULL ORDER BY i.id LIMIT 1) selected ON TRUE WHERE a."ownerId"=${owner} AND a.kind='DOCUMENT' AND a.status='READY' AND a."cleanupStartedAt" IS NULL AND a."mimeType" IN ('application/pdf','image/jpeg','image/png','image/webp') AND a."byteSize" BETWEEN 1 AND 16777216 AND a."checksumSha256"~'^[a-f0-9]{64}$' ${request.afterAssetId ? Prisma.sql`AND a.id>${request.afterAssetId}::uuid` : Prisma.empty} ORDER BY a.id LIMIT 51`,
        );
        const items = rows.slice(0, 50);
        return {
          items,
          hasMore: rows.length > 50,
          nextAfterAssetId: rows.length > 50 ? items.at(-1)!.assetId : null,
        };
      });
    },
    async listArtifacts(who: { userId: string }, input: unknown = {}) {
      const owner = actor(who),
        request = parse(historyInput, input);
      return runSearchTransaction(database, async (tx) => {
        const cursor = request.before;
        const rows = await tx.$queryRaw<Row[]>(
          Prisma.sql`WITH artifacts AS (SELECT id,"ownerId",'TABULAR'::text AS kind,format::text,locale,request,status::text,"createdAt","expiresAt","artifactId","errorCode" FROM "ExportJob" WHERE "ownerId"=${owner} UNION ALL SELECT id,"ownerId",'REPORT'::text AS kind,format::text,locale,request,status::text,"createdAt","expiresAt","artifactId","errorCode" FROM "ReportJob" WHERE "ownerId"=${owner}) SELECT *,EXISTS(SELECT 1 FROM "MediaAsset" a WHERE a.id=artifacts."artifactId" AND a."ownerId"=artifacts."ownerId" AND a.kind='DOCUMENT' AND a.status='READY' AND a."cleanupStartedAt" IS NULL) AS available,"expiresAt"<=timezone('UTC',CURRENT_TIMESTAMP) AS expired FROM artifacts ${cursor ? Prisma.sql`WHERE ("createdAt",id,kind)<(${cursor.createdAt}::timestamp,${cursor.id}::uuid,${cursor.kind}::text)` : Prisma.empty} ORDER BY "createdAt" DESC,id DESC,kind DESC LIMIT ${request.limit + 1}`,
        );
        const selected = rows.slice(0, request.limit),
          items = [];
        for (const row of selected) {
          try {
            await permission(tx, owner, row);
          } catch (error) {
            if (error instanceof ExportError && error.code === "EXPORT_NOT_FOUND") continue;
            throw error;
          }
          items.push({
            id: row.id,
            kind: row.kind,
            format: row.format,
            locale: row.locale,
            status: row.status,
            createdAt: row.createdAt.toISOString(),
            expiresAt: row.expiresAt.toISOString(),
            expired: row.expired,
            downloadAvailable: !row.expired && row.status === "READY" && row.available,
            errorCode: row.errorCode,
          });
        }
        const last = selected.at(-1);
        return {
          items,
          hasMore: rows.length > request.limit,
          nextBefore:
            rows.length > request.limit && last
              ? { createdAt: last.createdAt.toISOString(), id: last.id, kind: last.kind }
              : null,
        };
      });
    },
    async downloadArtifact(who: { userId: string }, input: unknown) {
      const owner = actor(who),
        request = parse(downloadInput, input),
        initial = await resolve(owner, request);
      const result = await lock(
        initial.artifactId!,
        async () => {
          const current = await resolve(owner, request);
          if (current.artifactId !== initial.artifactId) return fail("EXPORT_STALE");
          let bytes: Uint8Array;
          try {
            bytes = await storage.read(current.storageKey, { maxBytes: EXPORT_MAX_BYTES });
          } catch {
            return fail("EXPORT_INTEGRITY");
          }
          if (
            BigInt(bytes.byteLength) !== current.byteSize ||
            createHash("sha256").update(bytes).digest("hex") !== current.checksumSha256
          )
            return fail("EXPORT_INTEGRITY");
          const final = await resolve(owner, request);
          if (
            final.artifactId !== current.artifactId ||
            final.storageKey !== current.storageKey ||
            final.byteSize !== current.byteSize ||
            final.checksumSha256 !== current.checksumSha256
          )
            return fail("EXPORT_STALE");
          return {
            bytes,
            mimeType: current.mimeType,
            fileName: `sammlerraum-${request.jobId}.${current.format.toLowerCase()}`,
            checksumSha256: current.checksumSha256,
          };
        },
        true,
      );
      if (result === false) return fail("EXPORT_NOT_READY");
      return result;
    },
  };
}
