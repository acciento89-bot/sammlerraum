import { afterAll, describe, expect, it } from "vitest";
import { Prisma } from "@sammlerraum/db/search-sql";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { runSearchRead } from "../search/search-read";
import {
  finalizePurchaseCost,
  purchaseCostGroupsSql,
  readResolvedPurchaseCoverage,
} from "./purchase-cost";
const empty = {
  selectedItems: 0,
  selectedPaths: 0,
  missingPaths: 0,
  presentPaths: 0,
  eligiblePaths: 0,
  unknownPaths: 0,
  ineligiblePaths: 0,
  selectedUnits: "0",
  missingUnits: "0",
  presentUnits: "0",
};
const complete = {
  ...empty,
  selectedItems: 2,
  selectedPaths: 2,
  presentPaths: 2,
  eligiblePaths: 2,
  selectedUnits: "4",
  presentUnits: "4",
};
const knownGroup = {
  currency: "AFN",
  unitKey: "iso4217-2026-09-17:AFN",
  exponent: 0,
  totalMinor: "0",
};
it.each(["unknownPaths", "ineligiblePaths"] as const)(
  "gates the independent whole scope %s before loading any matched selection",
  async (kind) => {
    let calls = 0;
    const result = await finalizePurchaseCost(
      { ...complete, eligiblePaths: 1, [kind]: 1 },
      async () => {
        calls++;
        throw Error("Matched selection must not be read");
      },
    );
    expect(result).toMatchObject({ state: "UNAVAILABLE", selectionCoverage: null, groups: null });
    expect(calls).toBe(0);
  },
);
it("keeps a narrowed matched subtotal separately labelled after whole-scope eligibility", async () => {
  const partial = {
    ...complete,
    missingPaths: 1,
    presentPaths: 1,
    eligiblePaths: 1,
    presentUnits: "2",
    missingUnits: "2",
  };
  const result = await finalizePurchaseCost(partial, async () => ({
    coverage: {
      ...partial,
      selectedItems: 1,
      selectedPaths: 1,
      presentPaths: 0,
      eligiblePaths: 0,
      selectedUnits: "2",
      presentUnits: "0",
    },
    groups: [],
  }));
  expect(result).toMatchObject({ state: "NO_PRICES", coverage: partial, groups: null });
});
it("keeps known zero, empty and complete states distinct", async () => {
  expect(
    (await finalizePurchaseCost(empty, async () => ({ coverage: empty, groups: [] }))).state,
  ).toBe("EMPTY");
  expect(
    await finalizePurchaseCost(complete, async () => ({
      coverage: complete,
      groups: [knownGroup],
    })),
  ).toMatchObject({ state: "COMPLETE", groups: [{ totalMinor: "0" }] });
});
it.each([
  { groups: [{ ...knownGroup, unitKey: "iso4217-2026-09-17:EUR" }] },
  { groups: [knownGroup, knownGroup] },
  { groups: [] },
  {
    coverage: {
      ...complete,
      selectedItems: 3,
      selectedPaths: 3,
      presentPaths: 3,
      eligiblePaths: 3,
      selectedUnits: "6",
      presentUnits: "6",
    },
  },
])("refuses inconsistent grouping or a selection escaping outer coverage %#", async (change) => {
  await expect(
    finalizePurchaseCost(complete, async () => ({
      coverage: complete,
      groups: [knownGroup],
      ...change,
    })),
  ).rejects.toMatchObject({ code: "MONEY_DATA_INTEGRITY" });
});
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1",
  db = enabled ? createTestDatabaseClient() : undefined;
afterAll(async () => db?.$disconnect());
describe.runIf(enabled)("native quantity-weighted purchase grouping", () => {
  it("sums two maximum-raw times intmax quantities beyond bigint without rounding", async () => {
    const raw = "9007199254740991",
      quantity = 2147483647;
    const relation = Prisma.sql`SELECT ${raw}::numeric AS raw,${quantity}::int AS quantity,'AFN'::text AS currency,'iso4217-2026-09-17:AFN'::text AS "unitKey",0::int AS exponent FROM generate_series(1,2)`;
    const rows = await runSearchRead(db!, (tx) => tx.$queryRaw(purchaseCostGroupsSql(relation)));
    expect(rows).toEqual([
      {
        currency: "AFN",
        unitKey: "iso4217-2026-09-17:AFN",
        exponent: 0,
        totalMinor: (BigInt(raw) * BigInt(quantity) * 2n).toString(),
      },
    ]);
  });
  it("groups different evidenced scales separately and preserves exact zero", async () => {
    const relation = Prisma.sql`SELECT * FROM (VALUES (0::numeric,2::int,'AFN'::text,'iso4217-2026-09-17:AFN'::text,0::int),(100::numeric,3::int,'AFN'::text,'iso4217-2026-09-17:AFN'::text,2::int)) v(raw,quantity,currency,"unitKey",exponent)`;
    const rows = await runSearchRead(db!, (tx) => tx.$queryRaw(purchaseCostGroupsSql(relation)));
    expect(rows).toEqual([{ ...knownGroup }, { ...knownGroup, exponent: 2, totalMinor: "300" }]);
  });
});

