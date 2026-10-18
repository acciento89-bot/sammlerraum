import { Prisma } from "@sammlerraum/db/search-sql";
import { ItemSearchError, searchFail } from "@sammlerraum/contracts/item-search";
import { SmartCollectionError } from "@sammlerraum/contracts/smart-collections";
import { FilterValidationError } from "@sammlerraum/contracts/search";
import { isReadDependencyFailure, isReadSerializationFailure } from "../api/read-dependency-errors";
export type SearchReadTransaction = { $queryRaw<T>(sql: Prisma.Sql): Promise<T> };
export type BoundedSearchReadTransaction = SearchReadTransaction & { checkBudget(): void };
export type SearchDatabase = {
  $transaction<T>(
    work: (tx: SearchReadTransaction) => Promise<T>,
    options: { isolationLevel: "RepeatableRead"; maxWait: number; timeout: number },
  ): Promise<T>;
};
/** Entire operation retries within 12s; no locks or snapshot survive a response. */
export async function runSearchTransaction<T>(
  database: SearchDatabase,
  work: (tx: BoundedSearchReadTransaction) => Promise<T>,
): Promise<T> {
  const stop = performance.now() + 12000;
  for (let attempt = 0; attempt < 3; attempt++) {
    const remaining = Math.floor(stop - performance.now());
    if (remaining < 1) return searchFail("SEARCH_UNAVAILABLE");
    try {
      const result = await database.$transaction(
        async (raw) => {
          const txStop = Math.min(stop, performance.now() + 5000);
          const budget = () => {
            const left = Math.floor(txStop - performance.now());
            if (left < 1) return searchFail("SEARCH_UNAVAILABLE");
            return left;
          };
          const first = budget();
          await raw.$queryRaw(
            Prisma.sql`SELECT set_config('TimeZone','UTC',true),set_config('statement_timeout',${`${Math.min(2000, first)}ms`},true),set_config('lock_timeout',${`${Math.min(500, first)}ms`},true),set_config('transaction_timeout',${`${first}ms`},true)`,
          );
          budget();
          const tx: BoundedSearchReadTransaction = {
            checkBudget: () => {
              budget();
            },
            $queryRaw: async <T>(query: Prisma.Sql) => {
              const left = budget();
              await raw.$queryRaw(
                Prisma.sql`SELECT set_config('statement_timeout',${`${Math.min(2000, left)}ms`},true),set_config('lock_timeout',${`${Math.min(500, left)}ms`},true)`,
              );
              budget();
              const rows = await raw.$queryRaw<T>(query);
              budget();
              return rows;
            },
          };
          const result = await work(tx);
          budget();
          return result;
        },
        {
          isolationLevel: "RepeatableRead",
          maxWait: Math.min(2000, remaining),
          timeout: Math.min(5000, remaining),
        },
      );
      if (performance.now() >= stop) return searchFail("SEARCH_UNAVAILABLE");
      return result;
    } catch (error) {
      if (
        error instanceof ItemSearchError ||
        error instanceof FilterValidationError ||
        error instanceof SmartCollectionError
      )
        throw error;
      if (isReadSerializationFailure(error) && attempt < 2 && performance.now() < stop) continue;
      if (isReadDependencyFailure(error)) return searchFail("SEARCH_UNAVAILABLE");
      // This compiler's only named collation is a deployment dependency. Never expose SQL.
      const code = (error as { meta?: { code?: unknown } } | null)?.meta?.code;
      if (code === "42704") return searchFail("SEARCH_UNAVAILABLE");
      return searchFail("SEARCH_INVARIANT");
    }
  }
  return searchFail("SEARCH_UNAVAILABLE");
}

/** Compatibility alias for existing read-only search callers. */
export const runSearchRead = runSearchTransaction;
