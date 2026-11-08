import type { ArtifactFilterAdmission } from "../search/search-selection";
import { randomUUID } from "node:crypto";
import { Prisma } from "@sammlerraum/db/search-sql";
import { ExportError } from "@sammlerraum/contracts/exports";
import {
  ReportError,
  ReportAssetSchema,
  ReportInsuranceSchema,
  parseInsuranceReportOptions,
  type InsuranceReportOptions,
  type ReportAsset,
  type ReportInsurance,
} from "@sammlerraum/contracts/reports";
import { createExportService } from "../exports/export-service";
import {
  runSearchTransaction,
  type SearchDatabase,
  type BoundedSearchReadTransaction,
} from "../search/search-read";
import { buildReportModel } from "./report-schema";
const actorId = (actor: { userId: string }) => {
  if (
    !actor ||
    typeof actor.userId !== "string" ||
    !actor.userId ||
    actor.userId.length > 512 ||
    actor.userId.includes("\0")
  )
    throw new ReportError("REPORT_NOT_FOUND");
  return actor.userId;
};
const exportInput = (request: InsuranceReportOptions) => ({
  scope: request.scope,
  locale: request.locale,
  query: request.query,
  money: request.money,
  format: "CSV",
  includePrivateNotes: request.include.includes("privateNotes"),
  includeLocations: request.include.includes("storageLocations"),
});
async function mapped<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ExportError)
      throw new ReportError(
        error.code === "EXPORT_NOT_FOUND"
          ? "REPORT_NOT_FOUND"
          : error.code === "EXPORT_NOT_READY"
            ? "REPORT_NOT_READY"
            : error.code === "EXPORT_LIMIT_EXCEEDED"
              ? "REPORT_LIMIT_EXCEEDED"
              : "REPORT_INTEGRITY",
      );
    throw error;
  }
}
type AssetRow = {
  assetId: string;
  itemId: string;
  storageKey: string;
  mimeType: string;
  byteSize: string;
  checksumSha256: string;
  fileName: string;
};
type InsuranceRow = {
  targetId: string;
  revision: number;
  amountMinor: string | null;
  currency: string | null;
  minorUnitExponent: number | null;
  valuationDate: string | null;
  insurer: string | null;
  policyReference: string | null;
  basis: string;
};
function insuranceValue(row: InsuranceRow, policy: boolean): ReportInsurance {
  const result = ReportInsuranceSchema.safeParse({
    revision: row.revision,
    value:
      row.amountMinor === null
        ? null
        : {
            amountMinor: row.amountMinor,
            currency: row.currency,
            minorUnitExponent: row.minorUnitExponent,
            basis: row.basis,
            valuationDate: row.valuationDate,
            insurer: row.insurer,
            ...(policy ? { policyReference: row.policyReference } : {}),
          },
  });
  if (!result.success) throw new ReportError("REPORT_INTEGRITY");
  return result.data;
}
function checkedAsset(row: AssetRow): ReportAsset {
  const parsed = ReportAssetSchema.safeParse(row);
  if (!parsed.success) throw new ReportError("REPORT_LIMIT_EXCEEDED");
  return parsed.data;
}
export function createReportService(
  database: SearchDatabase,
  settings: { canonicalMoneyEnabled?: boolean } = {},
) {
  const exports = createExportService(database, settings);
  async function captureReportSourceInTransaction(
    tx: BoundedSearchReadTransaction,
    actor: { userId: string },
    input: unknown,
    admission?: ArtifactFilterAdmission,
  ) {
    return mapped(async () => {
      const owner = actorId(actor),
        request = parseInsuranceReportOptions(input),
        fields = new Set(request.include),
        source = await exports.captureExportSourceInTransaction(
          tx,
          actor,
          exportInput(request),
          admission,
        );
      const itemIds = source.money.rows.map((row) => row.itemId).sort(),
        collections = [...new Set(source.metadata.map((meta) => meta.collectionId))].sort();
      if (request.scope.kind === "COLLECTION" && !collections.includes(request.scope.collectionId))
        collections.push(request.scope.collectionId);
      collections.sort();
      // Parent/item locks coordinate current erasure, movement, linking and insurance writers.
      for (let offset = 0; offset < collections.length; offset += 16) {
        const ids = collections.slice(offset, offset + 16);
        const rows = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM "Collection" WHERE "ownerId"=${owner} AND "deletedAt" IS NULL AND id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR SHARE`,
        );
        if (rows.length !== ids.length) throw new ReportError("REPORT_NOT_FOUND");
      }
      for (let offset = 0; offset < itemIds.length; offset += 16) {
        const ids = itemIds.slice(offset, offset + 16);
        const rows = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM "CollectibleItem" WHERE "ownerId"=${owner} AND "deletedAt" IS NULL AND id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR SHARE`,
        );
        if (rows.length !== ids.length) throw new ReportError("REPORT_NOT_FOUND");
      }
      const images = new Map<string, ReportAsset[]>(),
        proofs: ReportAsset[] = [],
        itemInsurance = new Map<string, ReportInsurance>(),
        collectionInsurance: { collectionId: string; insurance: ReportInsurance }[] = [];
      if (fields.has("images"))
        for (let offset = 0; offset < itemIds.length; offset += 16) {
          const ids = itemIds.slice(offset, offset + 16);
          const rows = await tx.$queryRaw<AssetRow[]>(
            Prisma.sql`SELECT i.id AS "itemId",selected.* FROM "CollectibleItem" i JOIN LATERAL (SELECT a.id AS "assetId",a."storageKey",a."mimeType",a."byteSize"::text,a."checksumSha256",a."originalFileName" AS "fileName" FROM "MediaLink" l JOIN "MediaAsset" a ON a.id=l."assetId" AND a."ownerId"=l."ownerId" WHERE l."itemId"=i.id AND l."ownerId"=${owner} AND a.kind='IMAGE' AND a.status='READY' AND a."cleanupStartedAt" IS NULL AND a."mimeType" IN ('image/jpeg','image/png','image/webp') ORDER BY l.position,l.id LIMIT 1 FOR SHARE OF a) selected ON TRUE WHERE i."ownerId"=${owner} AND i.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY i.id`,
          );
          for (const row of rows) images.set(row.itemId, [checkedAsset(row)]);
        }
      for (const id of request.proofAssetIds) {
        if (!itemIds.length) throw new ReportError("REPORT_NOT_FOUND");
        const [row] = await tx.$queryRaw<AssetRow[]>(
          Prisma.sql`SELECT a.id AS "assetId",selected."itemId",a."storageKey",a."mimeType",a."byteSize"::text,a."checksumSha256",a."originalFileName" AS "fileName" FROM "MediaAsset" a JOIN LATERAL (SELECT l."itemId" FROM "DocumentLink" l WHERE l."assetId"=a.id AND l."ownerId"=${owner} AND l."itemId" IN (${Prisma.join(itemIds.map((item) => Prisma.sql`${item}::uuid`))}) ORDER BY l."itemId" LIMIT 1) selected ON TRUE WHERE a.id=${id}::uuid AND a."ownerId"=${owner} AND a.kind='DOCUMENT' AND a.status='READY' AND a."cleanupStartedAt" IS NULL FOR SHARE OF a`,
        );
        if (!row) throw new ReportError("REPORT_NOT_FOUND");
        proofs.push(checkedAsset(row));
      }
      if (fields.has("insurance")) {
        for (const kind of ["ITEM", "COLLECTION"] as const) {
          const all = kind === "ITEM" ? itemIds : collections,
            column = kind === "ITEM" ? Prisma.sql`"itemId"` : Prisma.sql`"collectionId"`;
          for (let offset = 0; offset < all.length; offset += 16) {
            const ids = all.slice(offset, offset + 16),
              policy = fields.has("policyReferences");
            const rows = await tx.$queryRaw<InsuranceRow[]>(
              Prisma.sql`SELECT ${column} AS "targetId",revision,basis,"amountMinor"::text,currency,"minorUnitExponent",to_char("valuationDate",'YYYY-MM-DD') AS "valuationDate",insurer,${policy ? Prisma.sql`"policyReference"` : Prisma.sql`NULL::text`} AS "policyReference" FROM "InsuranceRecord" WHERE "ownerId"=${owner} AND ${column} IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY ${column} FOR SHARE`,
            );
            for (const row of rows) {
              const value = insuranceValue(row, policy);
              if (kind === "ITEM") itemInsurance.set(row.targetId, value);
              else collectionInsurance.push({ collectionId: row.targetId, insurance: value });
            }
          }
        }
      }
      const distinct = new Map(
        [...images.values()]
          .flat()
          .concat(proofs)
          .map((asset) => [asset.assetId, asset]),
      );
      let size = 0n;
      for (const asset of distinct.values()) size += BigInt(asset.byteSize);
      if (size > 16777216n) throw new ReportError("REPORT_LIMIT_EXCEEDED");
      tx.checkBudget();
      return buildReportModel(source, request, {
        images,
        proofs,
        itemInsurance,
        collectionInsurance,
      });
    });
  }
  async function captureReportSource(
    actor: { userId: string },
    input: unknown,
    admission?: ArtifactFilterAdmission,
  ) {
    return runSearchTransaction(database, (tx) =>
      captureReportSourceInTransaction(tx, actor, input, admission),
    );
  }
  async function requestInsuranceReport(actor: { userId: string }, input: unknown) {
    const owner = actorId(actor),
      request = parseInsuranceReportOptions(input);
    return mapped(() =>
      runSearchTransaction(database, async (tx) => {
        await exports.validateExportRequestInTransaction(tx, actor, exportInput(request));
        const [user] = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`UPDATE "user" SET "updatedAt"="updatedAt" WHERE id=${owner} RETURNING id`,
        );
        if (!user) throw new ReportError("REPORT_NOT_FOUND");
        const [active] = await tx.$queryRaw<{ count: bigint }[]>(
          Prisma.sql`SELECT count(*) AS count FROM "ReportJob" WHERE "ownerId"=${owner} AND status IN ('PENDING','BUILDING') AND "expiresAt">CURRENT_TIMESTAMP`,
        );
        if (Number(active?.count ?? 0) >= 3) throw new ReportError("REPORT_LIMIT_EXCEEDED");
        const [job] = await tx.$queryRaw<{ id: string; status: string }[]>(
          Prisma.sql`INSERT INTO "ReportJob" ("billingAdmitted",id,"ownerId",format,locale,request,"expiresAt","updatedAt") VALUES (true,${randomUUID()}::uuid,${owner},'PDF',${request.locale},${JSON.stringify(request)}::jsonb,CURRENT_TIMESTAMP+interval '24 hours',date_trunc('milliseconds',clock_timestamp())) RETURNING id,status`,
        );
        if (!job) throw new ReportError("REPORT_INTEGRITY");
        return job;
      }),
    );
  }
  return { requestInsuranceReport, captureReportSource, captureReportSourceInTransaction };
}
