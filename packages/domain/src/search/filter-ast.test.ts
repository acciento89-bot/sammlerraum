import { describe, expect, it } from "vitest";
import {
  ItemFilterSchema,
  ItemFilterNodeSchema,
  parseItemFilter,
  parseItemFilterJson,
} from "@sammlerraum/contracts/search";
import { validateFilterComplexity, validateCurrentFilterAvailability } from "./filter-ast";
import { copyBoundedFilterInput, scanFilterJson } from "../../../contracts/src/search-parser";

const id = "00000000-0000-0000-0000-000000000001";
const category = { kind: "category", test: { op: "eq", value: id } };
const envelope = (root: unknown) => ({ version: 1, root });
const parse = (root: unknown) => parseItemFilter(envelope(root));
const nested = (levels: number): unknown =>
  levels === 0 ? category : { kind: "not", child: nested(levels - 1) };
const fail = (fn: () => unknown, code = "FILTER_INVALID") => {
  expect(fn).toThrowError(code);
  try {
    fn();
  } catch (error) {
    expect(error).toMatchObject({ code, message: code });
    expect(JSON.stringify(error)).not.toContain("secret");
  }
};
const field = (valueType: string, test: unknown, source = "CUSTOM") => ({
  kind: source === "CUSTOM" ? "customField" : "catalogAttribute",
  selector:
    source === "CUSTOM"
      ? { source, collectionId: id, definitionId: id }
      : { source, categoryTemplateId: id, definitionId: id, target: "SELECTED_VARIANT" },
  predicate: { valueType, test },
});
const market = (kind = "CATALOG_VALUE", test: unknown = { op: "range", minMinor: "0" }) => ({
  kind: "marketMoney",
  selector: {
    mode: "CURRENT_ITEM_MAPPING",
    providerId: "fixture",
    identifierNamespace: "fixture",
    identifierType: "product",
    kind,
    currency: "EUR",
    sourceMetric: "guide.mid",
    qualifiers: { condition: "NM", flag: false },
    minorUnitExponent: 2,
  },
  test,
});
const legacy = {
  op: "range",
  unit: { currency: "ZZZ", minorUnitExponent: 9, unitKey: "old.unit" },
  minMinor: "0",
};
const canonical = {
  op: "range",
  unit: { currency: "AFN", minorUnitExponent: 0 },
  minMinor: "0",
  maxMinor: "9223372036854775807",
};

