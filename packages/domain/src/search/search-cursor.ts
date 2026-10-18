import { readCursorJson } from "./cursor-json";
import { createHash } from "node:crypto";
import { searchFail, type NormalizedItemSearchQuery } from "@sammlerraum/contracts/item-search";
export type SearchResolutionContext = { smartCollectionId: string; revision: number } | null;
import {
  SearchCursorSchema as schema,
  type SearchCursor,
} from "@sammlerraum/contracts/item-search";
export type { SearchCursor } from "@sammlerraum/contracts/item-search";
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, stable(v)]),
    );
  return value;
}
export function searchContextHash(
  actor: string,
  query: NormalizedItemSearchQuery,
  context: SearchResolutionContext,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        stable([
          "item-search",
          1,
          actor,
          "OWNED",
          1,
          query.text,
          query.filter,
          query.lifecycle,
          "CREATED_DESC_ID_DESC",
          query.limit,
          context,
        ]),
      ),
    )
    .digest("hex");
}
export const encodeSearchCursor = (value: SearchCursor) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
export function decodeSearchCursor(token: string, contextHash: string): SearchCursor {
  try {
    const parsed = schema.safeParse(readCursorJson(token));
    if (
      !parsed.success ||
      parsed.data.contextHash !== contextHash ||
      encodeSearchCursor(parsed.data) !== token
    )
      throw Error();
    return parsed.data;
  } catch {
    return searchFail("SEARCH_INVALID");
  }
}
