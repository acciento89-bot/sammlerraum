import { createHash } from "node:crypto";
import { Prisma } from "@sammlerraum/db/search-sql";
import {
  parseScopedSearchQuery,
  ScopedSearchPageSchema,
  type ScopedSearchPage,
} from "@sammlerraum/contracts/scoped-search";
import {
  SEARCH_MAX_RESPONSE_BYTES,
  searchFail,
  type NormalizedItemSearchQuery,
} from "@sammlerraum/contracts/item-search";
import type { MembershipDatabase } from "../collaboration/transfer-transaction";
import {
  withScopedReadContext,
  scopedReadState,
  type ScopedReadContext,
} from "./scoped-read-context";
import { withScopedSelection, scopedSearchCapabilities } from "./scoped-selection";
import { decodeReferenceCursor, encodeReferenceCursor } from "./search-reference-cursor";
import { candidateFrom, TRUE } from "./search-compiler";
import { checkedSearchTotal } from "./item-search-service";

export async function executeScopedSearch(
  context: ScopedReadContext,
  query: NormalizedItemSearchQuery,
  canonicalMoneyEnabled = false,
  savedBinding: string | null = null,
): Promise<ScopedSearchPage> {
  const state = scopedReadState(context);
  return withScopedSelection(context, query, canonicalMoneyEnabled, async (selection) => {
    const { cursor: _cursor, ...normalized } = query;
    const hash = createHash("sha256")
      .update(
        JSON.stringify([
          "scoped-search",
          1,
          state.actorUserId,
          state.reference,
          state.mode,
          state.permissions,
          normalized,
          canonicalMoneyEnabled,
          savedBinding,
          "ID_ASC",
        ]),
      )
      .digest("hex");
    const after = query.cursor ? decodeReferenceCursor(query.cursor, hash) : null;
    const [count] = await state.tx.$queryRaw<{ total: bigint }[]>(
      Prisma.sql`${selection.prefix} SELECT count(*) AS total ${candidateFrom} WHERE ${selection.predicate}`,
    );
    const rows = await state.tx.$queryRaw<{ id: string; title: string; quantity: number }[]>(
      Prisma.sql`${selection.prefix} SELECT i.id,i.title,i.quantity ${candidateFrom} WHERE ${selection.predicate} AND ${after ? Prisma.sql`i.id>${after}::uuid` : TRUE} ORDER BY i.id LIMIT ${query.limit + 1}`,
    );
    const page = rows.slice(0, query.limit),
      last = page.at(-1);
    const parsed = ScopedSearchPageSchema.safeParse({
      items: page,
      total: checkedSearchTotal(count!.total),
      nextCursor:
        rows.length > query.limit && last
          ? encodeReferenceCursor({ v: 1, contextHash: hash, after: last.id })
          : null,
      scope: state.mode,
      lifecycle: query.lifecycle,
      readAt: selection.readAt,
    });
    if (
      !parsed.success ||
      Buffer.byteLength(JSON.stringify(parsed.data)) > SEARCH_MAX_RESPONSE_BYTES
    )
      return searchFail("SEARCH_INVARIANT");
    return parsed.data;
  });
}
export function createScopedSearchService(
  database: MembershipDatabase,
  options: { canonicalMoneyEnabled?: boolean } = {},
) {
  return {
    async capabilities(actor: { userId: string } | null, target: unknown) {
      return withScopedReadContext(database, actor, target, async (context) =>
        scopedSearchCapabilities(context, options.canonicalMoneyEnabled === true),
      );
    },
    async search(actor: { userId: string } | null, target: unknown, input: unknown) {
      const query = parseScopedSearchQuery(input);
      return withScopedReadContext(database, actor, target, (context) =>
        executeScopedSearch(context, query, options.canonicalMoneyEnabled === true),
      );
    },
  };
}