describe("bounded item-filter foundation", () => {
  const diagnosticCases = (["envelope", "node"] as const).flatMap((shape) =>
    (["safeParse", "parse", "safeParseAsync", "parseAsync"] as const).flatMap((method) =>
      (["secret", "getter", "toJSON", "oversized"] as const).map(
        (fixture) => [shape, method, fixture] as const,
      ),
    ),
  );
  it.each(diagnosticCases)(
    "keeps reportInput diagnostics closed: %s/%s/%s",
    async (shape, method, fixture) => {
      let invocations = 0;
      let root: unknown = { kind: "secret-key", value: "secret-value" };
      if (fixture === "getter")
        root = Object.defineProperty({ kind: "category" }, "secret-key", {
          enumerable: true,
          get() {
            invocations++;
            return "secret-value";
          },
        });
      if (fixture === "toJSON")
        root = {
          kind: "secret-key",
          toJSON() {
            invocations++;
            return "secret-value";
          },
        };
      if (fixture === "oversized")
        root = { kind: "secret-key", value: "secret-value".repeat(2000) };
      const schema = shape === "envelope" ? ItemFilterSchema : ItemFilterNodeSchema;
      let error: unknown;
      try {
        const result = await schema[method](shape === "envelope" ? envelope(root) : root, {
          reportInput: true,
        });
        if (method === "safeParse" || method === "safeParseAsync")
          error = (result as { error?: unknown }).error;
      } catch (caught) {
        error = caught;
      }
      expect(invocations).toBe(0);
      expect(error).toBeInstanceOf(Error);
      const diagnostic = error as Error & { issues: Array<{ input?: unknown }> };
      const serialized = JSON.stringify({ issues: diagnostic.issues, message: diagnostic.message });
      expect(serialized.length).toBeLessThan(300);
      expect(serialized).not.toContain("secret");
      expect(diagnostic.issues).toEqual([
        {
          code: "custom",
          message: fixture === "oversized" ? "FILTER_TOO_COMPLEX" : "FILTER_INVALID",
          input: undefined,
          path: [],
        },
      ]);
      expect(error).not.toHaveProperty("cause");
      expect(invocations).toBe(0);
    },
  );
  it("accepts five logical ancestors and rejects six including NOT", () => {
    expect(() => validateFilterComplexity(envelope(nested(5)))).not.toThrow();
    fail(() => validateFilterComplexity(envelope(nested(6))), "FILTER_TOO_COMPLEX");
    fail(
      () => parse({ kind: "or", children: [structuredClone(category), nested(5)] }),
      "FILTER_TOO_COMPLEX",
    );
  });
  it("accepts fifty leaves but rejects fifty-one before schema recursion", () => {
    expect(() =>
      parse({ kind: "and", children: Array.from({ length: 50 }, () => structuredClone(category)) }),
    ).not.toThrow();
    fail(
      () =>
        parse({
          kind: "and",
          children: Array.from({ length: 51 }, () => structuredClone(category)),
        }),
      "FILTER_TOO_COMPLEX",
    );
    // Split siblings stay below array width50, so this specifically catches leaf count51.
    fail(
      () =>
        parse({
          kind: "or",
          children: [
            { kind: "and", children: Array.from({ length: 25 }, () => structuredClone(category)) },
            { kind: "and", children: Array.from({ length: 26 }, () => structuredClone(category)) },
          ],
        }),
      "FILTER_TOO_COMPLEX",
    );
  });
  it.each([
    { kind: "and", children: [] },
    { kind: "or", children: [] },
    { kind: "not", children: [category] },
    { kind: "not", child: category, secret: "secret" },
    { kind: "wishlist", value: true },
    { kind: "manufacturer", value: "secret" },
    { kind: "year", value: 2026 },
    { kind: "conditionBand", value: 3 },
  ])("rejects unknown/empty/extra structural branches %#", (root) => fail(() => parse(root)));
  it("distinguishes unsupported version and invalid envelopes without payload diagnostics", () => {
    fail(() => parseItemFilter({ version: 2, root: category }), "FILTER_VERSION_UNSUPPORTED");
    fail(() => parseItemFilter({ version: "secret", root: category }));
    fail(() => parseItemFilter({ version: 1, root: null }));
    fail(() => parseItemFilter({ version: 1, root: category, secret: "secret" }));
  });
  it("guards every exported schema path and does not expose raw Zod payloads", () => {
    const cyclic: Record<string, unknown> = { kind: "not" };
    cyclic.child = cyclic;
    for (const schema of [ItemFilterSchema, ItemFilterNodeSchema]) {
      const result = schema.safeParse(cyclic);
      expect(result.success).toBe(false);
      if (!result.success) expect(JSON.stringify(result.error)).not.toContain("secret");
      expect(() => schema.parse(cyclic)).toThrowError("FILTER_INVALID");
      if (!result.success)
        expect(result.error.issues).toEqual([
          { code: "custom", message: "FILTER_INVALID", path: [] },
        ]);
    }
    expect(() => ItemFilterSchema.parse({ version: 1, root: { kind: "secret" } })).toThrowError(
      "FILTER_INVALID",
    );
    const malicious = envelope({ ...category, ["secret-key"]: "secret-value" });
    for (const schema of [ItemFilterSchema, ItemFilterNodeSchema]) {
      const result = schema.safeParse(schema === ItemFilterSchema ? malicious : malicious.root);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(JSON.stringify(result.error)).not.toContain("secret");
        expect(result.error.issues).toEqual([
          { code: "custom", message: "FILTER_INVALID", path: [] },
        ]);
      }
    }
    fail(() => parseItemFilter(malicious));
  });
  it("rejects non-JSON objects and accessors without invoking them", () => {
    let invoked = 0;
    const getter = Object.defineProperty({}, "secret", {
      enumerable: true,
      get() {
        invoked++;
        throw Error("secret");
      },
    });
    const toJSON = {
      toJSON() {
        invoked++;
        return category;
      },
    };
    for (const value of [
      getter,
      toJSON,
      new Date(),
      new Map(),
      undefined,
      1n,
      NaN,
      Infinity,
      Symbol("secret"),
      [undefined],
      new Array(2),
    ])
      fail(() => parseItemFilter(value));
    expect(invoked).toBe(0);
    const shared = { kind: "and", children: [category, category] };
    fail(() => parse(shared));
  });
  it("bounds JSON value/property scans at exactly 512 before typed parsing", () => {
    const input = Array.from({ length: 10 }, () => Array.from({ length: 50 }, () => 0));
    input.push([]);
    expect(() => copyBoundedFilterInput(input)).not.toThrow(); // root1 + arrays11 + values500 =512
    input[10]!.push(0);
    fail(() => copyBoundedFilterInput(input), "FILTER_TOO_COMPLEX");
    fail(
      () =>
        copyBoundedFilterInput(
          Object.fromEntries(Array.from({ length: 33 }, (_, n) => [String(n), 0])),
        ),
      "FILTER_TOO_COMPLEX",
    );
  });
  it("limits raw containers before JSON.parse and rejects duplicate decoded member keys", () => {
    expect(() => scanFilterJson("[".repeat(32) + "0" + "]".repeat(32))).not.toThrow();
    fail(() => scanFilterJson("[".repeat(33) + "0" + "]".repeat(33)), "FILTER_TOO_COMPLEX");
    for (const raw of [
      '{"version":1,"version":2,"root":{}}',
      '{"version":1,"root":{"kind":"category","\\u006bind":"secret"}}',
      '{"a":1,"\\u0061":2}',
      '{"x":"unterminated}',
      "{]",
    ])
      fail(() => parseItemFilterJson(raw));
    expect(parseItemFilterJson(JSON.stringify(envelope(category)))).toEqual(envelope(category));
    expect(() => scanFilterJson('{"a":"[\\\"{}]","b":{"a":1}}')).not.toThrow();
  });
  it("applies the same raw nesting ceiling to in-process objects", () => {
    let input: unknown = 0;
    for (let i = 0; i < 32; i++) input = [input];
    expect(() => copyBoundedFilterInput(input)).not.toThrow();
    fail(() => copyBoundedFilterInput([input]), "FILTER_TOO_COMPLEX");
  });
  it("rejects normalization expansion that cannot round-trip within the byte budget", () => {
    fail(
      () => parse(field("LONG_TEXT", { op: "eq", value: "㍿".repeat(2000) })),
      "FILTER_TOO_COMPLEX",
    );
  });
  it("enforces 16KiB UTF8 and rejects lone surrogates including escaped ones", () => {
    expect(() => scanFilterJson(" ".repeat(16383) + "0")).not.toThrow();
    fail(() => scanFilterJson(" ".repeat(16384) + "0"), "FILTER_TOO_COMPLEX");
    fail(() => scanFilterJson('"' + "😀".repeat(4096) + '"'), "FILTER_TOO_COMPLEX");
    for (const value of ["\ud800", "\udfff", "\0"])
      fail(() => parse({ kind: "tags", test: { op: "hasAny", values: [value] } }));
    fail(() =>
      parseItemFilterJson(
        '{"version":1,"root":{"kind":"tags","test":{"op":"hasAny","values":["\\ud800"]}}}',
      ),
    );
  });
});

