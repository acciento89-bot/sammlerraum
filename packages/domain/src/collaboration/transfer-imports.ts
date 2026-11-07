import { MembershipError } from "@sammlerraum/contracts/collaboration";
import { Prisma } from "@sammlerraum/db/search-sql";
import type { BoundedSearchReadTransaction } from "../search/search-read";
/** Terminal import history is ephemeral, not recipient-owned content. Keep the erasure manifest. */
export async function retirePrivateImports(
  tx: BoundedSearchReadTransaction,
  collectionId: string,
  oldOwnerId: string,
): Promise<void> {
  const jobs = await tx.$queryRaw<
    { id: string; ownerId: string; status: string; active: boolean | null }[]
  >(Prisma.sql`
    SELECT id,"ownerId",status,"parsingLeaseUntil">timezone('UTC',CURRENT_TIMESTAMP) AS active
    FROM "ImportJob" WHERE "collectionId"=${collectionId}::uuid ORDER BY id LIMIT 21 FOR UPDATE NOWAIT
  `);
  if (jobs.length > 20) throw new MembershipError("MEMBERSHIP_LIMIT_EXCEEDED");
  for (const job of jobs) {
    if (job.ownerId !== oldOwnerId) throw new MembershipError("MEMBERSHIP_INTEGRITY");
    if (job.active || !["COMPLETED", "FAILED", "CANCELLED"].includes(job.status))
      throw new MembershipError("MEMBERSHIP_TRANSFER_BLOCKED");
    const [lock] = await tx.$queryRaw<{ acquired: boolean }[]>(Prisma.sql`
      SELECT pg_try_advisory_xact_lock(hashtextextended(${`sammlerraum:media:import-source:${job.id}`},0)) AS acquired
    `);
    if (!lock?.acquired) throw new MembershipError("MEMBERSHIP_TRANSFER_BLOCKED");
    const [source] = await tx.$queryRaw<{ storageKey: string; jobId: string | null }[]>(Prisma.sql`
      SELECT "storageKey","jobId" FROM "ImportSourceObject" WHERE id=${job.id}::uuid FOR UPDATE NOWAIT
    `);
    if (source?.jobId !== job.id || source.storageKey !== `imports/${job.id}/source`)
      throw new MembershipError("MEMBERSHIP_INTEGRITY");
  }
  if (jobs.length) {
    const removed = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      DELETE FROM "ImportJob" WHERE "collectionId"=${collectionId}::uuid AND "ownerId"=${oldOwnerId}
      AND status IN ('COMPLETED','FAILED','CANCELLED') RETURNING id
    `);
    if (removed.length !== jobs.length) throw new MembershipError("MEMBERSHIP_INTEGRITY");
    // ON DELETE SET NULL leaves known source keys recoverable by the existing I/O-locked worker.
  }
}
