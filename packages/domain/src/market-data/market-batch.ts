import type { Prisma } from "@sammlerraum/db/search-sql";
import type { ItemFilterLeaf } from "@sammlerraum/contracts/search";
import type { SearchReadTransaction } from "../search/search-read";
import type { MarketDisplayPolicy } from "../valuations/market-display-policy";
import type { ProviderRegistry } from "@sammlerraum/market-data/provider-registry";
export type MarketLeaf = Extract<ItemFilterLeaf, { kind: "marketMoney" }>;
export type MarketSelector = MarketLeaf["selector"];
export type MarketPurpose = "FILTER" | "DASHBOARD_DETAIL";
export type MarketAggregateBasis = "ONE_PER_ITEM" | "CURRENT_QUANTITY";
export type MarketQueryGrant = Readonly<{
  selector: MarketSelector;
  purposes: readonly MarketPurpose[];
}>;
export type MarketAggregateGrant = Readonly<{
  selector: MarketSelector;
  semantics: "ADDITIVE_PER_UNIT_REFERENCE_VALUE";
  bases: readonly MarketAggregateBasis[];
}>;
export type MarketQueryPolicy = {
  snapshotForOwner(actorUserId: string): Readonly<{
    queryGrants: readonly MarketQueryGrant[];
    aggregateGrants: readonly MarketAggregateGrant[];
  }>;
};
export type MarketBatchUse =
  | { purpose: MarketPurpose }
  | { purpose: "DASHBOARD_AGGREGATE"; basis: MarketAggregateBasis };
export type MarketBatchDependencies = {
  displayPolicy: MarketDisplayPolicy;
  queryPolicy: MarketQueryPolicy;
  registry: ProviderRegistry;
};
export type MarketBatchScope = Readonly<{
  actorUserId: string;
  lifecycle: "ACTIVE" | "ARCHIVED" | "DISPOSED" | "ALL";
}>;
export type MarketBatchContext = {
  tx: SearchReadTransaction;
  scope: MarketBatchScope;
  ownedCandidates: Prisma.Sql;
  checkBudget(): void;
};
/** Structural surface only. Handles are admitted through private callback/transaction identity. */
export type PreparedMarketBatch = {
  readonly ctes: Prisma.Sql;
  predicate(leaf: MarketLeaf): Prisma.Sql;
};
export type MarketBatchCode =
  | "MARKET_BATCH_INVALID"
  | "MARKET_BATCH_INVARIANT"
  | "MARKET_BATCH_DEPENDENCY"
  | "MARKET_BATCH_UNAVAILABLE";
export type MarketBatchUnavailableReason =
  | "DISPLAY_DISABLED"
  | "QUERY_RIGHTS_DISABLED"
  | "AGGREGATE_UNSUPPORTED"
  | "MAPPING_AMBIGUOUS"
  | "COVERAGE_LIMIT";
/** Deliberately carries no input, provider exception or cause. */
export class MarketBatchError extends Error {
  constructor(
    readonly code: MarketBatchCode,
    readonly reason?: MarketBatchUnavailableReason,
  ) {
    super(code);
    this.name = "MarketBatchError";
  }
}

