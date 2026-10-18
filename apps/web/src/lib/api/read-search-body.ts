import { ApiError } from "@sammlerraum/contracts/errors";
import { searchFail } from "@sammlerraum/contracts/item-search";
import { PRIVATE_SEARCH_MAX_BODY_BYTES } from "@sammlerraum/contracts/private-search-query";
import { readBoundedBody } from "./read-bounded-body";

type Shape = "ITEM_QUERY" | "DASHBOARD_QUERY";
const keys: Record<Shape, readonly string[]> = {
  ITEM_QUERY: ["text", "f", "lifecycle", "limit", "cursor"],
  DASHBOARD_QUERY: ["text", "f", "lifecycle"],
};
/** Fixed scalar envelope only. JSON.parse owns syntax; quoted values stay opaque. */
function precheck(raw: string, shape: Shape): void {
  const text = raw.replace(/^[\t\n\r ]+|[\t\n\r ]+$/gu, "");
  if (!text.startsWith("{") || !text.endsWith("}")) searchFail("SEARCH_INVALID");
  const seen = new Set<string>();
  let keyExpected = true;
  for (let i = 1; i < text.length - 1; i++) {
    const char = text[i];
    if (char === '"') {
      const start = i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === "\\") i++;
        i++;
      }
      if (i >= text.length - 1) searchFail("SEARCH_INVALID");
      if (keyExpected) {
        const key: unknown = JSON.parse(text.slice(start, i + 1));
        if (typeof key !== "string" || !keys[shape].includes(key) || seen.has(key))
          searchFail("SEARCH_INVALID");
        seen.add(key);
        keyExpected = false;
      }
    } else if (char === "{" || char === "}" || char === "[" || char === "]") {
      searchFail("SEARCH_INVALID");
    } else if (char === ",") keyExpected = true;
  }
}
export async function readSearchBody(request: Request, shape: Shape): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get("content-type") ?? ""))
    return searchFail("SEARCH_INVALID");
  try {
    const bytes = await readBoundedBody(request, PRIVATE_SEARCH_MAX_BODY_BYTES);
    // TextDecoder normally consumes this BOM silently; reject it before decoding.
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) searchFail("SEARCH_INVALID");
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    precheck(raw, shape);
    return JSON.parse(raw) as unknown;
  } catch (error) {
    if (error instanceof ApiError && error.status === 413) throw error;
    return searchFail("SEARCH_INVALID");
  }
}
