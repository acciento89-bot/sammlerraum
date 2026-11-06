import { describe, expect, it } from "vitest";
import { parseItemFilter } from "@sammlerraum/contracts/search";
import { fromDraft, toDraft, available, replaceNode, newLeaf } from "./filter-draft";
const id = "00000000-0000-4000-8000-000000000001";
const ordered = (a: unknown, b: unknown) => [
  { op: "eq", value: a },
  { op: "in", values: [a, b] },
  ...["lt", "lte", "gt", "gte"].map((op) => ({ op, value: a })),
  { op: "between", min: a, max: b },
];
const presence = [{ op: "present" }, { op: "missing" }];
const types: Record<string, unknown[]> = {
  SHORT_TEXT: [
    { op: "eq", value: "alpha" },
    { op: "in", values: ["alpha", "beta"] },
    { op: "contains", value: "a" },
    { op: "startsWith", value: "a" },
  ],
  LONG_TEXT: [
    { op: "eq", value: "alpha" },
    { op: "in", values: ["alpha", "beta"] },
    { op: "contains", value: "a" },
    { op: "startsWith", value: "a" },
  ],
  INTEGER: ordered(0, 10),
  DECIMAL: ordered("0", "1.5"),
  DATE: ordered("2025-01-01", "2025-02-01"),
  BOOLEAN: [
    { op: "eq", value: false },
    { op: "eq", value: true },
  ],
  SINGLE_SELECT: [
    { op: "eq", value: "alpha" },
    { op: "in", values: ["alpha", "beta"] },
  ],
  MULTI_SELECT: [
    { op: "hasAny", values: ["alpha"] },
    { op: "hasAll", values: ["alpha", "beta"] },
  ],
  URL: [
    { op: "eq", value: "https://example.test/" },
    { op: "in", values: ["https://example.test/", "https://example.org/"] },
  ],
  MONEY: [],
};
const cases: Array<{ label: string; root: unknown }> = [];
for (const [valueType, tests] of Object.entries(types))
  for (const test of [...tests, ...presence])
    for (const target of ["CUSTOM", "ENTRY", "SELECTED_VARIANT"])
      cases.push({
        label: `${target} ${valueType} ${JSON.stringify(test)}`,
        root:
          target === "CUSTOM"
            ? {
                kind: "customField",
                selector: { source: "CUSTOM", collectionId: id, definitionId: id },
                predicate: { valueType, test },
              }
            : {
                kind: "catalogAttribute",
                selector: { source: "CATALOG", categoryTemplateId: id, definitionId: id, target },
                predicate: { valueType, test },
              },
      });
for (const kind of ["collection", "category", "condition"])
  for (const test of [
    { op: "eq", value: id },
    { op: "in", values: [id] },
    ...(kind === "collection" ? [] : presence),
  ])
    cases.push({
      label: `${kind} ${test.op}`,
      root: { kind, ...(kind === "condition" ? { categoryTemplateId: id } : {}), test },
    });
for (const kind of ["createdAt", "updatedAt", "acquisitionDate"])
  for (const test of [
    ...ordered(
      kind === "acquisitionDate" ? "2025-01-01" : "2025-01-01T00:00:00.000Z",
      kind === "acquisitionDate" ? "2025-02-01" : "2025-02-01T00:00:00.000Z",
    ),
    ...(kind === "acquisitionDate" ? presence : []),
  ])
    cases.push({ label: `${kind} ${test.op}`, root: { kind, test } });
for (const kind of ["grading", "purchaseMoney", "manualMoney", "tags", "media"])
  for (const test of presence)
    cases.push({
      label: `${kind} ${test.op}`,
      root: { kind, ...(kind === "media" ? { mediaKind: "IMAGE" } : {}), test },
    });
cases.push({
  label: "grading authored certificate",
  root: {
    kind: "grading",
    test: {
      op: "authored",
      provider: "Provider",
      grade: "Mint",
      certificateNo: "private-certificate",
    },
  },
});
for (const value of ordered("0", "10"))
  cases.push({
    label: `grading comparable ${value.op}`,
    root: {
      kind: "grading",
      test: { op: "comparable", provider: "Provider", scale: "ten", value },
    },
  });
for (const kind of ["tradeStatus", "visibility"])
  for (const test of [
    { op: "eq", value: kind === "tradeStatus" ? "RESERVED" : "PRIVATE" },
    { op: "in", values: kind === "tradeStatus" ? ["FOR_SALE", "RESERVED"] : ["PRIVATE", "PUBLIC"] },
  ])
    cases.push({ label: `${kind} ${test.op}`, root: { kind, test } });
for (const op of ["hasAny", "hasAll"])
  cases.push({
    label: `tags ${op}`,
    root: { kind: "tags", test: { op, values: ["alpha", "beta"] } },
  });
cases.push(
  {
    label: "manual zero lower bound",
    root: {
      kind: "manualMoney",
      test: { op: "range", unit: { currency: "EUR", minorUnitExponent: 2 }, minMinor: "0" },
    },
  },
  {
    label: "manual upper bound only",
    root: {
      kind: "manualMoney",
      test: { op: "range", unit: { currency: "JPY", minorUnitExponent: 0 }, maxMinor: "10" },
    },
  },
  {
    label: "document category",
    root: {
      kind: "media",
      mediaKind: "DOCUMENT",
      documentCategory: "AUTHENTICITY_CERTIFICATE",
      test: { op: "present" },
    },
  },
);
describe("all available typed operator families preserve operands", () => {
  it.each(cases)("$label", ({ root }) => {
    const filter = parseItemFilter({ version: 1, root });
    const restored = fromDraft(toDraft(filter));
    expect(restored).toEqual(filter);
    expect(restored && available(restored.root)).toBe(true);
  });
});
it("supports repair/removal without discarding neighbouring NOT/OR operands", () => {
  const filter = parseItemFilter({
    version: 1,
    root: {
      kind: "or",
      children: [
        { kind: "not", child: { kind: "duplicate", value: false } },
        { kind: "tags", test: { op: "present" } },
      ],
    },
  });
  const draft = toDraft(filter)!;
  if (draft.kind !== "or") throw Error();
  const repaired = replaceNode(draft, draft.children[0]!.key, newLeaf("purchaseMoney"));
  expect(fromDraft(repaired)).toEqual({
    version: 1,
    root: {
      kind: "or",
      children: [
        { kind: "purchaseMoney", test: { op: "present" } },
        { kind: "tags", test: { op: "present" } },
      ],
    },
  });
});

it("enables supported legacy ranges only with affirmative consumer rollout", () => {
  const root = parseItemFilter({
    version: 1,
    root: {
      kind: "purchaseMoney",
      test: {
        op: "range",
        unit: { currency: "AFN", minorUnitExponent: 0, unitKey: "iso4217-2026-09-17:AFN" },
        minMinor: "1",
      },
    },
  }).root;
  expect(available(root)).toBe(false);
  expect(available(root, true)).toBe(true);
  const unsupported = parseItemFilter({
    version: 1,
    root: {
      kind: "purchaseMoney",
      test: {
        op: "range",
        unit: { currency: "ZZZ", minorUnitExponent: 2, unitKey: "historical:ZZZ" },
        minMinor: "1",
      },
    },
  }).root;
  expect(available(unsupported, true)).toBe(false);
});
