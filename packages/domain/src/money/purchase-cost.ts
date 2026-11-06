import {
  moneyScopeCandidates,
  readOwnedMoneyCoverage,
  type AuthorizedOuterMoneyScope,
} from "../search/legacy-money-query";
import { ownedMoneySelectorRowsSql } from "./legacy-money-store";
import { z } from "zod";
import { Prisma } from "@sammlerraum/db/search-sql";
import { legacyMoneyFail } from "@sammlerraum/contracts/legacy-money";
import {
  PurchaseMoneyCoverageSchema,
  PurchaseCostGroupSchema,
  PurchaseCostResultSchema,
  type PurchaseCostResult,
  type PurchaseCostGroup,
  type PurchaseMoneyCoverage,
} from "@sammlerraum/contracts/money-coverage";
import type { BoundedSearchReadTransaction } from "../search/search-read";
import { CURRENCY_AUTHORITY_VERSION, currencyMinorUnitExponent } from "./currencies";
/**
 * Trusted resolved matched relation in the enclosing authorized snapshot. Caller
 * must first establish whole-scope provenance eligibility. This SQL is exact
 * quantity arithmetic only; it is not an authorization or coverage producer.
 */
export function purchaseCostGroupsSql(resolvedSelection: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`SELECT r.currency,r."unitKey",r.exponent,sum(r.raw::numeric*r.quantity::numeric)::text AS "totalMinor" FROM (${resolvedSelection}) r WHERE r.raw IS NOT NULL GROUP BY r.currency,r."unitKey",r.exponent ORDER BY r.currency COLLATE pg_catalog."C",r."unitKey" COLLATE pg_catalog."C",r.exponent`;
}
/**
 * Aggregate every row of a trusted, independently authorized resolved relation.
 * The caller must obtain status through the shared provenance resolver, before
 * text/AST/page filtering. This helper neither resolves evidence nor authorizes
 * a raw client relation; it only counts/weights an already resolved whole scope.
 */
export async function readResolvedPurchaseCoverage(
  tx: BoundedSearchReadTransaction,
  resolvedSelection: Prisma.Sql,
): Promise<PurchaseMoneyCoverage> {
  const rows = await tx.$queryRaw<unknown[]>(Prisma.sql`
    WITH r AS (${resolvedSelection})
    SELECT count(*)::text AS "selectedItems",count(*)::text AS "selectedPaths",
      (count(*) FILTER (WHERE raw IS NULL))::text AS "missingPaths",
      (count(*) FILTER (WHERE raw IS NOT NULL))::text AS "presentPaths",
      (count(*) FILTER (WHERE status='ELIGIBLE'))::text AS "eligiblePaths",
      (count(*) FILTER (WHERE status='UNKNOWN'))::text AS "unknownPaths",
      (count(*) FILTER (WHERE status='INELIGIBLE'))::text AS "ineligiblePaths",
      coalesce(sum(quantity::numeric),0)::text AS "selectedUnits",
      coalesce(sum(quantity::numeric) FILTER (WHERE raw IS NULL),0)::text AS "missingUnits",
      coalesce(sum(quantity::numeric) FILTER (WHERE raw IS NOT NULL),0)::text AS "presentUnits",
      (count(DISTINCT id)<>count(*) OR coalesce(bool_or(
        status IS NULL OR status NOT IN ('MISSING','ELIGIBLE','UNKNOWN','INELIGIBLE')
        OR (status='MISSING') IS DISTINCT FROM (raw IS NULL)
        OR quantity IS NULL OR quantity<1 OR quantity>2147483647 OR quantity<>trunc(quantity)
        OR raw<0 OR raw>9007199254740991 OR raw<>trunc(raw)
      ),false)) AS invalid FROM r`);
  const integerText = z
    .string()
    .max(16)
    .regex(/^(0|[1-9][0-9]*)$/u);
  const countNames = [
    "selectedItems",
    "selectedPaths",
    "missingPaths",
    "presentPaths",
    "eligiblePaths",
    "unknownPaths",
    "ineligiblePaths",
  ] as const;
  const rowSchema = z
    .object({
      selectedItems: integerText,
      selectedPaths: integerText,
      missingPaths: integerText,
      presentPaths: integerText,
      eligiblePaths: integerText,
      unknownPaths: integerText,
      ineligiblePaths: integerText,
      selectedUnits: z.string(),
      missingUnits: z.string(),
      presentUnits: z.string(),
      invalid: z.boolean(),
    })
    .strict();
  if (rows.length !== 1) return legacyMoneyFail("MONEY_DATA_INTEGRITY");
  const decoded = rowSchema.safeParse(rows[0]);
  if (!decoded.success || decoded.data.invalid) return legacyMoneyFail("MONEY_DATA_INTEGRITY");
  const counts: Record<string, number> = {};
  for (const name of countNames) {
    const value = decoded.data[name];
    if (typeof value !== "string" || BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER))
      return legacyMoneyFail("MONEY_DATA_INTEGRITY");
    counts[name] = Number(value);
  }
  const result = PurchaseMoneyCoverageSchema.safeParse({
    ...counts,
    selectedUnits: decoded.data.selectedUnits,
    missingUnits: decoded.data.missingUnits,
    presentUnits: decoded.data.presentUnits,
  });
  if (!result.success) return legacyMoneyFail("MONEY_DATA_INTEGRITY");
  return result.data;
}
const matchedSchema = z
  .object({
    coverage: PurchaseMoneyCoverageSchema,
    groups: z.array(PurchaseCostGroupSchema).max(1650),
  })
  .strict();
