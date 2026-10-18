import { randomUUID } from "node:crypto";
import {
  MarketDataError,
  createMarketDataService,
  type MarketDatabase,
  type MarketSyncPayload,
} from "@sammlerraum/domain/market-data/market-data-service";
import type { ProviderRegistry } from "@sammlerraum/market-data/provider-registry";
import type { TransactionalProducerBackend } from "@sammlerraum/queue";
import { MARKET_SYNC_JOB } from "./sync-market-data";
export const MARKET_SYNC_POLICY = Object.freeze({
  retryLimit: 2,
  retryDelay: 30,
  retryBackoff: true,
  retryDelayMax: 300,
  expireInSeconds: 120,
  retentionSeconds: 86400,
  deleteAfterSeconds: 604800,
  singletonSeconds: 3600,
});
type Cursor = {
  cursorProviderId: string | null;
  cursorIdentifierId: string | null;
  version: string;
  due: boolean;
};
type Candidate = {
  providerId: string;
  entryId: string;
  variantId: string | null;
  identifierId: string;
};
export function createMarketSyncDispatcher(options: {
  backend: TransactionalProducerBackend;
  database: MarketDatabase;
  registry: ProviderRegistry;
  providerIds: readonly string[];
  enabled: boolean;
  logger: Pick<Console, "error">;
  intervalMs?: number;
  batchSize?: number;
  maxPending?: number;
}) {
  const interval = options.intervalMs ?? 60000,
    batch = options.batchSize ?? 32,
    cap = options.maxPending ?? 256;
  if (
    !Number.isInteger(interval) ||
    interval < 60000 ||
    interval > 3600000 ||
    !Number.isInteger(batch) ||
    batch < 1 ||
    batch > 32 ||
    !Number.isInteger(cap) ||
    cap < 1 ||
    cap > 256 ||
    options.providerIds.length > 16 ||
    new Set(options.providerIds).size !== options.providerIds.length
  )
    throw new Error("Invalid market scheduler bounds");
  const mappings = options.providerIds.map((providerId) => {
    const r = options.registry.get(providerId);
    return { providerId, namespace: r.identifierNamespace, type: r.identifierType };
  });
  const service = createMarketDataService(options.database, options.registry);
  let stopping = false,
    timer: ReturnType<typeof setInterval> | undefined,
    running: Promise<void> | undefined;
  const transaction = async <T>(
    work: (db: ReturnType<TransactionalProducerBackend["getDb"]>) => Promise<T>,
  ): Promise<T> => {
    const backend = options.backend.getDb();
    if (!backend.beginTransaction) throw new Error("Market admission transaction unavailable");
    const tx = await backend.beginTransaction();
    try {
      await tx.db.executeSql(
        "SELECT set_config('TimeZone','UTC',true),set_config('lock_timeout','2s',true),set_config('statement_timeout','5s',true),set_config('transaction_timeout','10s',true)",
      );
      const value = await work(tx.db);
      await tx.commit();
      return value;
    } catch (error) {
      await tx.rollback().catch(() => undefined);
      throw error;
    }
  };
  async function dispatch() {
    if (!options.enabled || stopping || mappings.length === 0) return;
    const plan = await transaction(async (db) => {
      const state = (
        await db.executeSql(
          `SELECT "cursorProviderId","cursorIdentifierId","nextDispatchAt"::text AS version,"nextDispatchAt"<=clock_timestamp() AS due FROM "MarketSyncDispatchState" WHERE id='market.sync'`,
        )
      ).rows[0] as Cursor | undefined;
      if (!state) throw new Error("Market dispatch state missing");
      if (!state.due) return null;
      // Limit each indexed mapping before the outer merge: at most16*32 rows to sort.
      const result = await db.executeSql(
        `SELECT p."providerId",i."entryId",i."variantId",i.id AS "identifierId" FROM jsonb_to_recordset($1::jsonb) AS p("providerId" text,namespace text,type text) CROSS JOIN LATERAL (SELECT candidate.id,candidate."entryId",candidate."variantId" FROM "CatalogExternalIdentifier" candidate LEFT JOIN "CatalogVariant" v ON v.id=candidate."variantId" AND v."entryId"=candidate."entryId" WHERE candidate.namespace=p.namespace AND candidate.type=p.type AND candidate.active AND (candidate."variantId" IS NULL OR v.active) AND ($2::text IS NULL OR p."providerId" COLLATE "C">$2::text COLLATE "C" OR (p."providerId"=$2 AND candidate.id>$3::uuid)) ORDER BY candidate.id LIMIT $4) i WHERE ($2::text IS NULL OR p."providerId" COLLATE "C">=$2::text COLLATE "C") ORDER BY p."providerId" COLLATE "C",i.id LIMIT $4`,
        [JSON.stringify(mappings), state.cursorProviderId, state.cursorIdentifierId, batch],
      );
      return { state, candidates: result.rows as Candidate[] };
    });
    if (!plan || stopping) return;
    const prepared: Array<{ candidate: Candidate; payload: MarketSyncPayload | null }> = [];
    const deadline = performance.now() + 20000;
    for (const candidate of plan.candidates) {
      if (stopping || performance.now() >= deadline) break;
      try {
        const request = await service.prepareFetchRequest(candidate.providerId, {
          entryId: candidate.entryId,
          variantId: candidate.variantId,
          identifierId: candidate.identifierId,
          pollId: randomUUID(),
        });
        prepared.push({ candidate, payload: { providerId: candidate.providerId, ...request } });
      } catch (error) {
        if (!(error instanceof MarketDataError)) throw error;
        prepared.push({ candidate, payload: null });
        options.logger.error("Market dispatch skipped: invalid_mapping");
      }
    }
    if (stopping) return;
    await transaction(async (db) => {
      const state = (
        await db.executeSql(
          `SELECT "cursorProviderId","cursorIdentifierId","nextDispatchAt"::text AS version,"nextDispatchAt"<=clock_timestamp() AS due FROM "MarketSyncDispatchState" WHERE id='market.sync' FOR UPDATE`,
        )
      ).rows[0] as Cursor;
      if (
        stopping ||
        !state.due ||
        state.version !== plan.state.version ||
        state.cursorProviderId !== plan.state.cursorProviderId ||
        state.cursorIdentifierId !== plan.state.cursorIdentifierId
      )
        return;
      const counts = (
        await db.executeSql(
          `SELECT count(*)::int occupied FROM (SELECT 1 FROM pgboss.job WHERE name=$1 AND state IN ('created','retry','active') LIMIT $2) pending`,
          [MARKET_SYNC_JOB, cap],
        )
      ).rows as Array<{ occupied: number }>;
      if (counts.length !== 1) throw new Error("Market admission count unavailable");
      let remaining = cap - counts[0]!.occupied,
        cursorProvider = state.cursorProviderId,
        cursorIdentifier = state.cursorIdentifierId;
      if (plan.candidates.length === 0) {
        cursorProvider = null;
        cursorIdentifier = null;
      }
      for (const { candidate, payload } of prepared) {
        if (stopping) throw new Error("Market dispatcher stopped");
        if (payload) {
          if (remaining <= 0) break;
          const id = await options.backend.send(MARKET_SYNC_JOB, payload, {
            ...MARKET_SYNC_POLICY,
            singletonKey: `${payload.providerId}:${payload.target.identifierId}`,
            db,
          });
          if (id) remaining--;
        }
        cursorProvider = candidate.providerId;
        cursorIdentifier = candidate.identifierId;
      }
      await db.executeSql(
        `UPDATE "MarketSyncDispatchState" SET "cursorProviderId"=$1,"cursorIdentifierId"=$2::uuid,"nextDispatchAt"=date_trunc('milliseconds',clock_timestamp())+$3*interval '1 millisecond' WHERE id='market.sync'`,
        [cursorProvider, cursorIdentifier, interval],
      );
    });
  }
  const dispatchOnce = () => {
    if (running) return running;
    running = dispatch().finally(() => {
      running = undefined;
    });
    return running;
  };
  return {
    dispatchOnce,
    start() {
      if (timer) throw new Error("Market dispatcher already started");
      if (!options.enabled || mappings.length === 0) return;
      stopping = false;
      const tick = () => {
        void dispatchOnce().catch(() => options.logger.error("Market dispatch failed"));
      };
      tick();
      timer = setInterval(tick, interval);
      timer.unref();
    },
    async stop() {
      stopping = true;
      if (timer) clearInterval(timer);
      timer = undefined;
      await running;
    },
  };
}
