import {
  PurchaseMoneyCoverageSchema,
  type PurchaseMoneyCoverage,
} from "@sammlerraum/contracts/money-coverage";
import { legacyMoneyFail } from "@sammlerraum/contracts/legacy-money";
import type { BoundedSearchReadTransaction } from "./search-read";
import { candidateFrom, leaves, referencePredicate } from "./search-compiler";
import {
  ownedMoneySelectorRowsSql,
  visitOwnedMoneySelectorFacts,
} from "../money/legacy-money-store";
import { Prisma } from "@sammlerraum/db/search-sql";
import {
  FilterValidationError,
  parseItemFilter,
  type ItemFilterNode,
  type ItemFilterLeaf,
} from "@sammlerraum/contracts/search";
import { CURRENCY_AUTHORITY_VERSION, currencyMinorUnitExponent } from "../money/currencies";
export type LegacyMoneySelector =
  | { family: "PURCHASE" }
  | { family: "CUSTOM"; collectionId: string; definitionId: string }
  | {
      family: "CATALOG";
      categoryTemplateId: string;
      definitionId: string;
      target: "ENTRY" | "SELECTED_VARIANT";
    };
export type LegacyMoneyRange = Extract<
  Extract<ItemFilterLeaf, { kind: "purchaseMoney" }>["test"],
  { op: "range" }
>;
export type LegacyMoneyRequest = { selector: LegacyMoneySelector; ranges: LegacyMoneyRange[] };
/** Trusted SQL expressions from the already resolved complete-scope relation. */
export type ResolvedMoneyColumns = {
  raw: Prisma.Sql;
  exponent: Prisma.Sql;
  currency: Prisma.Sql;
  unitKey: Prisma.Sql;
};
function unitAvailable(unit: LegacyMoneyRange["unit"]): void {
  try {
    // Establish supported unit identity only. Never substitute today's exponent
    // for an evidenced stored scale or the caller's explicit bounded scale.
    currencyMinorUnitExponent(unit.currency);
    if (unit.unitKey !== `${CURRENCY_AUTHORITY_VERSION}:${unit.currency}`) throw Error();
  } catch {
    throw new FilterValidationError(
      "FILTER_UNAVAILABLE",
      "LEGACY_MONEY_INTERPRETATION_UNAVAILABLE",
    );
  }
}
export function collectLegacyMoneyRequests(input: unknown): LegacyMoneyRequest[] {
  if (input === null || input === undefined) return [];
  const pending: ItemFilterNode[] = [parseItemFilter(input).root];
  const requests = new Map<string, LegacyMoneyRequest>();
  while (pending.length) {
    const node = pending.pop()!;
    if (node.kind === "and" || node.kind === "or") {
      pending.push(...node.children.toReversed());
      continue;
    }
    if (node.kind === "not") {
      pending.push(node.child);
      continue;
    }
    let selector: LegacyMoneySelector, range: LegacyMoneyRange, key: string;
    if (node.kind === "purchaseMoney" && node.test.op === "range") {
      selector = { family: "PURCHASE" };
      range = node.test;
      key = "PURCHASE";
    } else if (
      node.kind === "customField" &&
      node.predicate.valueType === "MONEY" &&
      node.predicate.test.op === "range"
    ) {
      selector = {
        family: "CUSTOM",
        collectionId: node.selector.collectionId,
        definitionId: node.selector.definitionId,
      };
      range = node.predicate.test;
      key = `CUSTOM:${selector.collectionId}:${selector.definitionId}`;
    } else if (
      node.kind === "catalogAttribute" &&
      node.predicate.valueType === "MONEY" &&
      node.predicate.test.op === "range"
    ) {
      selector = {
        family: "CATALOG",
        categoryTemplateId: node.selector.categoryTemplateId,
        definitionId: node.selector.definitionId,
        target: node.selector.target,
      };
      range = node.predicate.test;
      key = `CATALOG:${selector.categoryTemplateId}:${selector.definitionId}:${selector.target}`;
    } else continue;
    // Validate every range before deduplication, even under NOT/OR or on an empty scope.
    unitAvailable(range.unit);
    const found = requests.get(key);
    if (found) found.ranges.push(range);
    else requests.set(key, { selector, ranges: [range] });
  }
  return [...requests.values()];
}
/**
 * Exact positive comparison after full outer-scope coverage has passed. This
 * predicate alone never grants interpretation availability. Missing/other-unit
 * values are false, so the existing AST's NOT can complement them normally.
 */
export function legacyMoneyRangePredicate(
  columns: ResolvedMoneyColumns,
  input: unknown,
): Prisma.Sql {
  const node = parseItemFilter({ version: 1, root: { kind: "purchaseMoney", test: input } }).root;
  if (node.kind !== "purchaseMoney" || node.test.op !== "range")
    throw new FilterValidationError("FILTER_INVALID");
  const range = node.test;
  unitAvailable(range.unit);
  const stored = Prisma.sql`(${columns.raw})::numeric * power(10::numeric,${range.unit.minorUnitExponent}::numeric)`;
  const bound = (value: string) =>
    Prisma.sql`${value}::numeric * power(10::numeric,(${columns.exponent})::numeric)`;
  const clauses: Prisma.Sql[] = [];
  if (range.minMinor !== undefined) clauses.push(Prisma.sql`${stored} >= ${bound(range.minMinor)}`);
  if (range.maxMinor !== undefined) clauses.push(Prisma.sql`${stored} <= ${bound(range.maxMinor)}`);
  return Prisma.sql`CASE WHEN ${columns.raw} IS NOT NULL AND ${columns.exponent} BETWEEN 0 AND 9 AND ${columns.currency}=${range.unit.currency} AND ${columns.unitKey}=${range.unit.unitKey} THEN COALESCE((${Prisma.join(clauses, " AND ")}),FALSE) ELSE FALSE END`;
}

