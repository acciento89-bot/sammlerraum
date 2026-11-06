import { randomUUID } from "node:crypto";
import { Prisma } from "@sammlerraum/db/search-sql";
import {
  ExportError,
  parseExportRequest,
  TabularExportSnapshotSchema,
  ExportMetadataSchema,
  type ExportRequest,
  type ExportMetadata,
} from "@sammlerraum/contracts/exports";
import { MONEY_EXPORT_MAX_BYTES } from "@sammlerraum/contracts/money-transfer";
import {
  runSearchTransaction,
  type SearchDatabase,
  type BoundedSearchReadTransaction,
} from "../search/search-read";
import { prepareItemSelection } from "../search/search-selection";
import { leaves, referencePredicate } from "../search/search-compiler";
import { validateCurrentFilterAvailability } from "../search/filter-ast";
import { captureMoneyExport } from "../money/money-transfer";
function who(actor: { userId: string }) {
  if (
    !actor ||
    typeof actor.userId !== "string" ||
    !actor.userId ||
    actor.userId.length > 512 ||
    actor.userId.includes("\0")
  )
    throw new ExportError("EXPORT_NOT_FOUND");
  return actor.userId;
}
async function scopeRestriction(
  tx: BoundedSearchReadTransaction,
  owner: string,
  request: ExportRequest,
) {
  const scope = request.scope;
  if (scope.kind === "ALL" || scope.kind === "SEARCH") return Prisma.sql`TRUE`;
  const [collection] = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id FROM "Collection" WHERE id=${scope.collectionId}::uuid AND "ownerId"=${owner} AND "deletedAt" IS NULL`,
  );
  if (!collection) throw new ExportError("EXPORT_NOT_FOUND");
  if (scope.kind === "COLLECTION") return Prisma.sql`i."collectionId"=${scope.collectionId}::uuid`;
  const [node] = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id FROM "CollectionNode" WHERE id=${scope.nodeId}::uuid AND "collectionId"=${scope.collectionId}::uuid`,
  );
  if (!node) throw new ExportError("EXPORT_NOT_FOUND");
  return Prisma.sql`i."collectionId"=${scope.collectionId}::uuid AND i."nodeId" IN (WITH RECURSIVE tree AS (SELECT id FROM "CollectionNode" WHERE id=${scope.nodeId}::uuid AND "collectionId"=${scope.collectionId}::uuid UNION SELECT n.id FROM "CollectionNode" n JOIN tree t ON n."parentId"=t.id WHERE n."collectionId"=${scope.collectionId}::uuid) SELECT id FROM tree)`;
}
export function createExportService(
  database: SearchDatabase,
  options: { canonicalMoneyEnabled?: boolean } = {},
) {
  const canonical = options.canonicalMoneyEnabled === true;
  function requestValue(input: unknown) {
    const request = parseExportRequest(input);
    if (request.money.mode === "INTERPRETED" && !canonical)
      throw new ExportError("EXPORT_NOT_READY");
    if (request.query.filter) validateCurrentFilterAvailability(request.query.filter, canonical);
    return request;
  }
  async function captureExportSource(actor: { userId: string }, input: unknown) {
    const owner = who(actor),
      request = requestValue(input);
    return runSearchTransaction(database, async (tx) => {
      const scope = await scopeRestriction(tx, owner, request),
        selection = await prepareItemSelection(tx, actor, request.query, canonical, {
          predicate: scope,
        });
      const money = await captureMoneyExport(
        tx,
        {
          scope: { ownerId: owner, predicate: selection.outerPredicate },
          matchedPredicate: selection.matchedPredicate,
          selectors: [{ family: "PURCHASE" }],
        },
        request.money,
      );
      const metadata: ExportMetadata[] = [];
      let bytes = Buffer.byteLength(
        JSON.stringify({ schemaVersion: 1, ownerId: owner, request, money, metadata: [] }),
      );
      for (let offset = 0; offset < money.rows.length; offset += 16) {
        tx.checkBudget();
        const ids = money.rows.slice(offset, offset + 16).map((row) => row.itemId);
        const batch = await tx.$queryRaw<
          {
            itemId: string;
            collectionId: string;
            nodeId: string | null;
            acquisitionType: ExportMetadata["acquisitionType"];
            visibility: ExportMetadata["visibility"];
            tradeStatus: ExportMetadata["tradeStatus"];
            publicDescription: string | null;
            archivedAt: string | null;
            disposedAt: string | null;
            categoryTemplateId: string | null;
            conditionOptionId: string | null;
            catalogEntryId: string | null;
            catalogVariantId: string | null;
            acquisitionDate: string | null;
            identifiers: { type: string; value: string; normalizedValue: string }[];
            privateNotes: string | null;
            locationId: string | null;
            locationName: string | null;
            sourceLocationId: string | null;
          }[]
        >(
          Prisma.sql`SELECT i.id AS "itemId",i."collectionId",i."nodeId",i."acquisitionType",i.visibility,i."tradeStatus",i."publicDescription",to_char(i."archivedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "archivedAt",to_char(i."disposedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "disposedAt",i."categoryTemplateId",i."conditionOptionId",i."catalogEntryId",i."catalogVariantId",to_char(i."acquisitionDate",'YYYY-MM-DD') AS "acquisitionDate",COALESCE(ids.data,'[]'::jsonb) AS identifiers,${request.includePrivateNotes ? Prisma.sql`i."privateNotes"` : Prisma.sql`NULL::text`} AS "privateNotes",${request.includeLocations ? Prisma.sql`s.id` : Prisma.sql`NULL::uuid`} AS "locationId",${request.includeLocations ? Prisma.sql`s.name` : Prisma.sql`NULL::text`} AS "locationName",${request.includeLocations ? Prisma.sql`i."storageLocationId"` : Prisma.sql`NULL::uuid`} AS "sourceLocationId" FROM "CollectibleItem" i JOIN "Collection" c ON c.id=i."collectionId" AND c."ownerId"=i."ownerId" LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('type',ii.type,'value',ii.value,'normalizedValue',ii."normalizedValue") ORDER BY ii.type,ii."normalizedValue") AS data FROM (SELECT type,value,"normalizedValue" FROM "ItemIdentifier" WHERE "itemId"=i.id ORDER BY type,"normalizedValue" LIMIT 101) ii) ids ON TRUE ${request.includeLocations ? Prisma.sql`LEFT JOIN "StorageLocation" s ON s.id=i."storageLocationId" AND s."ownerId"=i."ownerId"` : Prisma.empty} WHERE i."ownerId"=${owner} AND i."deletedAt" IS NULL AND c."deletedAt" IS NULL AND i.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY i.id`,
        );
        if (batch.length !== ids.length) throw new ExportError("EXPORT_INTEGRITY");
        for (const row of batch) {
          if (
            request.includeLocations &&
            row.sourceLocationId !== null &&
            (row.locationId === null || row.locationName === null)
          )
            throw new ExportError("EXPORT_INTEGRITY");
          const checkedMetadata = ExportMetadataSchema.safeParse({
            itemId: row.itemId,
            collectionId: row.collectionId,
            nodeId: row.nodeId,
            acquisitionType: row.acquisitionType,
            visibility: row.visibility,
            tradeStatus: row.tradeStatus,
            publicDescription: row.publicDescription,
            archivedAt: row.archivedAt,
            disposedAt: row.disposedAt,
            categoryTemplateId: row.categoryTemplateId,
            conditionOptionId: row.conditionOptionId,
            catalogEntryId: row.catalogEntryId,
            catalogVariantId: row.catalogVariantId,
            acquisitionDate: row.acquisitionDate,
            identifiers: row.identifiers,
            ...(request.includePrivateNotes ? { privateNotes: row.privateNotes } : {}),
            ...(request.includeLocations
              ? {
                  location:
                    row.locationId === null
                      ? null
                      : { id: row.locationId, name: row.locationName! },
                }
              : {}),
          });
          if (!checkedMetadata.success) throw new ExportError("EXPORT_INTEGRITY");
          const value = checkedMetadata.data;
          bytes += Buffer.byteLength(JSON.stringify(value)) + 1;
          if (bytes > MONEY_EXPORT_MAX_BYTES) throw new ExportError("EXPORT_LIMIT_EXCEEDED");
          metadata.push(value);
        }
      }
      const snapshot = TabularExportSnapshotSchema.safeParse({
        schemaVersion: 1,
        ownerId: owner,
        request,
        money,
        metadata,
      });
      if (!snapshot.success) throw new ExportError("EXPORT_INTEGRITY");
      tx.checkBudget();
      return snapshot.data;
    });
  }
  async function requestExport(actor: { userId: string }, input: unknown) {
    const owner = who(actor),
      request = requestValue(input);
    return runSearchTransaction(database, async (tx) => {
      await scopeRestriction(tx, owner, request);
      const [refs] = await tx.$queryRaw<{ valid: boolean }[]>(
        Prisma.sql`SELECT ${referencePredicate(leaves(request.query.filter?.root ?? null), owner)} AS valid`,
      );
      if (!refs?.valid) throw new ExportError("EXPORT_NOT_FOUND");
      const [user] = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`UPDATE "user" SET id=id WHERE id=${owner} RETURNING id`,
      );
      if (!user) throw new ExportError("EXPORT_NOT_FOUND");
      const [active] = await tx.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`SELECT count(*) AS count FROM "ExportJob" WHERE "ownerId"=${owner} AND status IN ('PENDING','BUILDING') AND "expiresAt">CURRENT_TIMESTAMP`,
      );
      if (Number(active?.count ?? 0) >= 3) throw new ExportError("EXPORT_LIMIT_EXCEEDED");
      const id = randomUUID(),
        [job] = await tx.$queryRaw<{ id: string; status: string }[]>(
          Prisma.sql`INSERT INTO "ExportJob" (id,"ownerId",format,locale,request,"expiresAt","updatedAt") VALUES (${id}::uuid,${owner},${request.format}::"ExportFormat",${request.locale},${JSON.stringify(request)}::jsonb,CURRENT_TIMESTAMP+interval '24 hours',date_trunc('milliseconds',clock_timestamp())) RETURNING id,status`,
        );
      if (!job) throw new ExportError("EXPORT_INTEGRITY");
      return job;
    });
  }
  return { requestExport, captureExportSource };
}
