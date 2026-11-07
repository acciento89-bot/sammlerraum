import { randomUUID } from "node:crypto";
import { Prisma } from "@sammlerraum/db/search-sql";
import {
  AuditError,
  AuditEventSchema,
  AuditResourceQuerySchema,
  RecordAuditSchema,
} from "@sammlerraum/contracts/audit";
import { MembershipActorIdSchema, MembershipError } from "@sammlerraum/contracts/collaboration";
import {
  runTransferTransaction,
  type MembershipDatabase,
} from "../collaboration/transfer-transaction";
import type { SearchReadTransaction, BoundedSearchReadTransaction } from "../search/search-read";
import { checkedAuditMutation } from "./audit-event-definitions";
import {
  createTrustedAuditContext,
  requireTrustedAuditContext,
  type AuditContext,
} from "./audit-context";
import { resolveAuditScope, lockAuditUser, auditAnchorPredicate } from "./audit-scope";
const columns = Prisma.sql`id,sequence::text,"resourceType","resourceId",action,source,"actorId",before,after,to_char("createdAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"`;
function checkedRow(input: unknown) {
  const parsed = AuditEventSchema.safeParse(input);
  if (!parsed.success) throw new AuditError("AUDIT_INTEGRITY");
  const value = parsed.data;
  try {
    checkedAuditMutation({
      resourceType: value.resourceType,
      resourceId: value.resourceId,
      action: value.action,
      before: value.before,
      after: value.after,
    });
  } catch {
    throw new AuditError("AUDIT_INTEGRITY");
  }
  return value;
}
function actor(who: { userId: string }) {
  const p = MembershipActorIdSchema.safeParse(who?.userId);
  if (!p.success) throw new AuditError("AUDIT_INVALID");
  return p.data;
}
/** Internal same-transaction append. It never starts/commits an independent transaction.
 * Only validated mutation/worker code can provide a branded source context. */
export async function recordAuditEventInTransaction(
  tx: SearchReadTransaction,
  context: AuditContext,
  input: unknown,
) {
  const who = requireTrustedAuditContext(context),
    value = checkedAuditMutation(input);
  if (who.actorId) await lockAuditUser(tx, who.actorId);
  const scope = await resolveAuditScope(tx, value);
  if (who.source === "USER" && scope.ownerId !== who.actorId) {
    if (!scope.collectionId && !scope.itemId) throw new AuditError("AUDIT_NOT_FOUND");
    const [allowed] = await tx.$queryRaw<{ present: boolean }[]>(
      Prisma.sql`SELECT EXISTS(SELECT 1 FROM "CollectionMember" m WHERE m."collectionId"=${scope.collectionId ? Prisma.sql`${scope.collectionId}::uuid` : Prisma.sql`(SELECT "collectionId" FROM "CollectibleItem" WHERE id=${scope.itemId}::uuid)`} AND m."userId"=${who.actorId} AND m.role IN ('ADMIN','EDITOR')) AS present`,
    );
    if (!allowed?.present) throw new AuditError("AUDIT_NOT_FOUND");
  }
  const id = randomUUID();
  const [row] = await tx.$queryRaw<unknown[]>(
    Prisma.sql`INSERT INTO "AuditEvent" (id,"resourceType","resourceId","collectionId","itemId","locationOwnerUserId",action,source,"actorId",before,after) VALUES (${id}::uuid,${value.resourceType}::"AuditResourceType",${value.resourceId}::uuid,${scope.collectionId}::uuid,${scope.itemId}::uuid,${scope.locationOwnerUserId},${value.action},${who.source}::"AuditSource",${who.actorId},${JSON.stringify(value.before)}::jsonb,${JSON.stringify(value.after)}::jsonb) RETURNING ${columns}`,
  );
  return checkedRow(row);
}
export function createAuditService(database: MembershipDatabase) {
  async function within<T>(work: (tx: BoundedSearchReadTransaction) => Promise<T>) {
    try {
      return await runTransferTransaction(database, work);
    } catch (error) {
      if (error instanceof AuditError) throw error;
      if (error instanceof MembershipError && error.code === "MEMBERSHIP_UNAVAILABLE")
        throw new AuditError("AUDIT_UNAVAILABLE");
      throw new AuditError("AUDIT_INTEGRITY");
    }
  }
  return {
    async recordAuditEvent(who: { userId: string }, input: unknown) {
      const id = actor(who),
        p = RecordAuditSchema.safeParse(input);
      if (!p.success) throw new AuditError("AUDIT_INVALID");
      if (p.data.source !== "USER") throw new AuditError("AUDIT_FORBIDDEN");
      const { source, ...mutation } = p.data,
        value = checkedAuditMutation(mutation);
      return within(async (tx) => {
        await lockAuditUser(tx, id);
        const scope = await resolveAuditScope(tx, value, false, id);
        if (scope.ownerId !== id) throw new AuditError("AUDIT_NOT_FOUND");
        return recordAuditEventInTransaction(
          tx,
          createTrustedAuditContext({ source, actorId: id }),
          value,
        );
      });
    },
    async listAuditEventsForResource(who: { userId: string }, input: unknown) {
      const id = actor(who),
        p = AuditResourceQuerySchema.safeParse(input);
      if (!p.success) throw new AuditError("AUDIT_INVALID");
      const value = p.data;
      return within(async (tx) => {
        await lockAuditUser(tx, id);
        const scope = await resolveAuditScope(tx, value, true, id);
        if (scope.ownerId !== id) throw new AuditError("AUDIT_NOT_FOUND");
        const rows = await tx.$queryRaw<unknown[]>(
          Prisma.sql`SELECT ${columns} FROM "AuditEvent" WHERE "resourceType"=${value.resourceType}::"AuditResourceType" AND "resourceId"=${value.resourceId}::uuid AND ${auditAnchorPredicate(scope)} ${value.beforeSequence ? Prisma.sql`AND sequence<${value.beforeSequence}::bigint` : Prisma.empty} ORDER BY "AuditEvent".sequence DESC LIMIT ${value.limit + 1}`,
        );
        const events = rows.slice(0, value.limit).map(checkedRow);
        return { events, next: rows.length > value.limit ? events.at(-1)!.sequence : null };
      });
    },
  };
}
