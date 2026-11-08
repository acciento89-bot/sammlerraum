import { parseItemFilter, FilterValidationError } from "@sammlerraum/contracts/search";
import { MembershipActorIdSchema } from "@sammlerraum/contracts/collaboration";
import { displayGrants } from "../valuations/market-display-policy";
import {
  MarketBatchError,
  type MarketSelector,
  type MarketQueryPolicy,
  type MarketBatchDependencies,
  type MarketBatchUse,
  type MarketQueryGrant,
  type MarketAggregateGrant,
} from "./market-batch";
const empty = Object.freeze({ queryGrants: Object.freeze([]), aggregateGrants: Object.freeze([]) });
export const emptyMarketQueryPolicy: MarketQueryPolicy = Object.freeze({
  snapshotForOwner: () => empty,
});
function invariant(): never {
  throw new MarketBatchError("MARKET_BATCH_INVARIANT");
}
function unavailable(
  reason: "DISPLAY_DISABLED" | "QUERY_RIGHTS_DISABLED" | "AGGREGATE_UNSUPPORTED",
): never {
  throw new MarketBatchError("MARKET_BATCH_UNAVAILABLE", reason);
}
function shape(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    return invariant();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.keys(descriptors).sort().join(",") !== [...keys].sort().join(",") ||
    Object.values(descriptors).some((d) => !("value" in d))
  )
    return invariant();
}
function selector(input: unknown): MarketSelector {
  try {
    const leaf = parseItemFilter({
      version: 1,
      root: { kind: "marketMoney", selector: input, test: { op: "present" } },
    }).root;
    if (leaf.kind !== "marketMoney") return invariant();
    const qualifiers = Object.fromEntries(
      Object.entries(leaf.selector.qualifiers).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    return Object.freeze({ ...leaf.selector, qualifiers: Object.freeze(qualifiers) });
  } catch {
    return invariant();
  }
}
export function marketSelectorKey(input: unknown) {
  return JSON.stringify(selector(input));
}
function members<T extends string>(input: unknown, allowed: readonly T[]): readonly T[] {
  if (
    !Array.isArray(input) ||
    input.length > 2 ||
    input.some((v) => !allowed.includes(v)) ||
    new Set(input).size !== input.length
  )
    return invariant();
  return Object.freeze([...input].sort()) as readonly T[];
}
function registration(value: MarketSelector, deps: MarketBatchDependencies, configured: boolean) {
  try {
    const actual = deps.registry.get(value.providerId);
    if (
      actual.identifierNamespace !== value.identifierNamespace ||
      actual.identifierType !== value.identifierType
    )
      throw Error();
  } catch {
    if (configured) return invariant();
    return unavailable("QUERY_RIGHTS_DISABLED");
  }
}
function snapshot(actor: string, deps: MarketBatchDependencies) {
  try {
    const display = displayGrants(deps.displayPolicy, deps.registry, actor),
      raw = deps.queryPolicy.snapshotForOwner(actor);
    shape(raw, ["queryGrants", "aggregateGrants"]);
    if (
      !Array.isArray(raw.queryGrants) ||
      !Array.isArray(raw.aggregateGrants) ||
      raw.queryGrants.length > 50 ||
      raw.aggregateGrants.length > 50
    )
      return invariant();
    const query: MarketQueryGrant[] = [],
      aggregate: MarketAggregateGrant[] = [],
      seenQuery = new Set<string>(),
      seenAggregate = new Set<string>();
    for (const value of raw.queryGrants) {
      shape(value, ["selector", "purposes"]);
      const item = selector(value.selector),
        key = marketSelectorKey(item);
      registration(item, deps, true);
      if (seenQuery.has(key)) return invariant();
      seenQuery.add(key);
      query.push(
        Object.freeze({
          selector: item,
          purposes: members(value.purposes, ["FILTER", "DASHBOARD_DETAIL"] as const),
        }),
      );
    }
    for (const value of raw.aggregateGrants) {
      shape(value, ["selector", "semantics", "bases"]);
      const item = selector(value.selector),
        key = marketSelectorKey(item);
      registration(item, deps, true);
      if (seenAggregate.has(key) || value.semantics !== "ADDITIVE_PER_UNIT_REFERENCE_VALUE")
        return invariant();
      seenAggregate.add(key);
      aggregate.push(
        Object.freeze({
          selector: item,
          semantics: "ADDITIVE_PER_UNIT_REFERENCE_VALUE",
          bases: members(value.bases, ["ONE_PER_ITEM", "CURRENT_QUANTITY"] as const),
        }),
      );
    }
    return Object.freeze({
      display,
      query: Object.freeze(query),
      aggregate: Object.freeze(aggregate),
    });
  } catch {
    return invariant();
  }
}
function admitted(
  actor: string,
  selectors: readonly MarketSelector[],
  use: MarketBatchUse,
  deps: MarketBatchDependencies,
) {
  // Validate requested registrations before policy lookup so unknown public provider identity
  // becomes closed unavailability, not a leaked registry exception or a fake missing price.
  for (const item of selectors) registration(item, deps, false);
  const current = snapshot(actor, deps);
  for (const item of selectors) {
    if (
      !current.display.some(
        (g) =>
          g.providerId === item.providerId &&
          g.identifierNamespace === item.identifierNamespace &&
          g.identifierType === item.identifierType,
      )
    )
      return unavailable("DISPLAY_DISABLED");
    const key = marketSelectorKey(item);
    if (use.purpose === "DASHBOARD_AGGREGATE") {
      if (
        !current.aggregate.some(
          (g) => marketSelectorKey(g.selector) === key && g.bases.includes(use.basis),
        )
      )
        return unavailable("AGGREGATE_UNSUPPORTED");
    } else if (
      !current.query.some(
        (g) => marketSelectorKey(g.selector) === key && g.purposes.includes(use.purpose),
      )
    )
      return unavailable("QUERY_RIGHTS_DISABLED");
  }
}
/** Safe selector discovery: only independently registered display+FILTER rights, never provider I/O. */
export function listMarketFilterSelectors(
  actor: string,
  deps: MarketBatchDependencies,
): readonly MarketSelector[] {
  if (!MembershipActorIdSchema.safeParse(actor).success) return invariant();
  const current = snapshot(actor, deps);
  return Object.freeze(
    current.query
      .filter(
        (grant) =>
          grant.purposes.includes("FILTER") &&
          current.display.some(
            (display) =>
              display.providerId === grant.selector.providerId &&
              display.identifierNamespace === grant.selector.identifierNamespace &&
              display.identifierType === grant.selector.identifierType,
          ),
      )
      .map((grant) => grant.selector),
  );
}
/** Rights receipt only, not proof of catalog eligibility, transaction scope, or executable SQL. */
export function captureMarketRights(
  actor: string,
  requests: readonly MarketSelector[],
  use: MarketBatchUse,
  supplied: MarketBatchDependencies,
) {
  if (
    !MembershipActorIdSchema.safeParse(actor).success ||
    !Array.isArray(requests) ||
    requests.length > 50
  )
    return invariant();
  if (use?.purpose === "DASHBOARD_AGGREGATE") {
    shape(use, ["purpose", "basis"]);
    if (!["ONE_PER_ITEM", "CURRENT_QUANTITY"].includes(use.basis)) return invariant();
  } else {
    shape(use, ["purpose"]);
    if (!["FILTER", "DASHBOARD_DETAIL"].includes(use.purpose)) return invariant();
  }
  const capturedUse: MarketBatchUse = Object.freeze(
    use.purpose === "DASHBOARD_AGGREGATE"
      ? { purpose: use.purpose, basis: use.basis }
      : { purpose: use.purpose },
  );
  const deps = Object.freeze({
    displayPolicy: supplied.displayPolicy,
    queryPolicy: supplied.queryPolicy,
    registry: supplied.registry,
  });
  const values = requests.map(selector),
    seen = new Set<string>();
  const selectors = Object.freeze(
    values.filter((v) => {
      const key = marketSelectorKey(v);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
  if (selectors.length) admitted(actor, selectors, capturedUse, deps);
  return Object.freeze({
    selectors,
    use: capturedUse,
    assertCurrent() {
      if (selectors.length) admitted(actor, selectors, capturedUse, deps);
    },
  });
}
export async function withMarketRights<T>(
  actor: string,
  selectors: readonly MarketSelector[],
  use: MarketBatchUse,
  deps: MarketBatchDependencies,
  consume: (receipt: ReturnType<typeof captureMarketRights>) => Promise<T>,
): Promise<T> {
  const receipt = captureMarketRights(actor, selectors, use, deps),
    result = await consume(receipt);
  receipt.assertCurrent();
  return result;
}
export function marketBatchFilterError(error: unknown): FilterValidationError | null {
  if (!(error instanceof MarketBatchError) || error.code !== "MARKET_BATCH_UNAVAILABLE")
    return null;
  const reasons = {
    DISPLAY_DISABLED: "MARKET_DISPLAY_DISABLED",
    QUERY_RIGHTS_DISABLED: "MARKET_QUERY_RIGHTS_DISABLED",
    MAPPING_AMBIGUOUS: "MARKET_MAPPING_AMBIGUOUS",
    COVERAGE_LIMIT: "CAPABILITY_SNAPSHOT_LIMIT",
  } as const;
  return error.reason && error.reason in reasons
    ? new FilterValidationError("FILTER_UNAVAILABLE", reasons[error.reason as keyof typeof reasons])
    : null;
}
