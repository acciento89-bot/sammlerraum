import { describe, expect, it } from "vitest";
import {
  parsePrivateItemSearchWire as item,
  parsePrivateDashboardWire as dashboard,
} from "./private-search-query";
const f = (root: object) => JSON.stringify({ version: 1, root });
const leaf = { kind: "duplicate", value: true };

describe("private query wire contracts", () => {
  it("applies existing text/filter/lifecycle defaults without dashboard pagination", () => {
    expect(item({})).toEqual({ text: "", filter: null, lifecycle: "ACTIVE", limit: 20 });
    expect(dashboard({ f: null, text: " Ｗatch " })).toEqual({
      text: "Watch",
      filter: null,
      lifecycle: "ACTIVE",
    });
    expect(item({ lifecycle: "ALL", limit: 50, cursor: "abc_DEF-123" })).toMatchObject({
      lifecycle: "ALL",
      limit: 50,
      cursor: "abc_DEF-123",
    });
  });
  it.each([
    null,
    [],
    2,
    { ownerId: "private" },
    { scope: "OWNED" },
    { context: {} },
    { filter: leaf },
    { f: leaf },
    { f: [] },
    { text: null },
    { lifecycle: "active" },
    { cursor: "" },
    { cursor: "a=" },
    { cursor: "a".repeat(2049) },
    { limit: "20" },
    { limit: 0 },
    { limit: 51 },
    { limit: 1.5 },
    { limit: Number.MAX_SAFE_INTEGER + 1 },
    JSON.parse('{"__proto__":null}'),
    { constructor: "private" },
  ])("rejects invalid/override item envelopes", (input) => {
    expect(() => item(input)).toThrow("SEARCH_INVALID");
  });
  it.each([{ limit: 20 }, { cursor: "abc" }, { filter: null }, { owner: "private" }])(
    "rejects dashboard pagination and overrides",
    (input) => {
      expect(() => dashboard(input)).toThrow("SEARCH_INVALID");
    },
  );
  it.each([
    "",
    "null",
    '{"version":1,"version":1,"root":{"kind":"duplicate","value":true}}',
    '{"version":1,"root":{"kind":"duplicate","value":true,"val\\u0075e":false}}',
  ])("preserves invalid raw-filter errors", (raw) => {
    for (const parse of [item, dashboard])
      expect(() => parse({ f: raw })).toThrow("FILTER_INVALID");
  });
  it("passes raw f intact at 10001 and 16384 characters, enforcing raw and canonical caps", () => {
    const raw = f(leaf);
    for (const length of [10001, 16384]) {
      expect(item({ f: raw.padEnd(length, " ") }).filter).toEqual({ version: 1, root: leaf });
      expect(dashboard({ f: raw.padEnd(length, " ") }).filter).toEqual({ version: 1, root: leaf });
    }
    expect(() => item({ f: raw.padEnd(16385, " ") })).toThrow("FILTER_TOO_COMPLEX");
    const expanded = f({
      kind: "tags",
      test: { op: "hasAny", values: Array.from({ length: 50 }, (_, i) => `${i}${"ﷺ".repeat(10)}`) },
    });
    expect(new TextEncoder().encode(expanded).length).toBeLessThan(16384);
    expect(() => item({ f: expanded })).toThrow("FILTER_TOO_COMPLEX");
  });
  it("uses existing text limits before and after normalization", () => {
    expect(item({ text: "😀".repeat(200) }).text).toHaveLength(400);
    for (const text of ["😀".repeat(201), "x".repeat(201), "ﷺ".repeat(12), "\uD800", "a\0b"])
      expect(() => item({ text })).toThrow("SEARCH_INVALID");
  });
  it("retains depth, leaf and structural limits and version errors", () => {
    let root: object = leaf;
    for (let i = 0; i < 5; i++) root = { kind: "not", child: root };
    expect(item({ f: f(root) }).filter).toBeTruthy();
    expect(() => item({ f: f({ kind: "not", child: root }) })).toThrow("FILTER_TOO_COMPLEX");
    expect(
      item({ f: f({ kind: "and", children: Array.from({ length: 50 }, () => leaf) }) }).filter,
    ).toBeTruthy();
    expect(() =>
      item({ f: f({ kind: "and", children: Array.from({ length: 51 }, () => leaf) }) }),
    ).toThrow("FILTER_TOO_COMPLEX");
    const structural = f({
      kind: "and",
      children: Array.from({ length: 50 }, () => ({
        kind: "tags",
        test: { op: "hasAny", values: ["a", "b", "c", "d", "e", "f"] },
      })),
    });
    expect(() => item({ f: structural })).toThrow("FILTER_TOO_COMPLEX");
    expect(() => item({ f: '{"version":2,"root":{"kind":"duplicate","value":true}}' })).toThrow(
      "FILTER_VERSION_UNSUPPORTED",
    );
  });
});
