import { featureEnabledInTransaction } from "../billing/admission";
import { readPurchaseCost } from "../money/purchase-cost";
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
import { withItemSelection, disabledSearchMarket } from "../search/search-selection";
import {
  withMarketBatch,
  MarketBatchError,
  type MarketBatchDependencies,
  type MarketSelector,
  type MarketAggregateBasis,
} from "../market-data/market-batch";
import { aggregateMarketBatch } from "../market-data/market-aggregate";
import { candidateFrom, ownedCandidates } from "../search/search-compiler";
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
import { Prisma } from "@sammlerraum/db/search-sql";

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
export function createDashboardService(
  database: SearchDatabase,
  options: {
    canonicalMoneyEnabled?: boolean;
    market?: MarketBatchDependencies;
    marketReference?: { selectors: readonly MarketSelector[]; basis: MarketAggregateBasis };
  } = {},
) {
  const canonicalMoneyEnabled = options.canonicalMoneyEnabled === true;
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
      if (query.filter)
        validateCurrentFilterAvailability(query.filter, canonicalMoneyEnabled, true);
      return runSearchRead(database, async (tx) => {
        const advanced = await featureEnabledInTransaction(tx, actor.userId, "ADVANCED_ANALYTICS");
        return withItemSelection(
          tx,
          actor,
          query,
          canonicalMoneyEnabled,
          options.market ?? disabledSearchMarket,
          async (selection) => {
            const predicate = selection.matchedPredicate;
            const readTx: BoundedSearchReadTransaction = selection.prefix.text
              ? {
                  ...tx,
                  $queryRaw: <T>(sql: Prisma.Sql) =>
                    tx.$queryRaw<T>(
                      Prisma.sql`${selection.prefix}SELECT * FROM (${sql}) AS market_dashboard_consumer`,
                    ),
                }
              : tx;
            const finish = async (marketValues: DashboardData["marketValues"]) => {
              const summary = await read(
                readTx,
                dashboardSummarySql(actor.userId, predicate),
                DashboardSummarySchema,
              );
              const manual = await read(
                readTx,
                dashboardManualSql(predicate),
                DashboardManualSchema,
                true,
              );
              const distributions = advanced
                ? await read(
                    readTx,
                    dashboardDistributionsSql(predicate),
                    DashboardDistributionsSchema,
                  )
                : { condition: null, grading: null };
              const rankings = await read(
                readTx,
                dashboardRankingsSql(predicate),
                DashboardRankingsSchema,
              );
              const [progress] = await tx.$queryRaw<
                { wishes: bigint; fulfilled: bigint; duplicates: bigint; items: bigint }[]
              >(
                Prisma.sql`/* dashboard:community_progress */ SELECT (SELECT count(*) FROM "WishlistEntry" WHERE "ownerId"=${actor.userId} AND "fulfilledAt" IS NULL) AS wishes,(SELECT count(*) FROM "WishlistEntry" WHERE "ownerId"=${actor.userId} AND "fulfilledAt" IS NOT NULL) AS fulfilled,(SELECT count(*) FROM "DuplicateRelation" r JOIN "CollectibleItem" a ON a.id=r."itemAId" JOIN "Collection" ac ON ac.id=a."collectionId" JOIN "CollectibleItem" b ON b.id=r."itemBId" JOIN "Collection" bc ON bc.id=b."collectionId" WHERE r."ownerId"=${actor.userId} AND a."ownerId"=${actor.userId} AND b."ownerId"=${actor.userId} AND ac."ownerId"=${actor.userId} AND bc."ownerId"=${actor.userId} AND a."deletedAt" IS NULL AND b."deletedAt" IS NULL AND ac."deletedAt" IS NULL AND bc."deletedAt" IS NULL) AS duplicates,(SELECT count(*) FROM "CollectibleItem" i JOIN "Collection" c ON c.id=i."collectionId" WHERE i."ownerId"=${actor.userId} AND c."ownerId"=${actor.userId} AND i."deletedAt" IS NULL AND c."deletedAt" IS NULL) AS items`,
              );
              if (
                !progress ||
                Object.values(progress).some((n) => n < 0n || n > BigInt(Number.MAX_SAFE_INTEGER))
              )
                return searchFail("SEARCH_INVARIANT");
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
                  advancedAnalytics: advanced ? "AVAILABLE" : "PREMIUM_REQUIRED",
                  manualChange: advanced ? manual.manualChange : null,
                  topCollections: advanced ? rankings.topCollections : null,
                  purchaseTotals: canonicalMoneyEnabled
                    ? await readPurchaseCost(
                        readTx,
                        { ownerId: actor.userId, predicate: selection.outerPredicate },
                        predicate,
                      )
                    : {
                        state: "UNAVAILABLE",
                        reason: "LEGACY_MONEY_INTERPRETATION_UNAVAILABLE",
                        groups: null,
                      },
                  marketValues,
                  duplicates: {
                    state: "AVAILABLE",
                    selectionBasis: "ALL_LIVE_OWNED_PAIRS",
                    count: Number(progress.duplicates),
                  },
                  wishlist: {
                    state: "AVAILABLE",
                    selectionBasis: "ALL_OWNED_WISHES",
                    count: Number(progress.wishes),
                    fulfilledCount: Number(progress.fulfilled),
                  },
                  milestoneCandidates: [
                    ...[10, 50, 100, 500, 1000].map((threshold) => ({
                      kind: "ITEM_COUNT",
                      threshold,
                      achieved: progress.items >= BigInt(threshold),
                    })),
                    {
                      kind: "WISHLIST_COMPLETED",
                      threshold: 1,
                      achieved: progress.fulfilled > 0n && progress.wishes === 0n,
                    },
                  ],
                },
                tx.checkBudget,
              );
            };
            const unavailable: DashboardData["marketValues"] = {
              state: "UNAVAILABLE",
              reason: "MARKET_AGGREGATION_UNAVAILABLE",
              groups: null,
            };
            if (!options.marketReference) return finish(unavailable);
            try {
              const context = {
                tx,
                scope: { actorUserId: actor.userId, lifecycle: query.lifecycle },
                ownedCandidates: Prisma.sql`SELECT i.id,i.quantity,i."catalogEntryId",i."catalogVariantId" ${candidateFrom} WHERE ${ownedCandidates(actor.userId, query.lifecycle)}`,
                checkBudget: tx.checkBudget,
              };
              const { selectors, basis } = options.marketReference;
              return await withMarketBatch(
                context,
                selectors,
                { purpose: "DASHBOARD_AGGREGATE", basis },
                options.market ?? disabledSearchMarket,
                async (batch) =>
                  finish({
                    state: "AVAILABLE",
                    selectionBasis: "ALL_LIFECYCLE_OWNED",
                    groups: [...(await aggregateMarketBatch(context, batch, selectors, basis))],
                  }),
              );
            } catch (error) {
              if (!(error instanceof MarketBatchError)) throw error;
              if (error.code !== "MARKET_BATCH_UNAVAILABLE")
                return searchFail(
                  error.code === "MARKET_BATCH_DEPENDENCY"
                    ? "SEARCH_UNAVAILABLE"
                    : "SEARCH_INVARIANT",
                );
              return finish(unavailable);
            }
          },
        );
      });
    },
  };
}