/** Server-only independent owned/live/lifecycle predicate, before text/AST/page. */
export type AuthorizedOuterMoneyScope = { ownerId: string; predicate: Prisma.Sql };
export type LegacyMoneyPredicatePlan = {
  coverage: { selector: LegacyMoneySelector; coverage: PurchaseMoneyCoverage }[];
  compile: (leaf: ItemFilterLeaf) => Prisma.Sql;
};
function selectorKey(selector: LegacyMoneySelector): string {
  return JSON.stringify(selector);
}
function rangeLeaf(
  leaf: ItemFilterLeaf,
): { selector: LegacyMoneySelector; range: LegacyMoneyRange } | null {
  if (leaf.kind === "purchaseMoney" && leaf.test.op === "range")
    return { selector: { family: "PURCHASE" }, range: leaf.test };
  if (
    leaf.kind === "customField" &&
    leaf.predicate.valueType === "MONEY" &&
    leaf.predicate.test.op === "range"
  )
    return {
      selector: {
        family: "CUSTOM",
        collectionId: leaf.selector.collectionId,
        definitionId: leaf.selector.definitionId,
      },
      range: leaf.predicate.test,
    };
  if (
    leaf.kind === "catalogAttribute" &&
    leaf.predicate.valueType === "MONEY" &&
    leaf.predicate.test.op === "range"
  )
    return {
      selector: {
        family: "CATALOG",
        categoryTemplateId: leaf.selector.categoryTemplateId,
        definitionId: leaf.selector.definitionId,
        target: leaf.selector.target,
      },
      range: leaf.predicate.test,
    };
  return null;
}

export function moneyScopeCandidates(
  scope: AuthorizedOuterMoneyScope,
  matched?: Prisma.Sql,
): Prisma.Sql {
  return Prisma.sql`SELECT i.id ${candidateFrom} WHERE ${scope.predicate} ${matched ? Prisma.sql`AND (${matched})` : Prisma.empty}`;
}
export async function readOwnedMoneyCoverage(
  tx: BoundedSearchReadTransaction,
  scope: AuthorizedOuterMoneyScope,
  selector: LegacyMoneySelector,
): Promise<PurchaseMoneyCoverage> {
  const result = {
    selectedItems: 0,
    selectedPaths: 0,
    missingPaths: 0,
    presentPaths: 0,
    eligiblePaths: 0,
    unknownPaths: 0,
    ineligiblePaths: 0,
  };
  let selectedUnits = 0n,
    missingUnits = 0n,
    presentUnits = 0n;
  await visitOwnedMoneySelectorFacts(
    tx,
    { userId: scope.ownerId },
    selector,
    moneyScopeCandidates(scope),
    (_id, quantity, view) => {
      result.selectedItems++;
      result.selectedPaths++;
      selectedUnits += BigInt(quantity);
      if (view === null || view.interpretation.kind === "MISSING") {
        result.missingPaths++;
        missingUnits += BigInt(quantity);
      } else {
        result.presentPaths++;
        presentUnits += BigInt(quantity);
        if (view.interpretation.kind === "UNKNOWN") result.unknownPaths++;
        else if (view.interpretation.eligibility === "ELIGIBLE") result.eligiblePaths++;
        else result.ineligiblePaths++;
      }
    },
  );
  const parsed = PurchaseMoneyCoverageSchema.safeParse({
    ...result,
    selectedUnits: selectedUnits.toString(),
    missingUnits: missingUnits.toString(),
    presentUnits: presentUnits.toString(),
  });
  if (!parsed.success) return legacyMoneyFail("MONEY_DATA_INTEGRITY");
  return parsed.data;
}
export async function prepareLegacyMoneyPredicates(
  tx: BoundedSearchReadTransaction,
  scope: AuthorizedOuterMoneyScope,
  input: unknown,
): Promise<LegacyMoneyPredicatePlan> {
  const requests = collectLegacyMoneyRequests(input);
  if (requests.some((r) => r.selector.family !== "PURCHASE")) {
    const nodes = leaves(parseItemFilter(input).root).filter((node) => rangeLeaf(node) !== null);
    const [references] = await tx.$queryRaw<{ valid: boolean }[]>(
      Prisma.sql`SELECT ${referencePredicate(nodes, scope.ownerId)} AS valid`,
    );
    if (references?.valid !== true) throw new FilterValidationError("FILTER_REFERENCE_INVALID");
  }
  const coverage: LegacyMoneyPredicatePlan["coverage"] = [];
  for (const request of requests) {
    const result = await readOwnedMoneyCoverage(tx, scope, request.selector);
    if (result.unknownPaths || result.ineligiblePaths)
      throw new FilterValidationError("FILTER_UNAVAILABLE", "MONEY_INTERPRETATION_INCOMPLETE");
    coverage.push({ selector: request.selector, coverage: result });
  }
  const prepared = new Set(requests.map((request) => selectorKey(request.selector)));
  return {
    coverage,
    compile: (leaf) => {
      const request = rangeLeaf(leaf);
      if (!request || !prepared.has(selectorKey(request.selector)))
        return legacyMoneyFail("MONEY_DATA_INTEGRITY");
      const relation = ownedMoneySelectorRowsSql(
        { userId: scope.ownerId },
        request.selector,
        Prisma.sql`SELECT i.id`,
      );
      return Prisma.sql`EXISTS(SELECT 1 FROM (${relation}) mf WHERE ${legacyMoneyRangePredicate({ raw: Prisma.sql`mf.raw`, exponent: Prisma.sql`mf.exponent`, currency: Prisma.sql`mf.currency`, unitKey: Prisma.sql`mf."unitKey"` }, request.range)})`;
    },
  };
}
