import { Prisma } from "@sammlerraum/db/search-sql";
import {
  ScopedDashboardSchema,
  ScopedManualSummarySchema,
  type ScopedDashboard,
} from "@sammlerraum/contracts/scoped-dashboard";
import { DashboardCountSchema } from "@sammlerraum/contracts/dashboard";
import { parseScopedSearchQuery } from "@sammlerraum/contracts/scoped-search";
import { SEARCH_MAX_RESPONSE_BYTES, searchFail } from "@sammlerraum/contracts/item-search";
import type { MembershipDatabase } from "../collaboration/transfer-transaction";
import {
  withScopedReadContext,
  scopedReadState,
  type ScopedReadContext,
} from "../search/scoped-read-context";
import { withScopedSelection } from "../search/scoped-selection";
import type { BoundedSearchReadTransaction } from "../search/search-read";
import { candidateFrom } from "../search/search-compiler";
import { readPurchaseCost } from "../money/purchase-cost";
import { currencyMinorUnitExponent } from "../money/currencies";

async function manualSummary(
  tx: BoundedSearchReadTransaction,
  owner: string,
  predicate: Prisma.Sql,
) {
  const [row] = await tx.$queryRaw<{ data: unknown }[]>(Prisma.sql`WITH selected AS MATERIALIZED (
    SELECT i.id,i.quantity ${candidateFrom} WHERE ${predicate}
  ), points AS MATERIALIZED (
    SELECT i.id,i.quantity,v.id AS valuation_id,v.currency,v."minorUnitExponent" AS exponent,v."amountMinor" AS amount
    FROM selected i LEFT JOIN LATERAL (SELECT v.id,v.currency,v."minorUnitExponent",v."amountMinor" FROM "Valuation" v WHERE v."itemId"=i.id AND v."ownerId"=${owner} AND v.type='MANUAL' AND v.basis='PER_UNIT' ORDER BY v."observedAt" DESC,v."createdAt" DESC,v.id DESC LIMIT 1) v ON true
  ), groups AS (
    SELECT currency,exponent,sum(amount::numeric*quantity)::text AS total,count(*) AS items,sum(quantity::numeric)::text AS units FROM points WHERE valuation_id IS NOT NULL GROUP BY currency,exponent ORDER BY currency COLLATE pg_catalog."C",exponent LIMIT 257
  ) SELECT jsonb_build_object(
    'state',CASE WHEN count(*)=0 THEN 'EMPTY' WHEN count(valuation_id)=0 THEN 'NO_ESTIMATES' WHEN count(valuation_id)<count(*) THEN 'PARTIAL' ELSE 'COMPLETE' END,
    'quantityBasis','CURRENT_QUANTITY',
    'contributors',jsonb_build_object('itemCount',count(valuation_id),'unitCount',coalesce(sum(quantity::numeric) FILTER(WHERE valuation_id IS NOT NULL),0)::text),
    'missing',jsonb_build_object('itemCount',count(*)-count(valuation_id),'unitCount',coalesce(sum(quantity::numeric) FILTER(WHERE valuation_id IS NULL),0)::text),
    'groups',coalesce((SELECT jsonb_agg(jsonb_build_object('currency',currency,'minorUnitExponent',exponent,'totalMinor',total,'contributors',jsonb_build_object('itemCount',items,'unitCount',units)) ORDER BY currency COLLATE pg_catalog."C",exponent) FROM groups),'[]'::jsonb)
  ) AS data FROM points`);
  if (
    row &&
    typeof row.data === "object" &&
    row.data &&
    "groups" in row.data &&
    Array.isArray(row.data.groups) &&
    row.data.groups.length > 256
  )
    return searchFail("SEARCH_UNAVAILABLE");
  const result = ScopedManualSummarySchema.safeParse(row?.data);
  if (!result.success) return searchFail("SEARCH_INVARIANT");
  for (const group of result.data.groups) {
    try {
      if (currencyMinorUnitExponent(group.currency) !== group.minorUnitExponent)
        return searchFail("SEARCH_INVARIANT");
    } catch {
      return searchFail("SEARCH_INVARIANT");
    }
  }
  return result.data;
}
export async function executeScopedDashboard(
  context: ScopedReadContext,
  input: unknown,
  canonicalMoneyEnabled = false,
): Promise<ScopedDashboard> {
  const query = parseScopedSearchQuery(input);
  if (query.cursor || query.limit !== 20) return searchFail("SEARCH_INVALID");
  const state = scopedReadState(context);
  return withScopedSelection(context, query, canonicalMoneyEnabled, async (selection) => {
    const tx: BoundedSearchReadTransaction = {
      checkBudget: state.tx.checkBudget,
      $queryRaw: <R>(sql: Prisma.Sql) =>
        state.tx.$queryRaw<R>(
          Prisma.sql`${selection.prefix} SELECT * FROM (${sql}) AS scoped_dashboard_result`,
        ),
    };
    const [counts] = await tx.$queryRaw<{ itemCount: bigint; unitCount: string }[]>(
      Prisma.sql`SELECT count(*) AS "itemCount",coalesce(sum(i.quantity::numeric),0)::text AS "unitCount" ${candidateFrom} WHERE ${selection.predicate}`,
    );
    if (!counts || counts.itemCount < 0n || counts.itemCount > BigInt(Number.MAX_SAFE_INTEGER))
      return searchFail("SEARCH_INVARIANT");
    const countResult = DashboardCountSchema.safeParse({
      itemCount: Number(counts.itemCount),
      unitCount: counts.unitCount,
    });
    if (!countResult.success) return searchFail("SEARCH_INVARIANT");
    const canReadValues = state.mode === "OWNER_COLLECTION" || state.permissions?.values === true;
    const values: ScopedDashboard["values"] = canReadValues
      ? {
          state: "AVAILABLE",
          purchase: canonicalMoneyEnabled
            ? await readPurchaseCost(
                tx,
                { ownerId: state.ownerUserId, predicate: selection.outerPredicate },
                selection.predicate,
              )
            : {
                state: "UNAVAILABLE",
                reason: "LEGACY_MONEY_INTERPRETATION_UNAVAILABLE",
                groups: null,
              },
          manual: await manualSummary(tx, state.ownerUserId, selection.predicate),
        }
      : { state: "UNAVAILABLE", purchase: null, manual: null };
    const trade =
      state.mode === "SHARE"
        ? null
        : await tx.$queryRaw<{ tradeStatus: string; itemCount: number; unitCount: string }[]>(
            Prisma.sql`SELECT i."tradeStatus"::text AS "tradeStatus",count(*)::integer AS "itemCount",sum(i.quantity::numeric)::text AS "unitCount" ${candidateFrom} WHERE ${selection.predicate} GROUP BY i."tradeStatus" ORDER BY i."tradeStatus"::text COLLATE pg_catalog."C"`,
          );
    const result = ScopedDashboardSchema.safeParse({
      version: 1,
      scope: state.mode,
      lifecycle: query.lifecycle,
      readAt: selection.readAt,
      selection: countResult.data,
      values,
      trade,
      privatePairs: null,
      wishlist: null,
      market: null,
    });
    if (
      !result.success ||
      Buffer.byteLength(JSON.stringify(result.data)) > SEARCH_MAX_RESPONSE_BYTES
    )
      return searchFail("SEARCH_INVARIANT");
    return result.data;
  });
}
export function createScopedDashboardService(
  database: MembershipDatabase,
  options: { canonicalMoneyEnabled?: boolean } = {},
) {
  return {
    async get(actor: { userId: string } | null, target: unknown, input: unknown) {
      return withScopedReadContext(database, actor, target, (context) =>
        executeScopedDashboard(context, input, options.canonicalMoneyEnabled === true),
      );
    },
  };
}
