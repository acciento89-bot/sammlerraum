import { randomUUID } from "node:crypto";
import type { ProviderRegistry } from "@sammlerraum/market-data/provider-registry";
import type { CatalogMarketTarget, MarketFetchRequest } from "@sammlerraum/market-data/types";
import { CatalogSnapshotSchema } from "@sammlerraum/contracts/catalog";
import {
  MarketDataError,
  identityKey,
  instant,
  invalid,
  object,
  parseBatch,
  semantic,
  target as validateTarget,
  uuid,
  request as validateRequest,
  text,
  stable,
  type NormalizedObservation,
} from "./validation";
export { MarketDataError } from "./validation";
export type MarketTransaction = {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};
export type MarketDatabase = {
  $transaction<T>(
    work: (tx: MarketTransaction) => Promise<T>,
    options: { isolationLevel: "ReadCommitted" },
  ): Promise<T>;
};
export type StoredMarketObservation = NormalizedObservation & { id: string; createdAt: Date };
export type RecordResult = { ids: string[]; inserted: number; reused: number };
export type MarketCursor = { observedAt: string; createdAt: string; id: string };
const mismatch = (): never => {
  throw new MarketDataError("MARKET_CATALOG_MISMATCH");
};
async function utc(tx: MarketTransaction) {
  await tx.$queryRaw`SELECT set_config('TimeZone','UTC',true)`;
}
async function lockTarget(
  tx: MarketTransaction,
  input: { entryId: string; variantId: string | null; identifierId: string },
  registry: ProviderRegistry,
  providerId: string,
  expected?: CatalogMarketTarget,
): Promise<CatalogMarketTarget> {
  const registration = registry.get(providerId);
  const [entry] = await tx.$queryRaw<
    Array<{ revision: number }>
  >`SELECT revision FROM "CatalogEntry" WHERE id=${input.entryId}::uuid FOR SHARE`;
  if (!entry) return mismatch();
  if (input.variantId !== null) {
    const variants = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM "CatalogVariant" WHERE id=${input.variantId}::uuid AND "entryId"=${input.entryId}::uuid AND active FOR SHARE`;
    if (variants.length !== 1) return mismatch();
  }
  if (expected && entry.revision !== expected.revision)
    throw new MarketDataError("MARKET_CATALOG_STALE");
  const [history] = await tx.$queryRaw<
    Array<{ snapshot: unknown }>
  >`SELECT snapshot FROM "CatalogRevision" WHERE "entryId"=${input.entryId}::uuid AND revision=${entry.revision}`;
  const parsed = CatalogSnapshotSchema.safeParse(history?.snapshot);
  if (!parsed.success) return mismatch();
  const snapshot = parsed.data;
  if (
    snapshot.id !== input.entryId ||
    (input.variantId !== null && !snapshot.variants.some((v) => v.id === input.variantId))
  )
    return mismatch();
  const identifier = snapshot.identifiers.find(
    (i) =>
      i.id === input.identifierId &&
      (i.variantId ?? null) === input.variantId &&
      i.namespace === registration.identifierNamespace &&
      i.type === registration.identifierType,
  );
  if (!identifier) return mismatch();
  const live = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM "CatalogExternalIdentifier" WHERE id=${identifier.id}::uuid AND "entryId"=${input.entryId}::uuid AND "variantId" IS NOT DISTINCT FROM ${input.variantId}::uuid AND active AND namespace=${identifier.namespace} AND type=${identifier.type} AND value=${identifier.value}`;
  if (live.length !== 1) return mismatch();
  if (
    expected &&
    (expected.namespace !== identifier.namespace ||
      expected.identifierType !== identifier.type ||
      expected.externalId !== identifier.value)
  )
    return mismatch();
  // Enforce external ID bounds even for maintenance-authored catalog rows.
  const result = {
    ...input,
    revision: entry.revision,
    namespace: identifier.namespace,
    identifierType: identifier.type,
    externalId: identifier.value,
  };
  return validateTarget(result);
}
/** Trusted server-only ingestion of global catalog facts. No item/user authorization or HTTP route.
 * Task3 must atomically insert its committed-sync receipt using recordObservationsInTransaction.
 * Native UPDATE is forbidden; privileged provider-scoped DELETE remains possible for license purge.
 */
export function createMarketDataService(database: MarketDatabase, registry: ProviderRegistry) {
  const within = <T>(work: (tx: MarketTransaction) => Promise<T>) =>
    database.$transaction(
      async (tx) => {
        await utc(tx);
        return work(tx);
      },
      { isolationLevel: "ReadCommitted" },
    );
  async function prepareFetchRequest(
    providerId: string,
    input: unknown,
  ): Promise<MarketFetchRequest> {
    registry.get(providerId);
    const v = object(input, ["entryId", "variantId", "identifierId", "pollId"]);
    const ids = {
      entryId: uuid(v.entryId),
      variantId: v.variantId === null ? null : uuid(v.variantId),
      identifierId: uuid(v.identifierId),
    };
    const pollId = uuid(v.pollId);
    return within(async (tx) => ({
      pollId,
      target: await lockTarget(tx, ids, registry, providerId),
    }));
  }
  function prepareRecord(providerId: string, observations: unknown, context: unknown) {
    registry.get(providerId);
    const parsed = parseBatch(providerId, observations, context);
    const unique = new Map<string, NormalizedObservation>();
    for (const row of parsed.rows) {
      const key = identityKey(row);
      const prior = unique.get(key);
      if (prior && semantic(prior) !== semantic(row))
        throw new MarketDataError("MARKET_OBSERVATION_CONFLICT");
      unique.set(key, row);
    }
    return { providerId, parsed, unique };
  }
  async function persistRecord(
    tx: MarketTransaction,
    prepared: ReturnType<typeof prepareRecord>,
  ): Promise<RecordResult> {
    const { providerId, parsed, unique } = prepared;
    await utc(tx);
    await lockTarget(tx, parsed.request.target, registry, providerId, parsed.request.target);
    const [clock] = await tx.$queryRaw<
      Array<{ now: Date }>
    >`SELECT date_trunc('milliseconds',clock_timestamp()) AS now`;
    if (!clock || parsed.fetchedAt > clock.now) return invalid();
    const result: RecordResult = { ids: [], inserted: 0, reused: 0 };
    for (const [, r] of [...unique].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      const rows = await tx.$queryRaw<StoredMarketObservation[]>`
        INSERT INTO "MarketObservation" (id,"providerId","externalId","identityMode","eventId","pollId","sourceMetric",kind,"entryId","variantId","catalogRevision","identifierId","identifierNamespace","identifierType",qualifiers,currency,"minorUnitExponent","amountMinor","lowMinor","highMinor","observedAt","fetchedAt","createdAt","observedBasis","observedPrecision","sourceUrl","sourceReference",confidence)
        VALUES (${randomUUID()}::uuid,${r.providerId},${r.externalId},${r.identityMode}::"MarketIdentityMode",${r.eventId},${r.pollId}::uuid,${r.sourceMetric},${r.kind}::"MarketObservationKind",${r.entryId}::uuid,${r.variantId}::uuid,${r.catalogRevision},${r.identifierId}::uuid,${r.identifierNamespace},${r.identifierType},${JSON.stringify(r.qualifiers)}::jsonb,${r.currency},${r.minorUnitExponent},${r.amountMinor},${r.lowMinor},${r.highMinor},${r.observedAt.toISOString()}::timestamptz,${r.fetchedAt.toISOString()}::timestamptz,${clock.now.toISOString()}::timestamptz,${r.observedBasis}::"MarketObservedBasis",${r.observedPrecision}::"MarketObservedPrecision",${r.sourceUrl},${r.sourceReference},${r.confidence === null ? null : JSON.stringify(r.confidence)}::jsonb)
        ON CONFLICT DO NOTHING RETURNING *`;
      let row = rows[0];
      if (row) {
        result.inserted++;
      } else {
        const [existing] = await tx.$queryRaw<
          StoredMarketObservation[]
        >`SELECT * FROM "MarketObservation" WHERE "providerId"=${r.providerId} AND "externalId"=${r.externalId} AND "identityMode"=${r.identityMode}::"MarketIdentityMode" AND "eventId" IS NOT DISTINCT FROM ${r.eventId} AND "pollId" IS NOT DISTINCT FROM ${r.pollId}::uuid AND "sourceMetric"=${r.sourceMetric} AND kind=${r.kind}::"MarketObservationKind" AND currency=${r.currency} AND qualifiers=${JSON.stringify(r.qualifiers)}::jsonb`;
        if (!existing) throw new MarketDataError("MARKET_OBSERVATION_CONFLICT");
        const { id: _id, createdAt: _created, ...content } = existing;
        if (semantic(content) !== semantic(r))
          throw new MarketDataError("MARKET_OBSERVATION_CONFLICT");
        row = existing;
        result.reused++;
      }
      result.ids.push(row.id);
    }
    return result;
  }
  async function recordObservationsInTransaction(
    tx: MarketTransaction,
    providerId: string,
    observations: unknown,
    context: unknown,
  ): Promise<RecordResult> {
    return persistRecord(tx, prepareRecord(providerId, observations, context));
  }
  async function recordObservations(
    providerId: string,
    observations: unknown,
    context: unknown,
  ): Promise<RecordResult> {
    const prepared = prepareRecord(providerId, observations, context);
    return within((tx) => persistRecord(tx, prepared));
  }
  /** Internal source-specific bounded history. The API consumer must enforce display entitlement. */
  async function listObservations(
    input: unknown,
  ): Promise<{ records: StoredMarketObservation[]; nextCursor: MarketCursor | null }> {
    const v = object(input, [
      "entryId",
      "variantId",
      "providerId",
      "kind",
      "currency",
      "limit",
      "cursor",
    ]);
    const entryId = uuid(v.entryId),
      variantId = v.variantId === null ? null : uuid(v.variantId);
    if (typeof v.providerId !== "string") return invalid();
    registry.get(v.providerId);
    const providerId = v.providerId;
    const limit = v.limit ?? 50;
    if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100)
      return invalid();
    // Filters are validated with the same observation contract without any monetary conversion.
    const kind = v.kind ?? null,
      currency = v.currency ?? null;
    if (
      kind !== null &&
      ![
        "LAST_SOLD",
        "SOLD_AVERAGE",
        "SOLD_MEDIAN",
        "ASKING_PRICE",
        "PRICE_RANGE",
        "CATALOG_VALUE",
        "DEALER_PRICE",
      ].includes(kind as string)
    )
      return invalid();
    // Historical currency reads must not depend on today's ISO membership.
    if (
      currency !== null &&
      (typeof currency !== "string" || currency.length !== 3 || !/^[A-Z]{3}$/u.test(currency))
    )
      return invalid();
    let cursor: { observedAt: Date; createdAt: Date; id: string } | null = null;
    if (v.cursor !== undefined && v.cursor !== null) {
      const c = object(v.cursor, ["observedAt", "createdAt", "id"]);
      cursor = {
        observedAt: instant(c.observedAt),
        createdAt: instant(c.createdAt),
        id: uuid(c.id),
      };
      if (cursor.observedAt > cursor.createdAt) return invalid();
    }
    return within(async (tx) => {
      const rows = await tx.$queryRaw<
        StoredMarketObservation[]
      >`SELECT * FROM "MarketObservation" WHERE "entryId"=${entryId}::uuid AND "variantId" IS NOT DISTINCT FROM ${variantId}::uuid AND "providerId"=${providerId} AND (${kind}::"MarketObservationKind" IS NULL OR kind=${kind}::"MarketObservationKind") AND (${currency}::text IS NULL OR currency=${currency}) AND (${cursor === null} OR ("observedAt","createdAt",id)<(${cursor?.observedAt.toISOString() ?? null}::timestamptz,${cursor?.createdAt.toISOString() ?? null}::timestamptz,${cursor?.id ?? null}::uuid)) ORDER BY "observedAt" DESC,"createdAt" DESC,id DESC LIMIT ${limit + 1}`;
      const records = rows.slice(0, limit);
      const last = records.at(-1);
      return {
        records,
        nextCursor:
          rows.length > limit && last
            ? {
                observedAt: last.observedAt.toISOString(),
                createdAt: last.createdAt.toISOString(),
                id: last.id,
              }
            : null,
      };
    });
  }
  return {
    prepareFetchRequest,
    recordObservations,
    recordObservationsInTransaction,
    listObservations,
  };
}

/** Strict server-only persisted sync envelope. Shares ingestion's exact request parser. */
export function parseMarketSyncPayload(input: unknown) {
  const v = object(input, ["providerId", "pollId", "target"]);
  const providerId = text(v.providerId, 64);
  if (!/^[a-z][a-z0-9_-]{0,63}$/u.test(providerId)) return invalid();
  const request = validateRequest({ pollId: v.pollId, target: v.target });
  const payload = { providerId, ...request };
  if (Buffer.byteLength(stable(payload)) > 2048) return invalid();
  return payload;
}
export type MarketSyncPayload = ReturnType<typeof parseMarketSyncPayload>;
export function sameMarketSyncRequest(left: unknown, right: unknown): boolean {
  return stable(parseMarketSyncPayload(left)) === stable(parseMarketSyncPayload(right));
}