import { Prisma as Sql } from "@sammlerraum/db/search-sql";
import { CatalogSnapshotSchema } from "@sammlerraum/contracts/catalog";
import { parseItemFilter } from "@sammlerraum/contracts/search";
import { MembershipActorIdSchema } from "@sammlerraum/contracts/collaboration";
import { isReadDependencyFailure } from "../api/read-dependency-errors";
import { withMarketRights, marketSelectorKey } from "./market-query-policy";
import {
  currentMarketSnapshots,
  observedMarketCtes,
  historicalMarketSnapshots,
  eligibleMarketCtes,
  marketAmbiguity,
  MARKET_BATCH_MAX_REVISIONS,
  MARKET_BATCH_MAX_BYTES,
} from "./market-batch-sql";
type RevisionRow = {
  entryId: string;
  revision: number;
  categoryTemplateId: string;
  snapshot: unknown;
};
type Manifest = {
  entryId: string;
  revision: number;
  categoryTemplateId: string;
  variants: string[];
  identifiers: {
    id: string;
    variantId: string | null;
    namespace: string;
    type: string;
    value: string;
  }[];
};
type Envelope = { count: string; bytes: string; snapshots: RevisionRow[] };
function batchInvariant(): never {
  throw new MarketBatchError("MARKET_BATCH_INVARIANT");
}
function coverage(): never {
  throw new MarketBatchError("MARKET_BATCH_UNAVAILABLE", "COVERAGE_LIMIT");
}
function envelope(value: Envelope | undefined, priorCount = 0, priorBytes = 0) {
  if (
    !value ||
    typeof value.count !== "string" ||
    typeof value.bytes !== "string" ||
    !/^(?:0|[1-9]\d*)$/.test(value.count) ||
    !/^(?:0|[1-9]\d*)$/.test(value.bytes) ||
    !Array.isArray(value.snapshots)
  )
    return batchInvariant();
  if (
    BigInt(value.count) + BigInt(priorCount) > BigInt(MARKET_BATCH_MAX_REVISIONS) ||
    BigInt(value.bytes) + BigInt(priorBytes) > BigInt(MARKET_BATCH_MAX_BYTES)
  )
    return coverage();
  const count = Number(value.count),
    bytes = Number(value.bytes);
  if (count !== value.snapshots.length) return batchInvariant();
  return { count, bytes, rows: value.snapshots };
}
/** Mirrors the full Phase06 canonical snapshot checks, including category/identity/uniqueness.
 * Phase06's private read implementation and behavior stay unchanged. */
