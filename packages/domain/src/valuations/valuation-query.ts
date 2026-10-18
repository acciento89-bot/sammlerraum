import { CatalogSnapshotSchema, type CatalogSnapshot } from "@sammlerraum/contracts/catalog";
import {
  ManualValuationSchema,
  ValuationSummarySchema,
  SourceHistorySchema,
  SummaryQuerySchema,
  SourceHistoryQuerySchema,
  ValuationIdSchema,
  MarketKindSchema,
  VALUATION_MAX_RESPONSE_BYTES,
  type ManualValuationDto,
  type MarketObservationDto,
  type ValuationSummaryDto,
  type SourceHistoryDto,
  type SourceKey,
  type ItemContext,
  type TimeKey,
  type MarketScope,
  type SummaryOptions,
  type SourceHistoryOptions,
} from "@sammlerraum/contracts/valuations";
import { ProviderRegistry } from "@sammlerraum/market-data/provider-registry";
import type { StoredMarketObservation } from "../market-data/market-data-service";
import type { ManualValuation } from "./valuation-service";
import {
  displayGrants,
  emptyMarketDisplayPolicy,
  type MarketDisplayPolicy,
} from "./market-display-policy";
import {
  decodeManualCursor,
  decodeGroupCursor,
  decodeSourceSelector,
  decodeSourceHistoryCursor,
  encodeValuationToken,
  ValuationQueryError,
} from "./valuation-cursors";
export { ValuationQueryError } from "./valuation-cursors";
export type ValuationReadTransaction = {
  $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};
export type ValuationQueryDatabase = {
  $transaction<T>(
    work: (tx: ValuationReadTransaction) => Promise<T>,
    options: { isolationLevel: "RepeatableRead"; maxWait: number; timeout: number },
  ): Promise<T>;
};
export type TrustedValuationActor = { userId: string };
const fail = (code: ConstructorParameters<typeof ValuationQueryError>[0]): never => {
  throw new ValuationQueryError(code);
};
export function toManualValuationDto(row: ManualValuation): ManualValuationDto {
  const parsed = ManualValuationSchema.safeParse({
    id: row.id,
    type: row.type,
    basis: row.basis,
    amountMinor: row.amountMinor.toString(),
    currency: row.currency,
    minorUnitExponent: row.minorUnitExponent,
    note: row.note,
    observedAt: row.observedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  });
  if (!parsed.success) return fail("VALUATION_INVARIANT");
  return parsed.data;
}
const timeKey = (r: { observedAt: Date; createdAt: Date; id: string }): TimeKey => ({
  observedAt: r.observedAt.toISOString(),
  createdAt: r.createdAt.toISOString(),
  id: r.id,
});
const keyOf = (r: StoredMarketObservation): SourceKey => ({
  providerId: r.providerId,
  identifierNamespace: r.identifierNamespace,
  identifierType: r.identifierType,
  externalId: r.externalId,
  kind: r.kind,
  currency: r.currency,
});
const sameKey = (a: SourceKey, b: SourceKey) =>
  a.providerId === b.providerId &&
  a.identifierNamespace === b.identifierNamespace &&
  a.identifierType === b.identifierType &&
  a.externalId === b.externalId &&
  a.kind === b.kind &&
  a.currency === b.currency;
const sameContext = (a: ItemContext, b: ItemContext) =>
  a.itemId === b.itemId &&
  a.entryId === b.entryId &&
  a.variantId === b.variantId &&
  a.revision === b.revision;
function errorCode(error: unknown, depth = 0): string | undefined {
  if (!error || typeof error !== "object" || depth > 5) return;
  const e = error as Record<string, unknown>;
  for (const key of ["code", "originalCode"])
    if (
      typeof e[key] === "string" &&
      [
        "40001",
        "40P01",
        "57014",
        "55P03",
        "P2028",
        "P2024",
        "P2034",
        "ETIMEDOUT",
        "ECONNREFUSED",
        "08006",
        "25P04",
      ].includes(e[key])
    )
      return e[key];
  for (const key of ["meta", "cause", "driverAdapterError"]) {
    const code = errorCode(e[key], depth + 1);
    if (code) return code;
  }
}
export function isValuationDependencyFailure(error: unknown): boolean {
  return errorCode(error) !== undefined;
}
function checkedDto<T>(
  value: unknown,
  schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } },
): T {
  const parsed = schema.safeParse(value);
  if (
    !parsed.success ||
    Buffer.byteLength(JSON.stringify(parsed.data)) > VALUATION_MAX_RESPONSE_BYTES
  )
    return fail("VALUATION_INVARIANT");
  return parsed.data;
}
type Item = {
  quantity: number;
  archivedAt: Date | null;
  disposedAt: Date | null;
  catalogEntryId: string | null;
  catalogVariantId: string | null;
};
/** One RepeatableRead MVCC snapshot per response. Collection then item locks; no catalog locks.
 * Overall processing/acquisition/retry budget 12s; each transaction <=5s, each SQL <=2s,
 * lock wait <=500ms. Auth and response transfer occur outside this domain budget.
 */
