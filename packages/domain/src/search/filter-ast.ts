import {
  FilterValidationError,
  parseItemFilter,
  type ItemFilterNode,
} from "@sammlerraum/contracts/search";

/** Bounded structural language validation only; does not grant query execution. */
export function validateFilterComplexity(value: unknown): void {
  parseItemFilter(value);
}

/**
 * Current producer gaps are rejected across the entire tree, in stable preorder.
 * This is not an evaluator, definition resolver, entitlement or executable permit.
 * Task2 must still resolve references and authorize the independent outer scope.
 */
export function validateCurrentFilterAvailability(value: unknown): void {
  const filter = parseItemFilter(value);
  const pending: ItemFilterNode[] = [filter.root];
  while (pending.length) {
    const node = pending.pop()!;
    if (node.kind === "and" || node.kind === "or") {
      pending.push(...node.children.toReversed());
    } else if (node.kind === "not") {
      pending.push(node.child);
    } else if (node.kind === "duplicate") {
      throw new FilterValidationError("FILTER_UNAVAILABLE", "DUPLICATE_NOT_IMPLEMENTED");
    } else if (node.kind === "marketMoney") {
      throw new FilterValidationError("FILTER_UNAVAILABLE", "MARKET_FILTER_SEAM_UNAVAILABLE");
    } else if (
      (node.kind === "purchaseMoney" && node.test.op === "range") ||
      ((node.kind === "customField" || node.kind === "catalogAttribute") &&
        node.predicate.valueType === "MONEY" &&
        node.predicate.test.op === "range")
    ) {
      throw new FilterValidationError(
        "FILTER_UNAVAILABLE",
        "LEGACY_MONEY_INTERPRETATION_UNAVAILABLE",
      );
    }
  }
}
