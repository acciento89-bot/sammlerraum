import { Prisma } from "@sammlerraum/db/search-sql";
import type { StorageProvider, StorageStagingLocker } from "@sammlerraum/storage";
import { runSearchTransaction, type SearchDatabase } from "@sammlerraum/domain/search/search-read";
type ObjectRow = {
  id: string;
  jobId: string | null;
  storageKey: string;
  expired: boolean;
  cleanupStartedAt: Date | null;
  deletedAt: Date | null;
};
/** Known manifests only. The same lock spans actual upload/parser I/O and byte deletion. */
export function createImportSourceCleanup(
  database: SearchDatabase,
  storage: StorageProvider,
  lock: StorageStagingLocker,
  logger: Pick<Console, "error">,
) {
  async function prepare(id: string) {
    return runSearchTransaction(database, async (tx) => {
      const [initial] = await tx.$queryRaw<ObjectRow[]>(
        Prisma.sql`SELECT *,"expiresAt"<=timezone('UTC',CURRENT_TIMESTAMP) AS expired FROM "ImportSourceObject" WHERE id=${id}::uuid`,
      );
      if (!initial) return null;
      let job: { status: string; active: boolean; unexpired: boolean } | undefined,
        parent: { deletedAt: Date | null } | undefined;
      if (initial.jobId) {
        const [ref] = await tx.$queryRaw<{ collectionId: string }[]>(
          Prisma.sql`SELECT "collectionId" FROM "ImportJob" WHERE id=${initial.jobId}::uuid`,
        );
        if (ref) {
          [parent] = await tx.$queryRaw<{ deletedAt: Date | null }[]>(
            Prisma.sql`SELECT "deletedAt" FROM "Collection" WHERE id=${ref.collectionId}::uuid FOR SHARE`,
          );
          [job] = await tx.$queryRaw<{ status: string; active: boolean; unexpired: boolean }[]>(
            Prisma.sql`SELECT status,"parsingLeaseUntil">timezone('UTC',CURRENT_TIMESTAMP) AS active,"sourceExpiresAt">timezone('UTC',CURRENT_TIMESTAMP) AS unexpired FROM "ImportJob" WHERE id=${initial.jobId}::uuid FOR UPDATE`,
          );
        }
      }
      const [row] = await tx.$queryRaw<ObjectRow[]>(
        Prisma.sql`SELECT *,"expiresAt"<=timezone('UTC',CURRENT_TIMESTAMP) AS expired FROM "ImportSourceObject" WHERE id=${id}::uuid FOR UPDATE`,
      );
      if (!row) return null;
      if (row.storageKey !== `imports/${id}/source`) throw Error("Invalid internal source key");
      if (row.deletedAt) return { key: row.storageKey };
      if (job?.active) return null;
      const live = parent !== undefined && parent.deletedAt === null;
      if (
        job &&
        live &&
        (job.status === "COMMITTING" ||
          (!row.cleanupStartedAt && (!row.expired || job.unexpired) && job.status !== "CANCELLED"))
      )
        return null;
      await tx.$queryRaw(
        Prisma.sql`UPDATE "ImportSourceObject" SET "cleanupStartedAt"=COALESCE("cleanupStartedAt",timezone('UTC',clock_timestamp())) WHERE id=${id}::uuid RETURNING id`,
      );
      if (row.jobId)
        await tx.$queryRaw(
          Prisma.sql`DELETE FROM "ImportJob" WHERE id=${row.jobId}::uuid RETURNING id`,
        );
      return { key: row.storageKey };
    });
  }
  return {
    async run() {
      const rows = await runSearchTransaction(database, (tx) =>
        tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT o.id FROM "ImportSourceObject" o LEFT JOIN "ImportJob" j ON j.id=o."jobId" LEFT JOIN "Collection" c ON c.id=j."collectionId" WHERE (o."deletedAt" IS NULL AND (o."jobId" IS NULL OR o."expiresAt"<=timezone('UTC',CURRENT_TIMESTAMP) OR c."deletedAt" IS NOT NULL OR j.status='CANCELLED' OR o."cleanupStartedAt" IS NOT NULL)) OR (o."deletedAt" IS NOT NULL AND (o."lastReconciledAt" IS NULL OR o."lastReconciledAt"<timezone('UTC',CURRENT_TIMESTAMP)-interval '1 hour')) ORDER BY o."lastAttemptAt" ASC NULLS FIRST,o."expiresAt",o.id LIMIT 32`,
        ),
      );
      for (const row of rows) {
        try {
          await runSearchTransaction(database, (tx) =>
            tx.$queryRaw(
              Prisma.sql`UPDATE "ImportSourceObject" SET "lastAttemptAt"=timezone('UTC',CURRENT_TIMESTAMP) WHERE id=${row.id}::uuid RETURNING id`,
            ),
          );
          await lock(`import-source:${row.id}`, async () => {
            const work = await prepare(row.id);
            if (!work) return;
            await storage.delete(work.key);
            await runSearchTransaction(database, (tx) =>
              tx.$queryRaw(
                Prisma.sql`UPDATE "ImportSourceObject" SET "deletedAt"=COALESCE("deletedAt",timezone('UTC',clock_timestamp())),"lastReconciledAt"=timezone('UTC',clock_timestamp()) WHERE id=${row.id}::uuid AND "jobId" IS NULL RETURNING id`,
              ),
            );
          });
        } catch {
          logger.error("Import source cleanup failed");
        }
      }
    },
  };
}
