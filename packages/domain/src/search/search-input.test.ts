import { describe, expect, it } from "vitest";
import { parseItemSearchQuery } from "@sammlerraum/contracts/item-search";
import { decodeSearchCursor, encodeSearchCursor, searchContextHash } from "./search-cursor";

describe("strict owned search input and cursor", () => {
  it("normalizes bounded text and keeps explicit null filter", () => {
    expect(parseItemSearchQuery({ text: "  Ａ  ", filter: null })).toEqual({
      text: "A",
      filter: null,
      lifecycle: "ACTIVE",
      limit: 20,
    });
  });
  it.each([
    { ownerId: "foreign" },
    { scope: "PUBLIC" },
    { sort: "title" },
    { limit: "2" },
    { limit: 0 },
    { limit: 51 },
    { text: "x".repeat(201) },
    { text: "\ud800" },
    { text: "\0" },
    { text: "ﷺ".repeat(200) },
  ])("rejects invalid query %# without payload", (input) => {
    expect(() => parseItemSearchQuery(input)).toThrow("SEARCH_INVALID");
  });
  it("binds canonical cursor to actor, filter, lifecycle, size and saved revision", () => {
    const query = parseItemSearchQuery({});
    const hash = searchContextHash("a", query, null);
    const cursor = {
      v: 1 as const,
      contextHash: hash,
      after: { createdAt: "2026-01-01T00:00:00.000Z", id: "00000000-0000-4000-8000-000000000001" },
    };
    const token = encodeSearchCursor(cursor);
    expect(decodeSearchCursor(token, hash)).toEqual(cursor);
    for (const next of [
      searchContextHash("b", query, null),
      searchContextHash("a", { ...query, text: "x" }, null),
      searchContextHash("a", { ...query, lifecycle: "ALL" }, null),
      searchContextHash("a", { ...query, limit: 1 }, null),
      searchContextHash("a", query, { smartCollectionId: cursor.after.id, revision: 1 }),
    ])
      expect(() => decodeSearchCursor(token, next)).toThrow("SEARCH_INVALID");
    for (const invalid of [
      token + "=",
      "_w",
      Buffer.from(JSON.stringify({ ...cursor, extra: 1 })).toString("base64url"),
      Buffer.from(JSON.stringify(cursor, null, 2)).toString("base64url"),
    ])
      expect(() => decodeSearchCursor(invalid, hash)).toThrow("SEARCH_INVALID");
  });
});
