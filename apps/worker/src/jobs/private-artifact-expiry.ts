import { Prisma } from "@sammlerraum/db/search-sql";
import { runSearchTransaction, type SearchDatabase } from "@sammlerraum/domain/search/search-read";
/** Expire snapshots first; existing locked media cleanup settles deletion and keeps tombstones. */
export function createPrivateArtifactExpiry(
  database: SearchDatabase,
  options: { retentionHours: number },
) {
  if (
    !Number.isSafeInteger(options.retentionHours) ||
    options.retentionHours < 1 ||
    !Number.isFinite(new Date(Date.now() - options.retentionHours * 3600000 - 1000).getTime())
  )
    throw new Error("Invalid artifact retention");
  return {
    async run() {
      for (const kind of ["TABULAR", "REPORT"] as const) {
        const table = Prisma.raw(kind === "TABULAR" ? '"ExportJob"' : '"ReportJob"'),
          prefix = kind === "TABULAR" ? "exports" : "reports",
          extension = kind === "TABULAR" ? "(csv|xlsx)" : "pdf";
        await runSearchTransaction(database, async (tx) => {
          const rows = await tx.$queryRaw<{ id: string; ownerId: string }[]>(
            Prisma.sql`SELECT id,"ownerId" FROM ${table} WHERE "expiresAt"<=timezone('UTC',CURRENT_TIMESTAMP) AND (status<>'BUILDING' OR "processingLeaseUntil" IS NULL OR "processingLeaseUntil"<=timezone('UTC',CURRENT_TIMESTAMP)) ORDER BY "expiresAt",id LIMIT 16 FOR UPDATE SKIP LOCKED`,
          );
          for (const row of rows) {
            const knownKey = `^${prefix}/${row.id}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/data\\.${extension}$`,
              cutoff = new Date(Date.now() - options.retentionHours * 3600000 - 1000);
            // A document explicitly linked into an item/profile belongs to that retained record.
            await tx.$queryRaw(
              Prisma.sql`UPDATE "MediaAsset" a SET "orphanedAt"=LEAST(COALESCE(a."orphanedAt",${cutoff}),${cutoff}) WHERE a."ownerId"=${row.ownerId} AND a.kind='DOCUMENT' AND a."storageKey"~${knownKey} AND NOT EXISTS(SELECT 1 FROM "MediaLink" l WHERE l."assetId"=a.id) AND NOT EXISTS(SELECT 1 FROM "DocumentLink" l WHERE l."assetId"=a.id) AND NOT EXISTS(SELECT 1 FROM "UserProfile" p WHERE p."avatarAssetId"=a.id) RETURNING a.id`,
            );
            await tx.$queryRaw(
              Prisma.sql`DELETE FROM ${table} WHERE id=${row.id}::uuid RETURNING id`,
            );
          }
        });
      }
    },
  };
}
