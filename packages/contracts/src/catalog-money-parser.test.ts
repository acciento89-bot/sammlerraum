import { describe, expect, it } from "vitest";
import { scanCatalogMoneyJson, copyCatalogMoneyInput } from "./catalog-money";
import { scanFilterJson, copyBoundedFilterInput } from "./search-parser";
describe("catalog money fixed JSON boundary", () => {
  it("accepts 100 independent paths and a 20000-character description without widening filter bounds", () => {
    const raw = JSON.stringify({
      description: "x".repeat(20000),
      money: {
        intents: Array.from({ length: 100 }, (_, i) => ({
          definitionId: `path-${i}`,
          target: { kind: "ENTRY" },
          op: "RETAIN",
          expectedFactToken: "abc",
        })),
      },
    });
    expect(() => scanCatalogMoneyJson(raw)).not.toThrow();
    expect(copyCatalogMoneyInput(JSON.parse(raw))).toEqual(JSON.parse(raw));
    expect(() => scanFilterJson(raw)).toThrow();
    expect(() => copyBoundedFilterInput(JSON.parse(raw))).toThrow();
  });
  it("rejects escaped nested duplicate keys and oversized bodies", () => {
    expect(() => scanCatalogMoneyJson('{"money":{"op":1,"\\u006fp":2}}')).toThrow();
    expect(() =>
      scanCatalogMoneyJson(JSON.stringify({ description: "x".repeat(65536) })),
    ).toThrow();
    expect(() => copyCatalogMoneyInput({ description: "x".repeat(20001) })).toThrow();
    expect(() => copyCatalogMoneyInput({ paths: Array(101).fill(1) })).toThrow();
  });
  it("retains Unicode, accessor, alias and cycle defenses", () => {
    expect(copyCatalogMoneyInput({ text: "🌍" })).toEqual({ text: "🌍" });
    expect(() => copyCatalogMoneyInput({ text: "\ud800" })).toThrow();
    const shared = { value: 1 };
    expect(() => copyCatalogMoneyInput({ a: shared, b: shared })).toThrow();
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => copyCatalogMoneyInput(cycle)).toThrow();
    let invoked = false;
    expect(() =>
      copyCatalogMoneyInput({
        get value() {
          invoked = true;
          return 1;
        },
      }),
    ).toThrow();
    expect(invoked).toBe(false);
  });
});