describe("closed typed filter language", () => {
  it.each([
    category,
    { kind: "collection", test: { op: "in", values: [id] } },
    { kind: "category", test: { op: "missing" } },
    { kind: "condition", categoryTemplateId: id, test: { op: "present" } },
    { kind: "condition", categoryTemplateId: id, test: { op: "eq", value: id } },
    { kind: "tradeStatus", test: { op: "in", values: ["FOR_SALE", "RESERVED"] } },
    { kind: "visibility", test: { op: "eq", value: "PRIVATE" } },
    { kind: "duplicate", value: false },
    { kind: "media", mediaKind: "IMAGE", test: { op: "present" } },
    { kind: "media", mediaKind: "DOCUMENT", documentCategory: "INVOICE", test: { op: "missing" } },
    { kind: "createdAt", test: { op: "gte", value: "0001-01-01T00:00:00.000Z" } },
    {
      kind: "updatedAt",
      test: { op: "between", min: "2020-01-01T00:00:00.000Z", max: "2026-01-01T00:00:00.000Z" },
    },
    { kind: "acquisitionDate", test: { op: "missing" } },
    { kind: "acquisitionDate", test: { op: "eq", value: "2024-02-29" } },
    {
      kind: "grading",
      test: { op: "authored", provider: " PSA ", grade: "10", certificateNo: "ABC" },
    },
    {
      kind: "grading",
      test: {
        op: "comparable",
        provider: "PSA",
        scale: "10",
        value: { op: "between", min: "0", max: "10" },
      },
    },
    { kind: "grading", test: { op: "present" } },
    { kind: "purchaseMoney", test: legacy },
    { kind: "purchaseMoney", test: { op: "missing" } },
    { kind: "manualMoney", test: canonical },
    market(),
    market("PRICE_RANGE", { op: "overlaps", minMinor: "0", maxMinor: "1" }),
  ])("accepts retained leaf family %#", (root) => expect(parse(root).version).toBe(1));
  it.each([
    ["SHORT_TEXT", { op: "contains", value: "Acme" }],
    ["LONG_TEXT", { op: "startsWith", value: "Maker" }],
    ["INTEGER", { op: "between", min: -200, max: 2026 }],
    ["DECIMAL", { op: "lt", value: "-0002.5000" }],
    ["DATE", { op: "in", values: ["2024-02-29"] }],
    ["BOOLEAN", { op: "eq", value: false }],
    ["SINGLE_SELECT", { op: "eq", value: "option_key" }],
    ["MULTI_SELECT", { op: "hasAll", values: ["one", "two"] }],
    ["URL", { op: "eq", value: "https://example.org" }],
    ["MONEY", legacy],
  ])(
    "accepts typed %s custom/catalog fields including explicit maker/year selectors",
    (type, test) => {
      expect(parse(field(type as string, test)).version).toBe(1);
      expect(parse(field(type as string, test, "CATALOG")).version).toBe(1);
      expect(parse(field(type as string, { op: "missing" })).version).toBe(1);
    },
  );
  it("canonicalizes exact decimals/tags/UUIDs and rejects canonical list duplicates", () => {
    expect(parse(field("DECIMAL", { op: "eq", value: "0".repeat(100) + "2.50" }))).toMatchObject({
      root: { predicate: { test: { value: "2.5" } } },
    });
    expect(parse(field("DECIMAL", { op: "eq", value: "-0002.5000" }))).toMatchObject({
      root: { predicate: { test: { value: "-2.5" } } },
    });
    expect(parse({ kind: "tags", test: { op: "hasAll", values: [" Ａ   B "] } })).toMatchObject({
      root: { test: { values: ["a b"] } },
    });
    expect(
      parse({
        kind: "category",
        test: { op: "eq", value: "ABCDEF00-0000-0000-0000-000000000001" },
      }),
    ).toMatchObject({ root: { test: { value: "abcdef00-0000-0000-0000-000000000001" } } });
    for (const root of [
      field("DECIMAL", { op: "in", values: ["2", "02.0"] }),
      { kind: "tags", test: { op: "hasAny", values: ["A", " Ａ "] } },
      field("SINGLE_SELECT", { op: "in", values: [" A B ", "a   b"] }),
    ])
      fail(() => parse(root));
  });
  it("preserves producer lowercase expansion and canonical round-trips within identity caps", () => {
    const tag = parse({ kind: "tags", test: { op: "hasAny", values: ["İ".repeat(100)] } });
    expect(tag).toMatchObject({ root: { test: { values: ["i\u0307".repeat(100)] } } });
    expect(parseItemFilter(tag)).toEqual(tag);
    const selection = parse(field("SINGLE_SELECT", { op: "eq", value: "İ".repeat(200) }));
    expect(selection).toMatchObject({
      root: { predicate: { test: { value: "i\u0307".repeat(200) } } },
    });
    expect(parseItemFilter(selection)).toEqual(selection);
    fail(() => parse({ kind: "tags", test: { op: "hasAny", values: ["a".repeat(201)] } }));
    fail(() => parse(field("SINGLE_SELECT", { op: "eq", value: "a".repeat(401) })));
    fail(() => parse(field("SINGLE_SELECT", { op: "eq", value: "a".repeat(65) }, "CATALOG")));
  });
  it.each([
    field("INTEGER", { op: "eq", value: "2026" }),
    field("INTEGER", { op: "eq", value: 9007199254740992 }),
    field("BOOLEAN", { op: "eq", value: "false" }),
    field("SINGLE_SELECT", { op: "hasAny", values: ["a"] }),
    field("MULTI_SELECT", { op: "eq", value: "a" }),
    field("URL", { op: "contains", value: "https" }),
    field("DATE", { op: "eq", value: "2025-02-29" }),
    field("DATE", { op: "eq", value: "0000-01-01" }),
    field("DECIMAL", { op: "eq", value: "1e3" }),
    field("DECIMAL", { op: "eq", value: "1.0000000000000000001" }),
    field("DECIMAL", { op: "between", min: "10", max: "2" }),
    field("INTEGER", { op: "between", min: 2, max: 1 }),
    { kind: "manualMoney", test: { ...canonical, minMinor: "9223372036854775808" } },
    { kind: "manualMoney", test: { ...canonical, minMinor: "2", maxMinor: "1" } },
    { kind: "manualMoney", test: { ...canonical, minMinor: 0 } },
    { kind: "purchaseMoney", test: { ...legacy, unit: { ...legacy.unit, unitKey: " secret " } } },
    { kind: "purchaseMoney", test: { op: "range", unit: legacy.unit } },
    { kind: "media", mediaKind: "IMAGE", documentCategory: "INVOICE", test: { op: "present" } },
    { kind: "visibility", test: { op: "missing" } },
    { kind: "collection", test: { op: "missing" } },
    { kind: "tags", test: { op: "hasAny", values: [] } },
    { kind: "category", test: { op: "present", value: id } },
    { kind: "createdAt", test: { op: "eq", value: "2026-01-01" } },
  ])("rejects incompatible operator/value shape %#", (root) => fail(() => parse(root)));
  it("keeps close exact decimals ordered without floating point", () => {
    expect(
      parse(
        field("DECIMAL", {
          op: "between",
          min: "99999999999999999999.123456789012345677",
          max: "99999999999999999999.123456789012345678",
        }),
      ).version,
    ).toBe(1);
    fail(() =>
      parse(
        field("DECIMAL", {
          op: "between",
          min: "99999999999999999999.123456789012345678",
          max: "99999999999999999999.123456789012345677",
        }),
      ),
    );
  });
  it("requires exact semantic market selectors and kind-coupled intervals", () => {
    for (const selector of [
      { ...market().selector, sourceMetric: undefined },
      { ...market().selector, sourceMetric: "BadMetric" },
      { ...market().selector, qualifiers: { amount: 1 } },
      { ...market().selector, externalId: "secret" },
      { ...market().selector, mode: "CURRENT_MAPPING" },
      { ...market().selector, qualifiers: { condition: "x".repeat(129) } },
    ])
      fail(() => parse({ ...market(), selector }));
    fail(() => parse(market("PRICE_RANGE")));
    fail(() => parse(market("CATALOG_VALUE", { op: "overlaps", minMinor: "0", maxMinor: "1" })));
    expect(
      parse(market("PRICE_RANGE", { op: "containedBy", minMinor: "0", maxMinor: "0" })).version,
    ).toBe(1);
  });
});

