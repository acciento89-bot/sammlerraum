import { Prisma } from "@sammlerraum/db/search-sql";
import {
  parseItemSearchQuery,
  ItemSearchPageSchema,
  SEARCH_MAX_RESPONSE_BYTES,
  searchFail,
  type NormalizedItemSearchQuery,
  type ItemSummary,
  type SearchPage,
} from "@sammlerraum/contracts/item-search";
import { validateCurrentFilterAvailability } from "./filter-ast";
import { TRUE, candidateFrom } from "./search-compiler";
import { prepareItemSelection } from "./search-selection";
import {
  searchContextHash,
  decodeSearchCursor,
  encodeSearchCursor,
  type SearchResolutionContext,
} from "./search-cursor";
import {
  runSearchRead,
  type SearchDatabase,
  type BoundedSearchReadTransaction,
} from "./search-read";
export { ItemSearchError } from "@sammlerraum/contracts/item-search";
export type {
  SearchDatabase,
  SearchReadTransaction,
  BoundedSearchReadTransaction,
} from "./search-read";
export { runSearchRead } from "./search-read";
export type SearchActor = { userId: string };
type Row = Omit<ItemSummary, "createdAt" | "updatedAt" | "archivedAt" | "disposedAt"> & {
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  disposedAt: Date | null;
};
export function checkedSearchTotal(value: bigint): number {
  if (typeof value !== "bigint" || value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
    return searchFail("SEARCH_INVARIANT");
  return Number(value);
}
/** Internal composition seam: callers load an owned saved query in this bounded tx,
 * then pass its trusted id/revision. Public query parsing never accepts this context. */
export async function executeItemSearch(
  tx: BoundedSearchReadTransaction,
  actor: SearchActor,
  query: NormalizedItemSearchQuery,
  context: SearchResolutionContext = null,
): Promise<SearchPage<ItemSummary>> {
  if (!actor || typeof actor.userId !== "string" || !actor.userId || actor.userId.includes("\0"))
    return searchFail("SEARCH_INVALID");
  if (query.filter) validateCurrentFilterAvailability(query.filter);
  const hash = searchContextHash(actor.userId, query, context);
  const cursor = query.cursor ? decodeSearchCursor(query.cursor, hash) : null;
  const { readAt, matchedPredicate: predicate } = await prepareItemSelection(tx, actor, query);
  const [count] = await tx.$queryRaw<{ total: bigint }[]>(
    Prisma.sql`SELECT count(*) AS total ${candidateFrom} WHERE ${predicate}`,
  );
  const total = checkedSearchTotal(count!.total);
  const after = cursor
    ? Prisma.sql`(i."createdAt",i.id)<(${cursor.after.createdAt}::timestamp,${cursor.after.id}::uuid)`
    : TRUE;
  const rows = await tx.$queryRaw<Row[]>(
    Prisma.sql`SELECT i.id,i.title,i."collectionId",i."categoryTemplateId",i."conditionOptionId",i.quantity,i.visibility,i."tradeStatus",i."archivedAt",i."disposedAt",i."createdAt",i."updatedAt" ${candidateFrom} WHERE ${predicate} AND ${after} ORDER BY i."createdAt" DESC,i.id DESC LIMIT ${query.limit + 1}`,
  );
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  const result = ItemSearchPageSchema.safeParse({
    items: page.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      archivedAt: row.archivedAt?.toISOString() ?? null,
      disposedAt: row.disposedAt?.toISOString() ?? null,
    })),
    total,
    nextCursor:
      rows.length > query.limit && last
        ? encodeSearchCursor({
            v: 1,
            contextHash: hash,
            after: { createdAt: last.createdAt.toISOString(), id: last.id },
          })
        : null,
    scope: "OWNED",
    lifecycle: query.lifecycle,
    readAt,
  });
  if (!result.success || Buffer.byteLength(JSON.stringify(result.data)) > SEARCH_MAX_RESPONSE_BYTES)
    return searchFail("SEARCH_INVARIANT");
  return result.data;
}
export function createItemSearchService(database: SearchDatabase) {
  return {
    searchItems: async (actor: SearchActor, input: unknown): Promise<SearchPage<ItemSummary>> => {
      if (
        !actor ||
        typeof actor.userId !== "string" ||
        !actor.userId ||
        actor.userId.includes("\0")
      )
        return searchFail("SEARCH_INVALID");
      const query = parseItemSearchQuery(input);
      if (query.filter) validateCurrentFilterAvailability(query.filter);
      // Reject replay and syntax before acquiring a database connection.
      if (query.cursor)
        decodeSearchCursor(query.cursor, searchContextHash(actor.userId, query, null));
      return runSearchRead(database, (tx) => executeItemSearch(tx, actor, query));
    },
  };
}
