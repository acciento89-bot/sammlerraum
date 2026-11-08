import { BillingError } from "@sammlerraum/contracts/billing";
import { assertReadFeatureInTransaction } from "../billing/admission";
import type { ItemFilterNode } from "@sammlerraum/contracts/search";
import { ProviderRegistry } from "@sammlerraum/market-data/provider-registry";
import { emptyMarketDisplayPolicy } from "../valuations/market-display-policy";
import { emptyMarketQueryPolicy, marketBatchFilterError } from "../market-data/market-query-policy";
import {
  withMarketBatch,
  MarketBatchError,
  type MarketBatchDependencies,
  type PreparedMarketBatch,
} from "../market-data/market-batch";
export const disabledSearchMarket: MarketBatchDependencies = Object.freeze({
  registry: new ProviderRegistry([]),
  displayPolicy: emptyMarketDisplayPolicy,
  queryPolicy: emptyMarketQueryPolicy,
});
import { prepareLegacyMoneyPredicates } from "./legacy-money-query";
import { Prisma } from "@sammlerraum/db/search-sql";
import { searchFail, type NormalizedItemSearchQuery } from "@sammlerraum/contracts/item-search";
import { validateCurrentFilterAvailability } from "./filter-ast";
import {
  and,
  or,
  TRUE,
  candidateFrom,
  ownedCandidates,
  compileFilter,
  leaves,
  referencePredicate,
  invalidFacts,
} from "./search-compiler";
import { validateRetainedUrls } from "./search-url-integrity";
import { compileBroadText, invalidBroadFacts } from "./search-text";
import type { BoundedSearchReadTransaction } from "./search-read";
/** Free collection/category/tag/duplicate/lifecycle facets remain core search. */
function advancedFilter(node: ItemFilterNode): boolean {
  if (node.kind === "and") return node.children.some(advancedFilter);
  if (node.kind === "or" || node.kind === "not") return true;
  return ![
    "collection",
    "category",
    "tags",
    "duplicate",
    "tradeStatus",
    "visibility",
    "media",
  ].includes(node.kind);
}
export async function assertFilterEntitlement(
  tx: BoundedSearchReadTransaction,
  subjectId: string,
  filter: { root: ItemFilterNode } | null | undefined,
) {
  if (filter && advancedFilter(filter.root))
    await assertReadFeatureInTransaction(tx, subjectId, "ADVANCED_FILTERS");
}
/** Internal worker hint: authority is re-read from an exact owner/request-bound durable job. */
export type ArtifactFilterAdmission = {
  kind: "TABULAR" | "REPORT";
  jobId: string;
  request: unknown;
};
async function verifyArtifactAdmission(
  tx: BoundedSearchReadTransaction,
  ownerId: string,
  admission: ArtifactFilterAdmission,
  query: Pick<NormalizedItemSearchQuery, "text" | "filter" | "lifecycle">,
) {
  if (!["TABULAR", "REPORT"].includes(admission.kind) || !/^[0-9a-f-]{36}$/u.test(admission.jobId))
    throw new BillingError("BILLING_INVALID_REQUEST");
  const table = Prisma.raw(admission.kind === "TABULAR" ? '"ExportJob"' : '"ReportJob"');
  const [job] = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id FROM ${table} WHERE id=${admission.jobId}::uuid AND "ownerId"=${ownerId} AND "billingAdmitted" AND request=${JSON.stringify(admission.request)}::jsonb AND request->'query'=${JSON.stringify(query)}::jsonb AND status IN ('PENDING','BUILDING','READY') AND "expiresAt">CURRENT_TIMESTAMP`,
  );
  if (!job) throw new BillingError("PREMIUM_REQUIRED");
}
/** Internal SQL selection in the caller's bounded snapshot; never a persisted permission. */
async function prepareSelection(
  tx: BoundedSearchReadTransaction,
  actor: { userId: string },
  query: Pick<NormalizedItemSearchQuery, "text" | "filter" | "lifecycle">,
  canonicalMoneyEnabled = false,
  trustedOuterRestriction?: { predicate: Prisma.Sql },
  market?: PreparedMarketBatch,
  admission?: ArtifactFilterAdmission,
) {
  if (!actor || typeof actor.userId !== "string" || !actor.userId || actor.userId.includes("\0"))
    return searchFail("SEARCH_INVALID");
  if (query.filter)
    validateCurrentFilterAvailability(query.filter, canonicalMoneyEnabled, !!market);
  if (admission) await verifyArtifactAdmission(tx, actor.userId, admission, query);
  else await assertFilterEntitlement(tx, actor.userId, query.filter);
  const [clock] = await tx.$queryRaw<{ now: Date; collation: boolean }[]>(
    Prisma.sql`SELECT date_trunc('milliseconds',transaction_timestamp()) AS now,EXISTS(SELECT 1 FROM pg_collation WHERE collname='und-x-icu' AND collprovider='i' AND collisdeterministic AND collnamespace='pg_catalog'::regnamespace) AS collation`,
  );
  if (!clock?.collation) return searchFail("SEARCH_UNAVAILABLE");
  const nodes = leaves(query.filter?.root ?? null);
  const [refs] = await tx.$queryRaw<{ valid: boolean }[]>(
    Prisma.sql`SELECT ${referencePredicate(nodes, actor.userId)} AS valid`,
  );
  if (!refs?.valid) return searchFail("FILTER_REFERENCE_INVALID");
  const owned = ownedCandidates(actor.userId, query.lifecycle);
  const outer = trustedOuterRestriction ? and([owned, trustedOuterRestriction.predicate]) : owned;
  const [integrity] = await tx.$queryRaw<{ invalid: boolean }[]>(
    Prisma.sql`SELECT EXISTS(SELECT 1 ${candidateFrom} WHERE ${outer} AND ${or([invalidFacts(nodes), query.text ? invalidBroadFacts : Prisma.sql`FALSE`])}) AS invalid`,
  );
  if (integrity?.invalid) return searchFail("SEARCH_INVARIANT");
  await validateRetainedUrls(tx, nodes, outer);
  const money = canonicalMoneyEnabled
    ? await prepareLegacyMoneyPredicates(
        tx,
        { ownerId: actor.userId, predicate: outer },
        query.filter,
      )
    : undefined;
  const predicate = and([
    outer,
    query.filter ? compileFilter(query.filter.root, actor.userId, money, market) : TRUE,
    query.text ? compileBroadText(query.text, actor.userId) : TRUE,
  ]);
  return {
    readAt: clock.now.toISOString(),
    candidateFrom,
    outerPredicate: outer,
    matchedPredicate: predicate,
  };
}

/** Existing non-market consumers retain their closed producer-gap checks. */
export const prepareItemSelection = (
  tx: BoundedSearchReadTransaction,
  actor: { userId: string },
  query: Pick<NormalizedItemSearchQuery, "text" | "filter" | "lifecycle">,
  canonicalMoneyEnabled = false,
  trustedOuterRestriction?: { predicate: Prisma.Sql },
  admission?: ArtifactFilterAdmission,
) =>
  prepareSelection(
    tx,
    actor,
    query,
    canonicalMoneyEnabled,
    trustedOuterRestriction,
    undefined,
    admission,
  );
type Selection = Awaited<ReturnType<typeof prepareSelection>> & { prefix: Prisma.Sql };
/** All executable market fragments are consumed before the private scoped handle expires. */
export async function withItemSelection<T>(
  tx: BoundedSearchReadTransaction,
  actor: { userId: string },
  query: Pick<NormalizedItemSearchQuery, "text" | "filter" | "lifecycle">,
  canonicalMoneyEnabled: boolean,
  dependencies: MarketBatchDependencies,
  consume: (selection: Selection) => Promise<T>,
  trustedOuterRestriction?: { predicate: Prisma.Sql },
): Promise<T> {
  if (query.filter) validateCurrentFilterAvailability(query.filter, canonicalMoneyEnabled, true);
  const selectors = leaves(query.filter?.root ?? null).flatMap((n) =>
    n.kind === "marketMoney" ? [n.selector] : [],
  );
  if (!selectors.length)
    return consume({
      ...(await prepareSelection(tx, actor, query, canonicalMoneyEnabled, trustedOuterRestriction)),
      prefix: Prisma.empty,
    });
  const owned = ownedCandidates(actor.userId, query.lifecycle);
  const outer = trustedOuterRestriction ? and([owned, trustedOuterRestriction.predicate]) : owned;
  try {
    return await withMarketBatch(
      {
        tx,
        scope: { actorUserId: actor.userId, lifecycle: query.lifecycle },
        ownedCandidates: Prisma.sql`SELECT i.id,i.quantity,i."catalogEntryId",i."catalogVariantId" ${candidateFrom} WHERE ${outer}`,
        checkBudget: tx.checkBudget,
      },
      selectors,
      { purpose: "FILTER" },
      dependencies,
      async (batch) =>
        consume({
          ...(await prepareSelection(
            tx,
            actor,
            query,
            canonicalMoneyEnabled,
            trustedOuterRestriction,
            batch,
          )),
          prefix: Prisma.sql`WITH ${batch.ctes} `,
        }),
    );
  } catch (error) {
    const unavailable = marketBatchFilterError(error);
    if (unavailable) throw unavailable;
    if (error instanceof MarketBatchError)
      return searchFail(
        error.code === "MARKET_BATCH_DEPENDENCY" ? "SEARCH_UNAVAILABLE" : "SEARCH_INVARIANT",
      );
    throw error;
  }
}
