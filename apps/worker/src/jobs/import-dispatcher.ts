import { Prisma } from "@sammlerraum/db/search-sql";
import { runSearchTransaction, type SearchDatabase } from "@sammlerraum/domain/search/search-read";
import { IMPORT_PARSE_JOB } from "./import-parser-runtime";
import { IMPORT_COMMIT_JOB } from "./commit-import";

/** Database intents survive queue outages; only uploaded or approved work is eligible. */
export function createImportDispatcher(
  database: SearchDatabase,
  queue: {
    enqueue(
      name: string,
      payload: { jobId: string },
      options: { singletonKey: string },
    ): Promise<string>;
  },
  logger: Pick<Console, "error">,
  intervalMs = 12000,
) {
  let timer: ReturnType<typeof setInterval> | undefined, running: Promise<void> | undefined;
  async function dispatchOnce() {
    const rows = await runSearchTransaction(database, (tx) =>
      tx.$queryRaw<{ id: string; status: string }[]>(
        Prisma.sql`SELECT j.id,j.status FROM "ImportJob" j JOIN "Collection" c ON c.id=j."collectionId" AND c."ownerId"=j."ownerId" WHERE c."deletedAt" IS NULL AND (j."lastDispatchedAt" IS NULL OR j."lastDispatchedAt"<timezone('UTC',CURRENT_TIMESTAMP)-interval '60 seconds') AND ((j.status IN ('AWAITING_UPLOAD','PARSING') AND j."uploadCompletedAt" IS NOT NULL AND j."sourceExpiresAt">timezone('UTC',CURRENT_TIMESTAMP) AND j."parserOptions" IS NOT NULL AND (j."parsingLeaseUntil" IS NULL OR j."parsingLeaseUntil"<=timezone('UTC',CURRENT_TIMESTAMP))) OR (j.status='COMMITTING' AND j."commitApprovedAt" IS NOT NULL)) ORDER BY j."createdAt",j.id LIMIT 32`,
      ),
    );
    for (const row of rows) {
      try {
        await queue.enqueue(
          row.status === "COMMITTING" ? IMPORT_COMMIT_JOB : IMPORT_PARSE_JOB,
          { jobId: row.id },
          { singletonKey: row.id },
        );
        await runSearchTransaction(database, (tx) =>
          tx.$queryRaw(
            Prisma.sql`UPDATE "ImportJob" SET "lastDispatchedAt"=timezone('UTC',CURRENT_TIMESTAMP) WHERE id=${row.id}::uuid AND status=${row.status}::"ImportJobStatus" RETURNING id`,
          ),
        );
      } catch {
        logger.error("Import dispatch failed");
      }
    }
  }
  return {
    dispatchOnce,
    start() {
      if (timer) throw Error("Import dispatcher already started");
      const tick = () => {
        if (running) return;
        running = dispatchOnce()
          .catch(() => logger.error("Import scan failed"))
          .finally(() => {
            running = undefined;
          });
      };
      tick();
      timer = setInterval(tick, intervalMs);
      timer.unref();
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      await running;
    },
  };
}
