import type { Prisma } from "@sammlerraum/db/search-sql";
import type { SearchReadTransaction } from "../search/search-read";
/** One adapter per actual active transaction, retaining its identity for resolved facts. */
export function moneyTransaction(tx: {
  $queryRaw<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}): SearchReadTransaction {
  return {
    $queryRaw: <T>(query: Prisma.Sql) => {
      const strings = Object.assign([...query.strings], { raw: [...query.strings] });
      return tx.$queryRaw<T>(strings, ...query.values);
    },
  };
}