function manifest(row: RevisionRow, context: MarketBatchContext): Manifest | null {
  context.checkBudget();
  const parsed = CatalogSnapshotSchema.safeParse(row.snapshot);
  context.checkBudget();
  if (!parsed.success) return null;
  const s = parsed.data;
  if (
    s.id !== row.entryId ||
    s.categoryTemplateId !== row.categoryTemplateId ||
    new Set(s.variants.map((v) => v.id)).size !== s.variants.length ||
    new Set(s.identifiers.map((i) => i.id)).size !== s.identifiers.length ||
    new Set(
      s.identifiers.map((i) => JSON.stringify([i.variantId ?? null, i.namespace, i.type, i.value])),
    ).size !== s.identifiers.length ||
    !s.identifiers.every((i) => !i.variantId || s.variants.some((v) => v.id === i.variantId))
  )
    return null;
  return {
    entryId: row.entryId,
    revision: row.revision,
    categoryTemplateId: row.categoryTemplateId,
    variants: s.variants.map((v) => v.id),
    identifiers: s.identifiers.map((i) => ({
      id: i.id,
      variantId: i.variantId ?? null,
      namespace: i.namespace,
      type: i.type,
      value: i.value,
    })),
  };
}
function manifestJson(values: Manifest[], context: MarketBatchContext) {
  context.checkBudget();
  const json = JSON.stringify(values);
  if (Buffer.byteLength(json) > MARKET_BATCH_MAX_BYTES) return coverage();
  context.checkBudget();
  return json;
}
async function batchRead<T>(context: MarketBatchContext, query: Prisma.Sql): Promise<T> {
  context.checkBudget();
  try {
    const rows = await context.tx.$queryRaw<T>(query);
    context.checkBudget();
    return rows;
  } catch (error) {
    if (isReadDependencyFailure(error)) throw new MarketBatchError("MARKET_BATCH_DEPENDENCY");
    throw error;
  }
}
type BatchState = {
  active: boolean;
  context: MarketBatchContext;
  tx: SearchReadTransaction;
  actor: string;
  lifecycle: MarketBatchScope["lifecycle"];
  use: MarketBatchUse;
  selectors: readonly MarketSelector[];
  ctes: Prisma.Sql;
  candidates: Prisma.Sql;
  validate(): void;
};
const admittedBatches = new WeakMap<PreparedMarketBatch, BatchState>();
function stateFor(context: MarketBatchContext, batch: PreparedMarketBatch) {
  const state = admittedBatches.get(batch);
  if (
    !state?.active ||
    state.context !== context ||
    state.tx !== context.tx ||
    state.actor !== context.scope.actorUserId ||
    state.lifecycle !== context.scope.lifecycle ||
    state.candidates !== context.ownedCandidates
  )
    return batchInvariant();
  state.validate();
  return state;
}
/** Internal gate for the aggregate consumer; structural lookalikes and cross-context reuse fail. */
export function marketBatchForUse(
  context: MarketBatchContext,
  batch: PreparedMarketBatch,
  use: MarketBatchUse,
) {
  const state = stateFor(context, batch);
  if (
    state.use.purpose !== use.purpose ||
    (use.purpose === "DASHBOARD_AGGREGATE" &&
      (state.use.purpose !== "DASHBOARD_AGGREGATE" || state.use.basis !== use.basis))
  )
    return batchInvariant();
  return { ctes: state.ctes, selectors: state.selectors };
}
function predicateFor(state: BatchState, input: MarketLeaf): Prisma.Sql {
  let leaf: MarketLeaf;
  try {
    const root = parseItemFilter({ version: 1, root: input }).root;
    if (root.kind !== "marketMoney") return batchInvariant();
    leaf = root;
  } catch {
    return batchInvariant();
  }
  const ordinal = state.selectors.findIndex(
    (s) => marketSelectorKey(s) === marketSelectorKey(leaf.selector),
  );
  if (ordinal < 0) return batchInvariant();
  const test = leaf.test;
  let comparison: Prisma.Sql = Sql.sql`TRUE`;
  if (test.op === "range") {
    const parts: Prisma.Sql[] = [];
    if (test.minMinor !== undefined)
      parts.push(Sql.sql`ml."amountMinor">=${test.minMinor}::numeric`);
    if (test.maxMinor !== undefined)
      parts.push(Sql.sql`ml."amountMinor"<=${test.maxMinor}::numeric`);
    comparison = Sql.sql`(${Sql.join(parts, " AND ")})`;
  } else if (test.op === "overlaps")
    comparison = Sql.sql`ml."lowMinor"<=${test.maxMinor}::numeric AND ml."highMinor">=${test.minMinor}::numeric`;
  else if (test.op === "containedBy")
    comparison = Sql.sql`ml."lowMinor">=${test.minMinor}::numeric AND ml."highMinor"<=${test.maxMinor}::numeric`;
  const exists = Sql.sql`EXISTS(SELECT 1 FROM market_latest ml WHERE ml."itemId"=i.id AND ml."selectorOrdinal"=${ordinal} AND ${comparison})`;
  return test.op === "missing" ? Sql.sql`NOT (${exists})` : exists;
}
async function consumeBatch<T>(
  context: MarketBatchContext,
  selectors: readonly MarketSelector[],
  use: MarketBatchUse,
  ctes: Prisma.Sql,
  consume: (batch: PreparedMarketBatch) => Promise<T>,
  validate: () => void,
): Promise<T> {
  validate();
  const capturedUse = Object.freeze(
    use.purpose === "DASHBOARD_AGGREGATE"
      ? { purpose: use.purpose, basis: use.basis }
      : { purpose: use.purpose },
  );
  const state: BatchState = {
    active: true,
    context,
    tx: context.tx,
    actor: context.scope.actorUserId,
    lifecycle: context.scope.lifecycle,
    use: capturedUse,
    selectors,
    ctes,
    candidates: context.ownedCandidates,
    validate,
  };
  const handle: PreparedMarketBatch = Object.freeze({
    get ctes() {
      return stateFor(context, handle).ctes;
    },
    predicate(leaf: MarketLeaf) {
      return predicateFor(stateFor(context, handle), leaf);
    },
  });
  admittedBatches.set(handle, state);
  try {
    const result = await consume(handle);
    stateFor(context, handle);
    return result;
  } finally {
    state.active = false;
  }
}
export async function withMarketBatch<T>(
  context: MarketBatchContext,
  selectors: readonly MarketSelector[],
  use: MarketBatchUse,
  dependencies: MarketBatchDependencies,
  consume: (batch: PreparedMarketBatch) => Promise<T>,
): Promise<T> {
  if (
    !context ||
    !MembershipActorIdSchema.safeParse(context.scope?.actorUserId).success ||
    !["ACTIVE", "ARCHIVED", "DISPOSED", "ALL"].includes(context.scope.lifecycle) ||
    typeof context.tx?.$queryRaw !== "function" ||
    typeof context.checkBudget !== "function"
  )
    return batchInvariant();
  context.checkBudget();
  const initial = {
    tx: context.tx,
    actor: context.scope.actorUserId,
    lifecycle: context.scope.lifecycle,
    candidates: context.ownedCandidates,
    budget: context.checkBudget,
  };
  const validate = () => {
    if (
      context.tx !== initial.tx ||
      context.scope.actorUserId !== initial.actor ||
      context.scope.lifecycle !== initial.lifecycle ||
      context.ownedCandidates !== initial.candidates ||
      context.checkBudget !== initial.budget
    )
      return batchInvariant();
    initial.budget();
  };
  const readContext: MarketBatchContext = {
    tx: initial.tx,
    scope: Object.freeze({ actorUserId: initial.actor, lifecycle: initial.lifecycle }),
    ownedCandidates: initial.candidates,
    checkBudget: validate,
  };
  const result = await withMarketRights(
    initial.actor,
    selectors,
    use,
    dependencies,
    async (receipt) => {
      if (!receipt.selectors.length)
        return consumeBatch(
          context,
          receipt.selectors,
          receipt.use,
          Sql.sql`market_latest AS (SELECT NULL::uuid AS "itemId",NULL::bigint AS "amountMinor",NULL::text AS "sourceMetric" WHERE false)`,
          consume,
          validate,
        );
      const [rawCurrent] = await batchRead<
        (Envelope & { missing: boolean | null; identifierOverflow: boolean })[]
      >(readContext, currentMarketSnapshots(readContext.ownedCandidates));
      if (
        typeof rawCurrent?.identifierOverflow !== "boolean" ||
        (rawCurrent.missing !== null && typeof rawCurrent.missing !== "boolean")
      )
        return batchInvariant();
      if (rawCurrent.identifierOverflow) return coverage();
      if (rawCurrent?.missing) return batchInvariant();
      const current = envelope(rawCurrent);
      const manifests: Manifest[] = [];
      for (const row of current.rows) {
        const parsed = manifest(row, readContext);
        if (!parsed) return batchInvariant();
        manifests.push(parsed);
      }
      const currentJson = manifestJson(manifests, readContext),
        selectorsJson = JSON.stringify(
          receipt.selectors.map((s, selectorOrdinal) => ({ selectorOrdinal, ...s })),
        );
      const observed = observedMarketCtes(readContext.ownedCandidates, selectorsJson, currentJson);
      const [rawHistory] = await batchRead<Envelope[]>(
        readContext,
        historicalMarketSnapshots(observed, current.count, current.bytes),
      );
      const history = envelope(rawHistory, current.count, current.bytes);
      for (const row of history.rows) {
        const parsed = manifest(row, readContext);
        if (parsed) manifests.push(parsed);
      }
      const eligible = eligibleMarketCtes(observed, manifestJson(manifests, readContext));
      const [guard] = await batchRead<{ ambiguous: boolean }[]>(
        readContext,
        marketAmbiguity(eligible),
      );
      if (typeof guard?.ambiguous !== "boolean") return batchInvariant();
      if (guard.ambiguous)
        throw new MarketBatchError("MARKET_BATCH_UNAVAILABLE", "MAPPING_AMBIGUOUS");
      return consumeBatch(context, receipt.selectors, receipt.use, eligible, consume, validate);
    },
  );
  validate();
  return result;
}
