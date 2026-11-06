import { afterAll, describe, expect, it } from "vitest";
import { Prisma } from "@sammlerraum/db/search-sql";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { runSearchRead } from "./search-read";
import { collectLegacyMoneyRequests, legacyMoneyRangePredicate } from "./legacy-money-query";
const id = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
const range = (currency = "AFN", exponent = 2, minMinor = "100", maxMinor = "100") => ({
  op: "range",
  unit: { currency, minorUnitExponent: exponent, unitKey: `iso4217-2026-09-17:${currency}` },
  minMinor,
  maxMinor,
});
const envelope = (root: unknown) => ({ version: 1, root });
const purchase = { kind: "purchaseMoney", test: range() };
it("collects all three monetary families under OR/NOT without treating Boolean scope as authorization", () => {
  const requests = collectLegacyMoneyRequests(
    envelope({
      kind: "or",
      children: [
        purchase,
        {
          kind: "not",
          child: {
            kind: "customField",
            selector: { source: "CUSTOM", collectionId: id, definitionId: other },
            predicate: { valueType: "MONEY", test: range("EUR", 9) },
          },
        },
        {
          kind: "catalogAttribute",
          selector: {
            source: "CATALOG",
            categoryTemplateId: id,
            definitionId: other,
            target: "SELECTED_VARIANT",
          },
          predicate: { valueType: "MONEY", test: range("JPY", 0) },
        },
      ],
    }),
  );
  expect(requests.map((r) => r.selector)).toEqual([
    { family: "PURCHASE" },
    { family: "CUSTOM", collectionId: id, definitionId: other },
    { family: "CATALOG", categoryTemplateId: id, definitionId: other, target: "SELECTED_VARIANT" },
  ]);
});
it("counts one requested path selector once while retaining each distinct range unit/bound", () => {
  const requests = collectLegacyMoneyRequests(
    envelope({
      kind: "and",
      children: [purchase, { ...purchase, test: range("EUR", 9, "0", "9223372036854775807") }],
    }),
  );
  expect(requests).toHaveLength(1);
  expect(requests[0]!.ranges).toEqual([range(), range("EUR", 9, "0", "9223372036854775807")]);
});
it("does not require interpretation for presence-only money or unrelated predicates", () => {
  expect(collectLegacyMoneyRequests(null)).toEqual([]);
  expect(
    collectLegacyMoneyRequests(envelope({ kind: "purchaseMoney", test: { op: "present" } })),
  ).toEqual([]);
});
it.each(["ZZZ", "XXX"])(
  "rejects unsupported unit %s before any candidate read, even under NOT",
  (currency) => {
    expect(() =>
      collectLegacyMoneyRequests(
        envelope({ kind: "not", child: { kind: "purchaseMoney", test: range(currency) } }),
      ),
    ).toThrow("FILTER_UNAVAILABLE");
  },
);
it("never accepts a unit key for a different currency or silently clamps historical scale", () => {
  expect(() =>
    collectLegacyMoneyRequests(
      envelope({
        ...purchase,
        test: { ...range(), unit: { ...range().unit, unitKey: "iso4217-2026-09-17:EUR" } },
      }),
    ),
  ).toThrow("FILTER_UNAVAILABLE");
  expect(() =>
    collectLegacyMoneyRequests(envelope({ ...purchase, test: range("AFN", 10) })),
  ).toThrow("FILTER_INVALID");
});
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1",
  db = enabled ? createTestDatabaseClient() : undefined;
afterAll(async () => db?.$disconnect());
describe.runIf(enabled)("native exact legacy-money comparison foundation", () => {
  const columns = {
    raw: Prisma.sql`v.raw`,
    exponent: Prisma.sql`v.exponent`,
    currency: Prisma.sql`v.currency`,
    unitKey: Prisma.sql`v.unit`,
  };
  it("compares every bounded stored/query exponent pair with inclusive and one-sided bounds", async () => {
    const cases: { raw: string; stored: number; query: number; mode: "min" | "max" | "equal" }[] =
      [];
    for (let stored = 0; stored <= 9; stored++)
      for (let query = 0; query <= 9; query++)
        for (const mode of ["min", "max", "equal"] as const)
          cases.push({ raw: stored % 2 ? "9007199254740991" : "100", stored, query, mode });
    const statements = cases.map((example, index) => {
      const bounds = {
        op: "range",
        unit: range("AFN", example.query).unit,
        ...(example.mode !== "max" ? { minMinor: "100" } : {}),
        ...(example.mode !== "min" ? { maxMinor: "100" } : {}),
      };
      return Prisma.sql`SELECT ${index}::int AS id,${legacyMoneyRangePredicate(columns, bounds)} AS matches FROM (SELECT ${example.raw}::numeric AS raw,${example.stored}::int AS exponent,'AFN'::text AS currency,'iso4217-2026-09-17:AFN'::text AS unit) v`;
    });
    const actual = await runSearchRead(db!, (tx) =>
      tx.$queryRaw<{ id: number; matches: boolean }[]>(Prisma.join(statements, " UNION ALL ")),
    );
    const expected = cases.map((example, id) => {
      const left = BigInt(example.raw) * 10n ** BigInt(example.query);
      const right = 100n * 10n ** BigInt(example.stored);
      return {
        id,
        matches:
          example.mode === "min"
            ? left >= right
            : example.mode === "max"
              ? left <= right
              : left === right,
      };
    });
    expect(actual.sort((a, b) => a.id - b.id)).toEqual(expected);
  });
  it.each([
    ["1", 0, "AFN", "iso4217-2026-09-17:AFN", range(), true],
    ["100", 2, "AFN", "iso4217-2026-09-17:AFN", range("AFN", 0, "1", "1"), true],
    ["101", 2, "AFN", "iso4217-2026-09-17:AFN", range(), false],
    ["0", 9, "AFN", "iso4217-2026-09-17:AFN", range("AFN", 0, "0", "0"), true],
    [null, null, null, null, range(), false],
    ["100", 2, "EUR", "iso4217-2026-09-17:EUR", range(), false],
    ["100", 2, "AFN", "unsupported:historical", range(), false],
    [
      "9007199254740991",
      0,
      "AFN",
      "iso4217-2026-09-17:AFN",
      { op: "range", unit: range("AFN", 9).unit, minMinor: "9223372036854775807" },
      true,
    ],
  ])(
    "compares native raw %s scale%s currency%s without float or bigint-overflow arithmetic",
    async (raw, exponent, currency, unit, bounds, expected) => {
      const predicate = legacyMoneyRangePredicate(columns, bounds);
      const rows = await runSearchRead(db!, (tx) =>
        tx.$queryRaw<{ matches: boolean; complement: boolean }[]>(
          Prisma.sql`SELECT ${predicate} AS matches, NOT (${predicate}) AS complement FROM (SELECT ${raw}::numeric AS raw,${exponent}::int AS exponent,${currency}::text AS currency,${unit}::text AS unit) v`,
        ),
      );
      expect(rows[0]).toEqual({ matches: expected, complement: !expected });
    },
  );
});