describe.runIf(enabled)("native complete resolved purchase coverage aggregation", () => {
  const rows = (values: Prisma.Sql) =>
    Prisma.sql`SELECT * FROM (${values}) v(id,raw,quantity,status)`;
  it("counts the whole relation and quantity buckets, including missing, zero and unresolved facts", async () => {
    const relation = rows(
      Prisma.sql`VALUES (1,0::numeric,2::numeric,'ELIGIBLE'::text),(2,NULL::numeric,3::numeric,'MISSING'::text),(3,100::numeric,4::numeric,'UNKNOWN'::text),(4,1::numeric,5::numeric,'INELIGIBLE'::text)`,
    );
    const actual = await runSearchRead(db!, (tx) => readResolvedPurchaseCoverage(tx, relation));
    expect(actual).toEqual({
      selectedItems: 4,
      selectedPaths: 4,
      missingPaths: 1,
      presentPaths: 3,
      eligiblePaths: 1,
      unknownPaths: 1,
      ineligiblePaths: 1,
      selectedUnits: "14",
      missingUnits: "3",
      presentUnits: "11",
    });
  });
  it("retains an empty relation as exact zero coverage", async () => {
    const relation = Prisma.sql`SELECT 1 AS id,NULL::numeric AS raw,1::numeric AS quantity,'MISSING'::text AS status WHERE false`;
    expect(await runSearchRead(db!, (tx) => readResolvedPurchaseCoverage(tx, relation))).toEqual(
      empty,
    );
  });
  it("retains intmax quantities and maximum raw without bigint sum casts", async () => {
    const relation = rows(
      Prisma.sql`VALUES (1,9007199254740991::numeric,2147483647::numeric,'ELIGIBLE'::text),(2,0::numeric,2147483647::numeric,'ELIGIBLE'::text)`,
    );
    expect(
      await runSearchRead(db!, (tx) => readResolvedPurchaseCoverage(tx, relation)),
    ).toMatchObject({
      selectedItems: 2,
      selectedUnits: "4294967294",
      presentUnits: "4294967294",
    });
  });
  it.each([
    Prisma.sql`VALUES (1,NULL::numeric,1::numeric,'ELIGIBLE'::text)`,
    Prisma.sql`VALUES (1,0::numeric,1::numeric,'MISSING'::text)`,
    Prisma.sql`VALUES (1,0::numeric,0::numeric,'ELIGIBLE'::text)`,
    Prisma.sql`VALUES (1,0::numeric,2147483648::numeric,'ELIGIBLE'::text)`,
    Prisma.sql`VALUES (1,0::numeric,1.5::numeric,'ELIGIBLE'::text)`,
    Prisma.sql`VALUES (1,-1::numeric,1::numeric,'ELIGIBLE'::text)`,
    Prisma.sql`VALUES (1,9007199254740992::numeric,1::numeric,'ELIGIBLE'::text)`,
    Prisma.sql`VALUES (1,1.5::numeric,1::numeric,'ELIGIBLE'::text)`,
    Prisma.sql`VALUES (1,0::numeric,1::numeric,NULL::text)`,
    Prisma.sql`VALUES (1,0::numeric,1::numeric,'OTHER'::text)`,
    Prisma.sql`VALUES (1,0::numeric,1::numeric,'ELIGIBLE'::text),(1,0::numeric,1::numeric,'ELIGIBLE'::text)`,
  ])("refuses a malformed resolved relation rather than dropping rows %#", async (values) => {
    await runSearchRead(db!, async (tx) => {
      await expect(readResolvedPurchaseCoverage(tx, rows(values))).rejects.toMatchObject({
        code: "MONEY_DATA_INTEGRITY",
      });
    });
  });
});
