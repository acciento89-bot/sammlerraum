import { type MarketDatabase } from "@sammlerraum/domain/market-data/market-data-service";
import {
  ProviderRegistry,
  type ProviderRegistration,
} from "@sammlerraum/market-data/provider-registry";
import type { WorkerRegistry, TransactionalProducerBackend } from "@sammlerraum/queue";
import { createMarketSyncDispatcher } from "./market-sync-dispatcher";
import { createMarketSyncRepository } from "./market-sync-repository";
import { createMarketSyncHandler, MARKET_SYNC_JOB } from "./sync-market-data";
/** Actual composition with explicit, policy-validated production or fake registrations. */
export function composeMarketSync(options: {
  database: MarketDatabase;
  backend: TransactionalProducerBackend;
  workers: WorkerRegistry;
  registrations?: readonly ProviderRegistration[];
  requestLifecycle?: { stop(): Promise<void> };
  enabled: boolean;
  logger: Pick<Console, "error">;
  intervalMs?: number;
  batchSize?: number;
  maxPending?: number;
}) {
  const registrations = options.registrations ?? [],
    registry = new ProviderRegistry(registrations),
    providerIds = registrations.map((r) => r.provider.id);
  const database: MarketDatabase = {
    $transaction: (work, txOptions) =>
      options.database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('TimeZone','UTC',true),set_config('lock_timeout','2s',true),set_config('statement_timeout','5s',true),set_config('transaction_timeout','10s',true)`;
        return work(tx);
      }, txOptions),
  };
  // Preparation and receipt ingestion share Task2's exact parser/locking contract.
  const repository = createMarketSyncRepository(database, registry);
  const controller = new AbortController(),
    pending = new Set<Promise<void>>();
  let stopping = false,
    stopPromise: Promise<void> | undefined;
  const handler = createMarketSyncHandler({
    registry,
    repository,
    enabled: (id) => options.enabled && providerIds.includes(id),
    logger: options.logger,
    signal: controller.signal,
  });
  options.workers.registerCancellable(MARKET_SYNC_JOB, (payload, context) => {
    if (stopping) return Promise.reject(new Error("MARKET_SYNC_INTERRUPTED"));
    const task = handler(payload, context);
    pending.add(task);
    void task.then(
      () => pending.delete(task),
      () => pending.delete(task),
    );
    return task;
  });
  const dispatcher = createMarketSyncDispatcher({ ...options, database, registry, providerIds });
  return {
    start: () => {
      if (stopping) throw new Error("Market runtime stopped");
      dispatcher.start();
    },
    stop() {
      if (stopPromise) return stopPromise;
      stopping = true;
      controller.abort();
      let requestStop: Promise<void>;
      try {
        requestStop = options.requestLifecycle?.stop() ?? Promise.resolve();
      } catch {
        requestStop = Promise.reject(new Error("Market shutdown failed"));
      }
      const settled = Promise.all([
        dispatcher.stop(),
        Promise.allSettled([...pending]),
        requestStop,
      ]);
      stopPromise = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Market work did not settle")), 15000);
        settled.then(
          () => {
            clearTimeout(timer);
            resolve();
          },
          () => {
            clearTimeout(timer);
            reject(new Error("Market shutdown failed"));
          },
        );
      });
      return stopPromise;
    },
  };
}
