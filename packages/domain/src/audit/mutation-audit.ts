import { AuditError } from "@sammlerraum/contracts/audit";
import type { Prisma } from "@sammlerraum/db/search-sql";
import type { SearchReadTransaction } from "../search/search-read";
import {
  createTrustedAuditContext,
  requireTrustedAuditContext,
  type AuditContext,
} from "./audit-context";
import { recordAuditEventInTransaction } from "./audit-service";
import { lockAuditUser } from "./audit-scope";
export type TaggedAuditTransaction = {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};
/** Preserve every bound parameter while bridging older tagged-only transaction interfaces. */
export function auditSqlTransaction(tx: TaggedAuditTransaction): SearchReadTransaction {
  return {
    $queryRaw<T>(query: Prisma.Sql) {
      const strings = Object.assign([...query.strings], { raw: [...query.strings] });
      return tx.$queryRaw<T>(strings, ...query.values);
    },
  };
}
export async function beginMutationAudit(
  tx: TaggedAuditTransaction,
  actorId: string,
  missing?: () => Error,
  suppliedContext?: AuditContext,
): Promise<AuditContext> {
  const context =
    suppliedContext === undefined
      ? createTrustedAuditContext({ source: "USER", actorId })
      : requireTrustedAuditContext(suppliedContext);
  if (context.actorId !== actorId) throw new AuditError("AUDIT_INVALID");
  try {
    await lockAuditUser(auditSqlTransaction(tx), actorId);
  } catch (error) {
    if (error instanceof AuditError && error.code === "AUDIT_NOT_FOUND" && missing) throw missing();
    throw error;
  }
  return context;
}
export async function appendMutationAudit(
  tx: TaggedAuditTransaction,
  context: AuditContext,
  input: unknown,
) {
  await recordAuditEventInTransaction(auditSqlTransaction(tx), context, input);
}

export type MutationAuditPort = {
  begin: typeof beginMutationAudit;
  append: typeof appendMutationAudit;
};
/** Production is always real SQL. An explicit port supports isolated transaction unit fixtures. */
export const defaultMutationAudit: MutationAuditPort = Object.freeze({
  begin: beginMutationAudit,
  append: appendMutationAudit,
});
