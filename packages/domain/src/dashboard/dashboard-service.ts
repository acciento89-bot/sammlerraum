import { checkedDashboardPart, finalizeDashboard, type Schema } from "./dashboard-result";
import { searchFail } from "@sammlerraum/contracts/item-search";
import {
  DashboardSummarySchema,
  DashboardManualSchema,
  DashboardDistributionsSchema,
  DashboardRankingsSchema,
  parseDashboardQuery,
  type DashboardData,
} from "@sammlerraum/contracts/dashboard";
import { validateCurrentFilterAvailability } from "../search/filter-ast";
import { prepareItemSelection } from "../search/search-selection";
import {
  runSearchRead,
  type SearchDatabase,
  type BoundedSearchReadTransaction,
} from "../search/search-read";
import {
  dashboardSummarySql,
  dashboardManualSql,
  dashboardDistributionsSql,
  dashboardRankingsSql,
} from "./dashboard-sql";
import type { Prisma } from "@sammlerraum/db/search-sql";

async function read<T>(
  tx: BoundedSearchReadTransaction,
  sql: Prisma.Sql,
  schema: Schema<T>,
  requireValidDenominations = false,
): Promise<T> {
  const rows =
    await tx.$queryRaw<{ data: unknown; overflow?: boolean; denominationsValid?: unknown }[]>(sql);
  if (
    rows.length !== 1 ||
    (rows[0]!.overflow !== undefined && typeof rows[0]!.overflow !== "boolean")
  )
    return searchFail("SEARCH_INVARIANT");
  if (requireValidDenominations && rows[0]!.denominationsValid !== true)
    return searchFail("SEARCH_INVARIANT");
  if (rows[0]!.overflow) return searchFail("SEARCH_UNAVAILABLE");
  return checkedDashboardPart(schema, rows[0]!.data, tx.checkBudget);
}
/** Partial owned milestone. Producer capability states are explicit, never numeric placeholders. */
export function createDashboardService(database: SearchDatabase) {
  return {
    getDashboard: async (actor: { userId: string }, input: unknown): Promise<DashboardData> => {
      if (
        !actor ||
        typeof actor.userId !== "string" ||
        !actor.userId ||
        actor.userId.includes("\0")
      )
        return searchFail("SEARCH_INVALID");
      const query = parseDashboardQuery(input);
      if (query.filter) validateCurrentFilterAvailability(query.filter);
      return runSearchRead(database, async (tx) => {
        const selection = await prepareItemSelection(tx, actor, query),
          predicate = selection.matchedPredicate;
        const summary = await read(
          tx,
          dashboardSummarySql(actor.userId, predicate),
          DashboardSummarySchema,
        );
        const manual = await read(tx, dashboardManualSql(predicate), DashboardManualSchema, true);
        const distributions = await read(
          tx,
          dashboardDistributionsSql(predicate),
          DashboardDistributionsSchema,
        );
        const rankings = await read(tx, dashboardRankingsSql(predicate), DashboardRankingsSchema);
        return finalizeDashboard(
          {
            version: 1,
            scope: "OWNED",
            lifecycle: query.lifecycle,
            readAt: selection.readAt,
            ...summary,
            ...manual,
            ...distributions,
            ...rankings,
            purchaseTotals: {
              state: "UNAVAILABLE",
              reason: "LEGACY_MONEY_INTERPRETATION_UNAVAILABLE",
              groups: null,
            },
            marketValues: {
              state: "UNAVAILABLE",
              reason: "MARKET_AGGREGATION_UNAVAILABLE",
              groups: null,
            },
            duplicates: { state: "UNAVAILABLE", reason: "DUPLICATE_NOT_IMPLEMENTED", count: null },
            wishlist: { state: "UNAVAILABLE", reason: "WISHLIST_NOT_IMPLEMENTED", count: null },
          },
          tx.checkBudget,
        );
      });
    },
  };
}
