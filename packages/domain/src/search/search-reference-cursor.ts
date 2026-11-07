import { createHash } from "node:crypto";
import { ReferenceCursorSchema as schema } from "@sammlerraum/contracts/search-references";
import { searchFail } from "@sammlerraum/contracts/item-search";
import type { ReferenceFamily } from "@sammlerraum/contracts/search-references";
import { readCursorJson } from "./cursor-json";
type ReferenceCursor = { v: 1; contextHash: string; after: string };
export function referenceContextHash(
  actorId: string,
  family: ReferenceFamily,
  parentId: string | null,
  limit: number,
) {
  return createHash("sha256")
    .update(JSON.stringify(["search-references", 1, actorId, family, parentId, "ID_ASC", limit]))
    .digest("hex");
}
export function encodeReferenceCursor(value: ReferenceCursor) {
  return Buffer.from(
    JSON.stringify({ v: 1, contextHash: value.contextHash, after: value.after }),
  ).toString("base64url");
}
export function decodeReferenceCursor(token: string, contextHash: string): string {
  try {
    const parsed = schema.parse(readCursorJson(token));
    if (parsed.contextHash !== contextHash || encodeReferenceCursor(parsed) !== token)
      throw Error();
    return parsed.after;
  } catch {
    return searchFail("SEARCH_INVALID");
  }
}
