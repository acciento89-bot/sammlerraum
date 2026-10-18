import {
  createMarketDataService,
  type MarketDatabase,
  type MarketTransaction,
  type MarketSyncPayload,
} from "@sammlerraum/domain/market-data/market-data-service";
import type { ProviderRegistry } from "@sammlerraum/market-data/provider-registry";
import {
  assertSameReceipt,
  type MarketSyncReceipt,
  type MarketSyncRepository,
} from "./sync-market-data";
/** All operations use short caller-owned transactions, with no HTTP inside. */
export function createMarketSyncRepository(
  database: MarketDatabase,
  registry: ProviderRegistry,
): MarketSyncRepository {
  const service = createMarketDataService(database, registry);
  const within = <T>(work: (tx: MarketTransaction) => Promise<T>) =>
    database.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT set_config('TimeZone','UTC',true), set_config('lock_timeout','5s',true), set_config('statement_timeout','5s',true), set_config('transaction_timeout','10s',true)`;
        return work(tx);
      },
      { isolationLevel: "ReadCommitted" },
    );
  const find = async (tx: MarketTransaction, p: MarketSyncPayload) => {
    const rows = await tx.$queryRaw<
      MarketSyncReceipt[]
    >`SELECT request FROM "MarketSyncReceipt" WHERE "providerId"=${p.providerId} AND "pollId"=${p.pollId}::uuid`;
    return rows[0] ?? null;
  };
  return {
    find: (p) => within((tx) => find(tx, p)),
    validate: async (p) => {
      await within((tx) =>
        service.recordObservationsInTransaction(tx, p.providerId, [], {
          request: { pollId: p.pollId, target: p.target },
          fetchedAt: new Date().toISOString(),
        }),
      );
    },
    commit: async (p, observations, fetchedAt) => {
      await within(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`market.sync:${p.providerId}:${p.pollId}`},0))::text`;
        const existing = await find(tx, p);
        if (existing) {
          assertSameReceipt(existing, p);
          return;
        }
        const result = await service.recordObservationsInTransaction(
          tx,
          p.providerId,
          observations,
          { request: { pollId: p.pollId, target: p.target }, fetchedAt },
        );
        await tx.$queryRaw`INSERT INTO "MarketSyncReceipt" ("providerId","pollId",request,"fetchedAt","recordedAt","observationCount") VALUES (${p.providerId},${p.pollId}::uuid,${JSON.stringify(p)}::jsonb,${fetchedAt}::timestamptz,date_trunc('milliseconds',clock_timestamp()),${result.ids.length})`;
      });
    },
  };
}
