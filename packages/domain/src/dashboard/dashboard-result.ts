import { currencyMinorUnitExponent } from "../money/currencies";
import { searchFail } from "@sammlerraum/contracts/item-search";
import {
  DashboardDataSchema,
  DASHBOARD_MAX_RESPONSE_BYTES,
  type DashboardData,
} from "@sammlerraum/contracts/dashboard";
export type Schema<T> = {
  safeParse(value: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: {
          issues: readonly {
            code: string;
            origin?: string | undefined;
            params?: Record<string, unknown> | undefined;
          }[];
        };
      };
};
export function checkedDashboardPart<T>(
  schema: Schema<T>,
  value: unknown,
  checkBudget: () => void,
): T {
  checkBudget();
  const parsed = schema.safeParse(value);
  checkBudget();
  if (!parsed.success) {
    if (
      parsed.error.issues.some(
        (issue) =>
          (issue.code === "custom" && issue.params?.dashboardCapacity === true) ||
          (issue.code === "too_big" && issue.origin === "array"),
      )
    )
      return searchFail("SEARCH_UNAVAILABLE");
    return searchFail("SEARCH_INVARIANT");
  }
  return parsed.data;
}
/** Validate the bounded wire object while still inside the caller's transaction budget. */
export function finalizeDashboard(value: unknown, checkBudget: () => void): DashboardData {
  const result = checkedDashboardPart(DashboardDataSchema, value, checkBudget);
  // Shape validation alone does not establish a supported currency/exponent pair.
  // SQL separately validates the chosen prior point, including excluded histories.
  for (const group of [
    ...(result.manualValues.groups ?? []),
    ...(result.manualChange.groups ?? []),
  ]) {
    let exponent: number;
    try {
      exponent = currencyMinorUnitExponent(group.currency);
    } catch {
      return searchFail("SEARCH_INVARIANT");
    }
    if (exponent !== group.minorUnitExponent) return searchFail("SEARCH_INVARIANT");
  }
  checkBudget();
  const bytes = Buffer.byteLength(JSON.stringify(result));
  checkBudget();
  if (bytes > DASHBOARD_MAX_RESPONSE_BYTES) return searchFail("SEARCH_UNAVAILABLE");
  return result;
}
