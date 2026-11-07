import { Prisma } from "@sammlerraum/db/search-sql";
import {
  MarketReferenceTotalSchema,
  type MarketReferenceTotal,
} from "@sammlerraum/contracts/dashboard";
import { isReadDependencyFailure } from "../api/read-dependency-errors";
import { marketSelectorKey } from "./market-query-policy";
import {
  marketBatchForUse,
  MarketBatchError,
  type MarketBatchContext,
  type PreparedMarketBatch,
  type MarketSelector,
  type MarketAggregateBasis,
} from "./market-batch";
const invariant = (): never => {
  throw new MarketBatchError("MARKET_BATCH_INVARIANT");
};
/** Numeric arithmetic over the exact prepared outer scope. No implicit additive rights or FX. */
export async function aggregateMarketBatch(
  context: MarketBatchContext,
  batch: PreparedMarketBatch,
  selectors: readonly MarketSelector[],
  basis: MarketAggregateBasis,
): Promise<readonly MarketReferenceTotal[]> {
  context.checkBudget();
  const state = marketBatchForUse(context, batch, { purpose: "DASHBOARD_AGGREGATE", basis });
  if (!Array.isArray(selectors) || !selectors.length || selectors.length > 50) return invariant();
  const requested = [...new Map(selectors.map((s) => [marketSelectorKey(s), s])).values()];
  if (
    requested.length !== state.selectors.length ||
    requested.some((s, n) => marketSelectorKey(s) !== marketSelectorKey(state.selectors[n]!))
  )
    return invariant();
  const weight =
    basis === "CURRENT_QUANTITY" ? Prisma.sql`quantity::numeric` : Prisma.sql`1::numeric`;
  type Row = {
    selectorOrdinal: number;
    candidateItemCount: string;
    contributingItemCount: string;
    contributedQuantity: string;
    amountMinor: string | null;
    lowMinor: string | null;
    highMinor: string | null;
    observedAtFrom: Date | null;
    observedAtTo: Date | null;
  };
  let rows: Row[];
  try {
    rows = await context.tx.$queryRaw<Row[]>(
      Prisma.sql`/* market:aggregate */ WITH ${state.ctes},market_totals AS (SELECT "selectorOrdinal",count(*)::text AS "contributingItemCount",sum(quantity::numeric)::text AS "contributedQuantity",sum("amountMinor"::numeric*${weight})::text AS "amountMinor",sum("lowMinor"::numeric*${weight})::text AS "lowMinor",sum("highMinor"::numeric*${weight})::text AS "highMinor",min("observedAt") AS "observedAtFrom",max("observedAt") AS "observedAtTo" FROM market_latest GROUP BY "selectorOrdinal") SELECT s."selectorOrdinal",c.count AS "candidateItemCount",coalesce(t."contributingItemCount",'0') AS "contributingItemCount",coalesce(t."contributedQuantity",'0') AS "contributedQuantity",t."amountMinor",t."lowMinor",t."highMinor",t."observedAtFrom",t."observedAtTo" FROM market_selectors s CROSS JOIN (SELECT count(*)::text AS count FROM market_candidates) c LEFT JOIN market_totals t USING("selectorOrdinal") ORDER BY s."selectorOrdinal"`,
    );
  } catch (error) {
    if (isReadDependencyFailure(error)) throw new MarketBatchError("MARKET_BATCH_DEPENDENCY");
    throw error;
  }
  context.checkBudget();
  marketBatchForUse(context, batch, { purpose: "DASHBOARD_AGGREGATE", basis });
  if (!Array.isArray(rows) || rows.length !== state.selectors.length) return invariant();
  return rows.map((row, n) => {
    context.checkBudget();
    if (
      row.selectorOrdinal !== n ||
      typeof row.candidateItemCount !== "string" ||
      !/^(?:0|[1-9][0-9]{0,18})$/u.test(row.candidateItemCount) ||
      typeof row.contributingItemCount !== "string" ||
      !/^(?:0|[1-9][0-9]{0,18})$/u.test(row.contributingItemCount)
    )
      return invariant();
    const missing = BigInt(row.candidateItemCount) - BigInt(row.contributingItemCount),
      empty = row.contributingItemCount === "0",
      selector = state.selectors[n]!;
    if (empty && [row.amountMinor, row.lowMinor, row.highMinor].some((v) => v !== null))
      return invariant();
    const date = (value: Date | null) => {
      if (value === null) return null;
      if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return invariant();
      return value.toISOString();
    };
    if (
      selector.kind === "PRICE_RANGE"
        ? row.amountMinor !== null
        : row.lowMinor !== null || row.highMinor !== null
    )
      return invariant();
    const result = MarketReferenceTotalSchema.safeParse({
      selector,
      semantics: "ADDITIVE_PER_UNIT_REFERENCE_VALUE",
      basis,
      coverage: empty ? "EMPTY" : missing === 0n ? "COMPLETE" : "PARTIAL",
      candidateItemCount: row.candidateItemCount,
      contributingItemCount: row.contributingItemCount,
      missingItemCount: missing.toString(),
      contributedQuantity: row.contributedQuantity,
      observedAtFrom: date(row.observedAtFrom),
      observedAtTo: date(row.observedAtTo),
      total: empty
        ? null
        : selector.kind === "PRICE_RANGE"
          ? { type: "RANGE", lowMinor: row.lowMinor, highMinor: row.highMinor }
          : { type: "POINT", amountMinor: row.amountMinor },
    });
    context.checkBudget();
    if (!result.success) return invariant();
    return result.data;
  });
}