export function createValuationQuery(
  database: ValuationQueryDatabase,
  policy: MarketDisplayPolicy = emptyMarketDisplayPolicy,
  registry: ProviderRegistry = new ProviderRegistry(),
) {
  async function read(
    itemIdInput: string,
    actor: TrustedValuationActor,
    input: SummaryOptions | SourceHistoryOptions,
    sourceView: boolean,
  ): Promise<ValuationSummaryDto | SourceHistoryDto> {
    const id = ValuationIdSchema.safeParse(itemIdInput);
    if (
      !id.success ||
      !actor ||
      typeof actor.userId !== "string" ||
      !actor.userId ||
      actor.userId.includes("\0")
    )
      return fail("VALUATION_INVALID");
    const itemId = id.data;
    const summary = sourceView ? null : SummaryQuerySchema.safeParse(input);
    const source = sourceView ? SourceHistoryQuerySchema.safeParse(input) : null;
    if ((summary && !summary.success) || (source && !source.success))
      return fail("VALUATION_INVALID");
    const opts = summary?.success ? summary.data : null,
      src = source?.success ? source.data : null;
    const manualCursor = opts?.manualCursor ? decodeManualCursor(opts.manualCursor) : null;
    const groupCursor = opts?.groupCursor ? decodeGroupCursor(opts.groupCursor) : null;
    const selector = src ? decodeSourceSelector(src.source) : null;
    const historyCursor = src?.cursor ? decodeSourceHistoryCursor(src.cursor) : null;
    const scope = opts?.scope ?? selector!.scope;
    if (manualCursor && manualCursor.itemId !== itemId) return fail("VALUATION_INVALID");
    for (const c of [groupCursor, selector, historyCursor])
      if (c && (c.context.itemId !== itemId || c.scope !== scope)) return fail("VALUATION_INVALID");
    if (
      historyCursor &&
      selector &&
      (!sameKey(historyCursor.key, selector.key) ||
        !sameContext(historyCursor.context, selector.context))
    )
      return fail("VALUATION_INVALID");
    const grants = displayGrants(policy, registry, actor.userId).filter(
      (g) => scope === "CURRENT_MAPPING" || g.allowHistorical,
    );
    const stop = performance.now() + 12000;
    for (let attempt = 0; attempt < 3; attempt++) {
      const remaining = Math.floor(stop - performance.now());
      if (remaining < 1) return fail("VALUATION_UNAVAILABLE");
      try {
        return await database.$transaction(
          async (raw) => {
            const txStop = Math.min(stop, performance.now() + 5000);
            let work = 0;
            const budget = () => {
              if (performance.now() >= txStop || ++work > 10000) fail("VALUATION_UNAVAILABLE");
            };
            const tx: ValuationReadTransaction = {
              $queryRaw: async (q, ...v) => {
                budget();
                return raw.$queryRaw(q, ...v);
              },
            };
            await tx.$queryRaw`SELECT set_config('TimeZone','UTC',true),set_config('statement_timeout',${`${Math.min(2000, remaining)}ms`},true),set_config('lock_timeout','500ms',true),set_config('transaction_timeout',${`${Math.min(5000, remaining)}ms`},true)`;
            const [clock] = await tx.$queryRaw<
              Array<{ now: Date }>
            >`SELECT date_trunc('milliseconds',transaction_timestamp()) AS now`;
            const readAt = clock!.now.toISOString();
            const [discovered] = await tx.$queryRaw<
              Array<{ collectionId: string }>
            >`SELECT i."collectionId" FROM "CollectibleItem" i JOIN "Collection" c ON c.id=i."collectionId" WHERE i.id=${itemId}::uuid AND i."ownerId"=${actor.userId} AND c."ownerId"=${actor.userId} AND i."deletedAt" IS NULL AND c."deletedAt" IS NULL`;
            if (!discovered) return fail("ITEM_NOT_FOUND");
            const parent = await tx.$queryRaw<
              Array<{ id: string }>
            >`SELECT id FROM "Collection" WHERE id=${discovered.collectionId}::uuid AND "ownerId"=${actor.userId} AND "deletedAt" IS NULL FOR SHARE`;
            if (parent.length !== 1) return fail("ITEM_NOT_FOUND");
            const [item] = await tx.$queryRaw<
              Item[]
            >`SELECT quantity,"archivedAt","disposedAt","catalogEntryId","catalogVariantId" FROM "CollectibleItem" WHERE id=${itemId}::uuid AND "collectionId"=${discovered.collectionId}::uuid AND "ownerId"=${actor.userId} AND "deletedAt" IS NULL FOR SHARE`;
            if (!item) return fail("ITEM_NOT_FOUND");
            const snapshots = new Map<number, CatalogSnapshot | null>();
            let categoryTemplateId: string | undefined;
            async function snapshot(revision: number): Promise<CatalogSnapshot | null> {
              if (snapshots.has(revision)) return snapshots.get(revision)!;
              if (snapshots.size >= 1024) return fail("VALUATION_UNAVAILABLE");
              const [row] = await tx.$queryRaw<
                Array<{ snapshot: unknown }>
              >`SELECT snapshot FROM "CatalogRevision" WHERE "entryId"=${item!.catalogEntryId}::uuid AND revision=${revision}`;
              const parsed = CatalogSnapshotSchema.safeParse(row?.snapshot);
              const value =
                parsed.success &&
                parsed.data.id === item!.catalogEntryId &&
                parsed.data.categoryTemplateId === categoryTemplateId &&
                new Set(parsed.data.variants.map((v) => v.id)).size ===
                  parsed.data.variants.length &&
                new Set(parsed.data.identifiers.map((i) => i.id)).size ===
                  parsed.data.identifiers.length &&
                new Set(
                  parsed.data.identifiers.map((i) =>
                    JSON.stringify([i.variantId ?? null, i.namespace, i.type, i.value]),
                  ),
                ).size === parsed.data.identifiers.length &&
                parsed.data.identifiers.every(
                  (i) => !i.variantId || parsed.data.variants.some((v) => v.id === i.variantId),
                )
                  ? parsed.data
                  : null;
              snapshots.set(revision, value);
              return value;
            }
            let current: CatalogSnapshot | null = null,
              revision = 0,
              variantActive = item.catalogVariantId === null;
            let live: Array<{ id: string; namespace: string; type: string; value: string }> = [];
            if (item.catalogEntryId) {
              const [entry] = await tx.$queryRaw<
                Array<{ revision: number; categoryTemplateId: string }>
              >`SELECT revision,"categoryTemplateId" FROM "CatalogEntry" WHERE id=${item.catalogEntryId}::uuid`;
              if (!entry) return fail("VALUATION_INVARIANT");
              revision = entry.revision;
              categoryTemplateId = entry.categoryTemplateId;
              current = await snapshot(revision);
              if (!current) return fail("VALUATION_INVARIANT");
              if (item.catalogVariantId) {
                const [variant] = await tx.$queryRaw<
                  Array<{ active: boolean }>
                >`SELECT active FROM "CatalogVariant" WHERE id=${item.catalogVariantId}::uuid AND "entryId"=${item.catalogEntryId}::uuid`;
                variantActive =
                  variant?.active === true &&
                  current.variants.some((v) => v.id === item.catalogVariantId);
              }
              live = await tx.$queryRaw<
                typeof live
              >`SELECT id,namespace,type,value FROM "CatalogExternalIdentifier" WHERE "entryId"=${item.catalogEntryId}::uuid AND ((${item.catalogVariantId}::uuid IS NULL AND "variantId" IS NULL) OR "variantId"=${item.catalogVariantId}::uuid) AND active LIMIT 201`;
              if (live.length > 200) return fail("VALUATION_INVARIANT");
              live = live.filter((l) =>
                current!.identifiers.some(
                  (i) =>
                    i.id === l.id &&
                    (i.variantId ?? null) === item.catalogVariantId &&
                    i.namespace === l.namespace &&
                    i.type === l.type &&
                    i.value === l.value,
                ),
              );
            }
            const context: ItemContext | null = item.catalogEntryId
              ? { itemId, entryId: item.catalogEntryId, variantId: item.catalogVariantId, revision }
              : null;
            for (const c of [groupCursor, selector, historyCursor])
              if (c && (!context || !sameContext(c.context, context)))
                return fail("VALUATION_CURSOR_STALE");
            const currentIdentifier = (key: SourceKey) =>
              live.find(
                (l) =>
                  l.namespace === key.identifierNamespace &&
                  l.type === key.identifierType &&
                  l.value === key.externalId,
              );
            const allowedKey = (key: SourceKey) =>
              !!grants.find(
                (g) =>
                  g.providerId === key.providerId &&
                  g.identifierNamespace === key.identifierNamespace &&
                  g.identifierType === key.identifierType,
              ) &&
              (scope === "HISTORICAL_MAPPING" || (variantActive && !!currentIdentifier(key)));
            async function eligible(row: StoredMarketObservation): Promise<boolean> {
              budget();
              if (!allowedKey(keyOf(row))) return false;
              const historic = await snapshot(row.catalogRevision);
              return (
                !!historic &&
                (item!.catalogVariantId === null ||
                  historic.variants.some((v) => v.id === item!.catalogVariantId)) &&
                historic.identifiers.some(
                  (i) =>
                    i.id === row.identifierId &&
                    (i.variantId ?? null) === item!.catalogVariantId &&
                    i.namespace === row.identifierNamespace &&
                    i.type === row.identifierType &&
                    i.value === row.externalId,
                )
              );
            }
            function dto(r: StoredMarketObservation): MarketObservationDto {
              const identifier = currentIdentifier(keyOf(r));
              return {
                id: r.id,
                source: keyOf(r),
                sourceMetric: r.sourceMetric,
                qualifiers: r.qualifiers,
                minorUnitExponent: r.minorUnitExponent,
                price:
                  r.kind === "PRICE_RANGE"
                    ? {
                        type: "RANGE",
                        lowMinor: r.lowMinor!.toString(),
                        highMinor: r.highMinor!.toString(),
                      }
                    : { type: "POINT", amountMinor: r.amountMinor!.toString() },
                observedAt: r.observedAt.toISOString(),
                observedBasis: r.observedBasis,
                observedPrecision: r.observedPrecision,
                fetchedAt: r.fetchedAt.toISOString(),
                recordedAt: r.createdAt.toISOString(),
                sourceUrl: r.sourceUrl,
                sourceReference: r.sourceReference,
                confidence: r.confidence,
                catalogMatch: {
                  observedRevision: r.catalogRevision,
                  currentRevision: revision,
                  observedIdentifierId: r.identifierId,
                  currentIdentifierId: identifier?.id ?? null,
                  revisionChanged: r.catalogRevision !== revision,
                  identifierRecordChanged: r.identifierId !== (identifier?.id ?? null),
                  identifierActive: !!identifier,
                  variantActive,
                },
              };
            }
            // Keep the fixed entry/nullable-variant prefix in ORDER BY: real PG17 plans
            // otherwise sort after filtering instead of consuming the source-history index.
            async function rows(
              key: SourceKey,
              limit: number,
              after: TimeKey | null,
            ): Promise<StoredMarketObservation[]> {
              if (!context || !allowedKey(key)) return [];
              const result: StoredMarketObservation[] = [];
              let cursor = after;
              while (result.length < limit) {
                const batch: StoredMarketObservation[] = await tx.$queryRaw<
                  StoredMarketObservation[]
                >`SELECT * FROM "MarketObservation" WHERE "entryId"=${context.entryId}::uuid AND ((${context.variantId}::uuid IS NULL AND "variantId" IS NULL) OR "variantId"=${context.variantId}::uuid) AND "providerId"=${key.providerId} AND "identifierNamespace"=${key.identifierNamespace} AND "identifierType"=${key.identifierType} AND "externalId"=${key.externalId} AND kind=${key.kind}::"MarketObservationKind" AND currency=${key.currency} AND (${cursor === null} OR ("observedAt","createdAt",id)<(${cursor?.observedAt ?? null}::timestamptz,${cursor?.createdAt ?? null}::timestamptz,${cursor?.id ?? null}::uuid)) ORDER BY "entryId","variantId","providerId","identifierNamespace","identifierType","externalId",kind,currency,"observedAt" DESC,"createdAt" DESC,id DESC LIMIT ${Math.min(100, limit - result.length)}`;
                for (const row of batch) if (await eligible(row)) result.push(row);
                if (!batch.length) break;
                cursor = timeKey(batch.at(-1)!);
              }
              return result;
            }
            async function groups(limit: number, after: SourceKey | null) {
              const result: Array<{ key: SourceKey; rows: StoredMarketObservation[] }> = [];
              if (!context || !grants.length || (scope === "CURRENT_MAPPING" && !variantActive))
                return result;
              let cursor = after;
              while (result.length < limit) {
                const [key] = await tx.$queryRaw<
                  SourceKey[]
                >`SELECT "providerId","identifierNamespace","identifierType","externalId",kind,currency FROM "MarketObservation" WHERE "entryId"=${context.entryId}::uuid AND ((${context.variantId}::uuid IS NULL AND "variantId" IS NULL) OR "variantId"=${context.variantId}::uuid) AND "providerId"=ANY(${grants.map((g) => g.providerId)}::text[]) AND (${cursor === null} OR ("providerId","identifierNamespace","identifierType","externalId",kind,currency)>(${cursor?.providerId ?? null},${cursor?.identifierNamespace ?? null},${cursor?.identifierType ?? null},${cursor?.externalId ?? null},${cursor?.kind ?? null}::"MarketObservationKind",${cursor?.currency ?? null})) ORDER BY "entryId","variantId","providerId","identifierNamespace","identifierType","externalId",kind,currency LIMIT 1`;
                if (!key) break;
                cursor = key;
                if (!allowedKey(key)) continue;
                const history = await rows(key, 6, null);
                if (history.length) result.push({ key, rows: history });
              }
              return result;
            }
            const historyPage = (
              key: SourceKey,
              records: StoredMarketObservation[],
              limit: number,
            ) => ({
              records: records.slice(0, limit).map(dto),
              nextCursor:
                records.length > limit
                  ? encodeValuationToken({
                      v: 1,
                      context,
                      scope,
                      key,
                      after: timeKey(records[limit - 1]!),
                    })
                  : null,
            });
            if (src && selector) {
              if (!context || !allowedKey(selector.key)) return fail("SOURCE_NOT_FOUND");
              const exists = await rows(selector.key, 1, null);
              if (!exists.length) return fail("SOURCE_NOT_FOUND");
              const history = await rows(selector.key, src.limit + 1, historyCursor?.after ?? null);
              return checkedDto(
                {
                  itemId,
                  readAt,
                  catalog: {
                    entryId: context.entryId,
                    variantId: context.variantId,
                    revision,
                    variantActive,
                  },
                  scope,
                  key: selector.key,
                  history: historyPage(selector.key, history, src.limit),
                },
                SourceHistorySchema,
              );
            }
            const [latest] = await tx.$queryRaw<
              ManualValuation[]
            >`SELECT * FROM "Valuation" WHERE "itemId"=${itemId}::uuid AND "ownerId"=${actor.userId} ORDER BY "observedAt" DESC,"createdAt" DESC,id DESC LIMIT 1`;
            const mc = manualCursor?.after;
            const manual = await tx.$queryRaw<
              ManualValuation[]
            >`SELECT * FROM "Valuation" WHERE "itemId"=${itemId}::uuid AND "ownerId"=${actor.userId} AND (${!mc} OR ("observedAt","createdAt",id)<(${mc?.observedAt ?? null}::timestamptz,${mc?.createdAt ?? null}::timestamptz,${mc?.id ?? null}::uuid)) ORDER BY "observedAt" DESC,"createdAt" DESC,id DESC LIMIT ${opts!.manualLimit + 1}`;
            const selected = await groups(opts!.groupLimit + 1, groupCursor?.after ?? null);
            const firstExternal = groupCursor ? (await groups(1, null))[0] : selected[0];
            const baseline = latest?.currency ?? firstExternal?.key.currency;
            let conflict = false;
            // Explicit currency ranges on the existing kind/currency-leading history index.
            // Every candidate, including hidden/off-page candidates, receives canonical validation.
            if (
              context &&
              baseline &&
              grants.length &&
              (scope === "HISTORICAL_MAPPING" || variantActive)
            )
              outer: for (const grant of grants)
                for (const kind of MarketKindSchema.options)
                  for (const side of [-1, 1]) {
                    let cursor: { currency: string; after: TimeKey } | null = null;
                    while (true) {
                      const batch: StoredMarketObservation[] = await tx.$queryRaw<
                        StoredMarketObservation[]
                      >`SELECT * FROM "MarketObservation" WHERE "entryId"=${context.entryId}::uuid AND ((${context.variantId}::uuid IS NULL AND "variantId" IS NULL) OR "variantId"=${context.variantId}::uuid) AND "providerId"=${grant.providerId} AND kind=${kind}::"MarketObservationKind" AND ((${side}=-1 AND currency<${baseline}) OR (${side}=1 AND currency>${baseline})) AND (${cursor === null} OR currency>${cursor?.currency ?? null} OR (currency=${cursor?.currency ?? null} AND ("observedAt","createdAt",id)<(${cursor?.after.observedAt ?? null}::timestamptz,${cursor?.after.createdAt ?? null}::timestamptz,${cursor?.after.id ?? null}::uuid))) ORDER BY "entryId","variantId","providerId",kind,currency,"observedAt" DESC,"createdAt" DESC,id DESC LIMIT 64`;
                      for (const row of batch)
                        if (await eligible(row)) {
                          conflict = true;
                          break outer;
                        }
                      if (batch.length < 64) break;
                      const last: StoredMarketObservation = batch.at(-1)!;
                      cursor = { currency: last.currency, after: timeKey(last) };
                    }
                  }
            const availability: ValuationSummaryDto["external"]["availability"] = !context
              ? "UNLINKED"
              : !grants.length
                ? "DISPLAY_DISABLED"
                : scope === "CURRENT_MAPPING" && !variantActive
                  ? "INACTIVE_VARIANT"
                  : scope === "CURRENT_MAPPING" &&
                      !live.some((l) =>
                        grants.some(
                          (g) =>
                            g.identifierNamespace === l.namespace && g.identifierType === l.type,
                        ),
                      )
                    ? "NO_SUPPORTED_MAPPING"
                    : firstExternal
                      ? "AVAILABLE"
                      : "NO_OBSERVATIONS";
            const response = {
              itemId,
              quantity: item.quantity,
              lifecycle: item.disposedAt ? "DISPOSED" : item.archivedAt ? "ARCHIVED" : "ACTIVE",
              manualBasis: "PER_UNIT",
              readAt,
              catalog: context
                ? {
                    entryId: context.entryId,
                    variantId: context.variantId,
                    revision,
                    variantActive,
                  }
                : null,
              manual: {
                latest: latest ? toManualValuationDto(latest) : null,
                history: {
                  records: manual.slice(0, opts!.manualLimit).map(toManualValuationDto),
                  nextCursor:
                    manual.length > opts!.manualLimit
                      ? encodeValuationToken({
                          v: 1,
                          itemId,
                          after: timeKey(manual[opts!.manualLimit - 1]!),
                        })
                      : null,
                },
              },
              external: {
                scope,
                availability,
                groups: selected.slice(0, opts!.groupLimit).map((g) => ({
                  key: g.key,
                  source: encodeValuationToken({ v: 1, context, scope, key: g.key }),
                  history: historyPage(g.key, g.rows, 5),
                })),
                nextGroupCursor:
                  selected.length > opts!.groupLimit
                    ? encodeValuationToken({
                        v: 1,
                        context,
                        scope,
                        after: selected[opts!.groupLimit - 1]!.key,
                      })
                    : null,
              },
              aggregate: null,
              currencyConflict: conflict,
              currencyConflictScope: "LATEST_MANUAL_AND_ALL_ELIGIBLE_EXTERNAL_GROUPS",
            };
            budget();
            return checkedDto(response, ValuationSummarySchema);
          },
          {
            isolationLevel: "RepeatableRead",
            maxWait: Math.min(2000, remaining),
            timeout: Math.min(5000, remaining),
          },
        );
      } catch (error) {
        if (error instanceof ValuationQueryError) throw error;
        const code = errorCode(error);
        if (code === "40001") {
          if (attempt < 2 && performance.now() < stop) continue;
          return fail("VALUATION_UNAVAILABLE");
        }
        if (code) return fail("VALUATION_UNAVAILABLE");
        throw error;
      }
    }
    return fail("VALUATION_UNAVAILABLE");
  }
  return {
    getItemValuationSummary: (
      itemId: string,
      actor: TrustedValuationActor,
      options: SummaryOptions = {},
    ) => read(itemId, actor, options, false) as Promise<ValuationSummaryDto>,
    getItemValuationSourceHistory: (
      itemId: string,
      actor: TrustedValuationActor,
      options: SourceHistoryOptions,
    ) => read(itemId, actor, options, true) as Promise<SourceHistoryDto>,
  };
}
