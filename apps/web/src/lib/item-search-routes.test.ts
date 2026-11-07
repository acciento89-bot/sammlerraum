import { describe, expect, it } from "vitest";
import { readItemSearchQuery } from "./item-search-routes";
import { SEARCH_MAX_QUERY_BYTES } from "@sammlerraum/contracts/item-search";
describe("encoded item search query boundary", () => {
  it("retains literal question marks in query values", () => {
    expect(readItemSearchQuery(new Request("https://example.invalid/?text=what?now"))).toEqual({
      text: "what?now",
    });
  });
  it("counts the entire encoded query before any percent decoding", () => {
    expect(() =>
      readItemSearchQuery(
        new Request(`https://example.invalid/?text=x?${"a".repeat(SEARCH_MAX_QUERY_BYTES)}`),
      ),
    ).toThrow("Search query is too large");
  });
  it("includes the query marker in the 32KiB encoded budget", () => {
    expect(() =>
      readItemSearchQuery(
        new Request(`https://example.invalid/?text=${"a".repeat(SEARCH_MAX_QUERY_BYTES - 5)}`),
      ),
    ).toThrow("Search query is too large");
  });
  it.each([
    "text=%C0%AF",
    "text=%ED%A0%80",
    "%ZZ=x",
    "text=a&text=b",
    "constructor=x",
    "limit=1e1",
    "limit=1.0",
    "text=x&&limit=1",
  ])("rejects malformed bytes/duplicate/unknown/decimal grammar %s", (q) => {
    expect(() => readItemSearchQuery(new Request(`https://example.invalid/?${q}`))).toThrow(
      "SEARCH_INVALID",
    );
  });
});