/** The deferred read must use the caller's same bounded snapshot; no transaction is opened here. */
export async function finalizePurchaseCost(
  outerCoverage: unknown,
  readMatchedSelection: () => Promise<{ coverage: unknown; groups: unknown[] }>,
): Promise<PurchaseCostResult> {
  const outer = PurchaseMoneyCoverageSchema.safeParse(outerCoverage);
  if (!outer.success) return legacyMoneyFail("MONEY_DATA_INTEGRITY");
  if (outer.data.unknownPaths || outer.data.ineligiblePaths)
    return { state: "UNAVAILABLE", coverage: outer.data, selectionCoverage: null, groups: null };
  // A narrower text/AST selection must never hide unresolved outer candidates.
  const selected = matchedSchema.safeParse(await readMatchedSelection());
  if (!selected.success) return legacyMoneyFail("MONEY_DATA_INTEGRITY");
  for (const group of selected.data.groups) {
    try {
      currencyMinorUnitExponent(group.currency);
      if (group.unitKey !== `${CURRENCY_AUTHORITY_VERSION}:${group.currency}`) throw Error();
    } catch {
      return legacyMoneyFail("MONEY_DATA_INTEGRITY");
    }
  }
  const coverage = selected.data.coverage;
  const state =
    coverage.selectedItems === 0
      ? "EMPTY"
      : coverage.presentPaths === 0
        ? "NO_PRICES"
        : coverage.missingPaths > 0
          ? "PARTIAL"
          : "COMPLETE";
  if ((state === "EMPTY" || state === "NO_PRICES") && selected.data.groups.length)
    return legacyMoneyFail("MONEY_DATA_INTEGRITY");
  const result = PurchaseCostResultSchema.safeParse({
    state,
    coverage: outer.data,
    selectionCoverage: coverage,
    groups: state === "NO_PRICES" ? null : selected.data.groups,
  });
  if (!result.success) return legacyMoneyFail("MONEY_DATA_INTEGRITY");
  return result.data;
}

/** Complete purchase gate and optional whole matched selection share this snapshot. */
export async function readPurchaseCost(
  tx: BoundedSearchReadTransaction,
  scope: AuthorizedOuterMoneyScope,
  matchedSelection?: Prisma.Sql,
): Promise<PurchaseCostResult> {
  const outer = await readOwnedMoneyCoverage(tx, scope, { family: "PURCHASE" });
  return finalizePurchaseCost(outer, async () => {
    const resolved = ownedMoneySelectorRowsSql(
      { userId: scope.ownerId },
      { family: "PURCHASE" },
      moneyScopeCandidates(scope, matchedSelection),
    );
    // Every present outer fact has already passed the shared origin policy in
    // this same bounded RepeatableRead snapshot. No matching can bypass it.
    const relation = Prisma.sql`SELECT r.*,CASE WHEN r.raw IS NULL THEN 'MISSING'::text ELSE 'ELIGIBLE'::text END AS status FROM (${resolved}) r`;
    const coverage = await readResolvedPurchaseCoverage(tx, relation);
    const groups = await tx.$queryRaw<PurchaseCostGroup[]>(purchaseCostGroupsSql(relation));
    return { coverage, groups };
  });
}
