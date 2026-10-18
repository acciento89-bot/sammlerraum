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
/** Internal SQL selection in the caller's bounded snapshot; never a persisted permission. */
export async function prepareItemSelection(
  tx: BoundedSearchReadTransaction,
  actor: { userId: string },
  query: Pick<NormalizedItemSearchQuery, "text" | "filter" | "lifecycle">,
) {
  if (!actor || typeof actor.userId !== "string" || !actor.userId || actor.userId.includes("\0"))
    return searchFail("SEARCH_INVALID");
  if (query.filter) validateCurrentFilterAvailability(query.filter);
  const [clock] = await tx.$queryRaw<{ now: Date; collation: boolean }[]>(
    Prisma.sql`SELECT date_trunc('milliseconds',transaction_timestamp()) AS now,EXISTS(SELECT 1 FROM pg_collation WHERE collname='und-x-icu' AND collprovider='i' AND collisdeterministic AND collnamespace='pg_catalog'::regnamespace) AS collation`,
  );
  if (!clock?.collation) return searchFail("SEARCH_UNAVAILABLE");
  const nodes = leaves(query.filter?.root ?? null);
  const [refs] = await tx.$queryRaw<{ valid: boolean }[]>(
    Prisma.sql`SELECT ${referencePredicate(nodes, actor.userId)} AS valid`,
  );
  if (!refs?.valid) return searchFail("FILTER_REFERENCE_INVALID");
  const outer = ownedCandidates(actor.userId, query.lifecycle);
  const [integrity] = await tx.$queryRaw<{ invalid: boolean }[]>(
    Prisma.sql`SELECT EXISTS(SELECT 1 ${candidateFrom} WHERE ${outer} AND ${or([invalidFacts(nodes), query.text ? invalidBroadFacts : Prisma.sql`FALSE`])}) AS invalid`,
  );
  if (integrity?.invalid) return searchFail("SEARCH_INVARIANT");
  await validateRetainedUrls(tx, nodes, outer);
  const predicate = and([
    outer,
    query.filter ? compileFilter(query.filter.root, actor.userId) : TRUE,
    query.text ? compileBroadText(query.text, actor.userId) : TRUE,
  ]);
  return {
    readAt: clock.now.toISOString(),
    candidateFrom,
    outerPredicate: outer,
    matchedPredicate: predicate,
  };
}
