import type { Prisma } from "@sammlerraum/db/search-sql";
import type { ItemFilterLeaf } from "@sammlerraum/contracts/search";
import type { SearchReadTransaction } from "../search/search-read";
import type { MarketDisplayPolicy } from "../valuations/market-display-policy";
import type { ProviderRegistry } from "@sammlerraum/market-data/provider-registry";
export type MarketLeaf = Extract<ItemFilterLeaf, { kind: "marketMoney" }>;
export type MarketSelector = MarketLeaf["selector"];
export type MarketPurpose = "FILTER" | "DASHBOARD_DETAIL";
export type MarketAggregateBasis = "ONE_PER_ITEM" | "CURRENT_QUANTITY";
export type MarketQueryGrant = Readonly<{
  selector: MarketSelector;
  purposes: readonly MarketPurpose[];
}>;
export type MarketAggregateGrant = Readonly<{
  selector: MarketSelector;
  semantics: "ADDITIVE_PER_UNIT_REFERENCE_VALUE";
  bases: readonly MarketAggregateBasis[];
}>;
export type MarketQueryPolicy = {
  snapshotForOwner(
    actorUserId: string,
  ): Readonly<{
    queryGrants: readonly MarketQueryGrant[];
    aggregateGrants: readonly MarketAggregateGrant[];
  }>;
};
export type MarketBatchUse =
  | { purpose: MarketPurpose }
  | { purpose: "DASHBOARD_AGGREGATE"; basis: MarketAggregateBasis };
export type MarketBatchDependencies = {
  displayPolicy: MarketDisplayPolicy;
  queryPolicy: MarketQueryPolicy;
  registry: ProviderRegistry;
};
export type MarketBatchScope = Readonly<{
  actorUserId: string;
  lifecycle: "ACTIVE" | "ARCHIVED" | "DISPOSED" | "ALL";
}>;
export type MarketBatchContext = {
  tx: SearchReadTransaction;
  scope: MarketBatchScope;
  ownedCandidates: Prisma.Sql;
  checkBudget(): void;
};
/** Structural surface only. Task2 will admit handles through private callback/transaction identity. */
export type PreparedMarketBatch = {
  readonly ctes: Prisma.Sql;
  predicate(leaf: MarketLeaf): Prisma.Sql;
};
export type MarketBatchCode =
  | "MARKET_BATCH_INVALID"
  | "MARKET_BATCH_INVARIANT"
  | "MARKET_BATCH_DEPENDENCY"
  | "MARKET_BATCH_UNAVAILABLE";
export type MarketBatchUnavailableReason =
  | "DISPLAY_DISABLED"
  | "QUERY_RIGHTS_DISABLED"
  | "AGGREGATE_UNSUPPORTED"
  | "MAPPING_AMBIGUOUS"
  | "COVERAGE_LIMIT";
/** Deliberately carries no input, provider exception or cause. */
export class MarketBatchError extends Error {
  constructor(
    readonly code: MarketBatchCode,
    readonly reason?: MarketBatchUnavailableReason,
  ) {
    super(code);
    this.name = "MarketBatchError";
  }
}
