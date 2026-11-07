import { RestoreError } from "@sammlerraum/contracts/restore";
import { AuditError } from "@sammlerraum/contracts/audit";
import { ShareError } from "@sammlerraum/contracts/sharing";
import { Prisma } from "@sammlerraum/db/search-sql";
import { MembershipError, InvitationError } from "@sammlerraum/contracts/collaboration";
import { isReadDependencyFailure, isReadSerializationFailure } from "../api/read-dependency-errors";
import type { SearchReadTransaction, BoundedSearchReadTransaction } from "../search/search-read";
export type MembershipDatabase = {
  $transaction<T>(
    work: (tx: SearchReadTransaction) => Promise<T>,
    options: {
      isolationLevel: "RepeatableRead" | "ReadCommitted";
      maxWait: number;
      timeout: number;
    },
  ): Promise<T>;
};
function isUniqueConflict(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 5) return false;
  const value = error as Record<string, unknown>;
  if ([value.code, value.originalCode].some((code) => code === "23505" || code === "P2002"))
    return true;
  return ["meta", "cause", "driverAdapterError"].some((key) =>
    isUniqueConflict(value[key], depth + 1),
  );
}
/** Locks precede dependency reads. READ COMMITTED sees child writes that settled while waiting. */
export async function runTransferTransaction<T>(
  database: MembershipDatabase,
  work: (tx: BoundedSearchReadTransaction) => Promise<T>,
): Promise<T> {
  const stop = performance.now() + 12000;
  for (let attempt = 0; attempt < 3; attempt++) {
    const remaining = Math.floor(stop - performance.now());
    if (remaining < 1) throw new MembershipError("MEMBERSHIP_UNAVAILABLE");
    try {
      return await database.$transaction(
        async (raw) => {
          const transactionStop = Math.min(stop, performance.now() + 5000);
          const budget = () => {
            const left = Math.floor(transactionStop - performance.now());
            if (left < 1) throw new MembershipError("MEMBERSHIP_UNAVAILABLE");
            return left;
          };
          const first = budget();
          await raw.$queryRaw(
            Prisma.sql`SELECT set_config('TimeZone','UTC',true),set_config('statement_timeout',${`${Math.min(2000, first)}ms`},true),set_config('lock_timeout',${`${Math.min(500, first)}ms`},true),set_config('transaction_timeout',${`${first}ms`},true)`,
          );
          const tx: BoundedSearchReadTransaction = {
            checkBudget: () => {
              budget();
            },
            $queryRaw: async <R>(query: Prisma.Sql) => {
              const left = budget();
              await raw.$queryRaw(
                Prisma.sql`SELECT set_config('statement_timeout',${`${Math.min(2000, left)}ms`},true),set_config('lock_timeout',${`${Math.min(500, left)}ms`},true)`,
              );
              budget();
              const result = await raw.$queryRaw<R>(query);
              budget();
              return result;
            },
          };
          const result = await work(tx);
          budget();
          return result;
        },
        {
          isolationLevel: "ReadCommitted",
          maxWait: Math.min(2000, remaining),
          timeout: Math.min(5000, remaining),
        },
      );
    } catch (error) {
      if (
        error instanceof RestoreError ||
        error instanceof AuditError ||
        error instanceof ShareError ||
        error instanceof MembershipError ||
        error instanceof InvitationError
      )
        throw error;
      if (isUniqueConflict(error)) throw new MembershipError("MEMBERSHIP_CONFLICT");
      if (isReadSerializationFailure(error) && attempt < 2 && performance.now() < stop) continue;
      if (isReadDependencyFailure(error)) throw new MembershipError("MEMBERSHIP_UNAVAILABLE");
      throw new MembershipError("MEMBERSHIP_INTEGRITY");
    }
  }
  throw new MembershipError("MEMBERSHIP_UNAVAILABLE");
}