describe("current availability is whole-tree and never a truth evaluator", () => {
  it.each([
    { kind: "duplicate", value: false },
    { kind: "purchaseMoney", test: legacy },
    field("MONEY", legacy),
    field("MONEY", legacy, "CATALOG"),
    market(),
    market("CATALOG_VALUE", { op: "missing" }),
  ])("rejects unavailable declarations under NOT/OR/AND %#", (leaf) => {
    for (const root of [
      leaf,
      { kind: "not", child: leaf },
      { kind: "or", children: [category, structuredClone(leaf)] },
      { kind: "and", children: [category, structuredClone(leaf)] },
    ])
      fail(() => validateCurrentFilterAvailability(envelope(root)), "FILTER_UNAVAILABLE");
  });
  it("permits structural manual/presence declarations without claiming runtime executability", () => {
    for (const leaf of [
      category,
      { kind: "manualMoney", test: canonical },
      { kind: "purchaseMoney", test: { op: "present" } },
      field("MONEY", { op: "missing" }),
    ])
      expect(() => validateCurrentFilterAvailability(envelope(leaf))).not.toThrow();
  });
  it("reports unavailable requirements in preorder without evaluating sibling truth", () => {
    const root = {
      kind: "or",
      children: [
        { kind: "not", child: { kind: "duplicate", value: false } },
        { kind: "purchaseMoney", test: legacy },
      ],
    };
    expect(() => validateCurrentFilterAvailability(envelope(root))).toThrowError(
      expect.objectContaining({ code: "FILTER_UNAVAILABLE", reason: "DUPLICATE_NOT_IMPLEMENTED" }),
    );
  });
});
