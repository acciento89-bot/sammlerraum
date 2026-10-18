import {
  MarketDataError,
  parseMarketSyncPayload,
  sameMarketSyncRequest,
  type MarketSyncPayload,
} from "@sammlerraum/domain/market-data/market-data-service";
import type { ProviderRegistry } from "@sammlerraum/market-data/provider-registry";
import type { MarketObservation } from "@sammlerraum/market-data/types";
export const MARKET_SYNC_JOB = "market.sync";
export type MarketSyncReceipt = { request: unknown };
export interface MarketSyncRepository {
  find(payload: MarketSyncPayload): Promise<MarketSyncReceipt | null>;
  validate(payload: MarketSyncPayload): Promise<void>;
  commit(
    payload: MarketSyncPayload,
    observations: MarketObservation[],
    fetchedAt: string,
  ): Promise<void>;
}
export class MarketSyncConflict extends Error {
  constructor() {
    super("MARKET_SYNC_IDENTITY_CONFLICT");
  }
}
export function assertSameReceipt(receipt: MarketSyncReceipt, payload: MarketSyncPayload) {
  if (!sameMarketSyncRequest(receipt.request, payload)) throw new MarketSyncConflict();
}
export function createMarketSyncHandler(options: {
  registry: ProviderRegistry;
  repository: MarketSyncRepository;
  enabled(providerId: string): boolean;
  logger: Pick<Console, "error">;
  signal?: AbortSignal;
}) {
  return async (input: unknown, context: { signal: AbortSignal }): Promise<void> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    timer.unref();
    const signal = AbortSignal.any([
      context.signal,
      controller.signal,
      ...(options.signal ? [options.signal] : []),
    ]);
    const check = () => {
      if (signal.aborted) throw new Error("MARKET_SYNC_INTERRUPTED");
    };
    try {
      check();
      const payload = parseMarketSyncPayload(input);
      if (!options.enabled(payload.providerId)) return;
      let registration;
      try {
        registration = options.registry.get(payload.providerId);
      } catch {
        options.logger.error("Market sync skipped: provider_disabled");
        return;
      }
      const receipt = await options.repository.find(payload);
      check();
      if (receipt) {
        assertSameReceipt(receipt, payload);
        return;
      }
      await options.repository.validate(payload);
      check();
      const httpTimer = setTimeout(() => controller.abort(), 30_000);
      httpTimer.unref();
      let observations: MarketObservation[];
      try {
        observations = await registration.provider.fetch(
          Object.freeze({ pollId: payload.pollId, target: Object.freeze({ ...payload.target }) }),
          { signal },
        );
      } finally {
        clearTimeout(httpTimer);
      }
      const fetchedAt = new Date().toISOString();
      check();
      // Once begun, await the bounded transaction's commit/rollback even after cancellation.
      await options.repository.commit(payload, observations, fetchedAt);
    } catch (error) {
      if (
        (error instanceof MarketDataError &&
          [
            "MARKET_INPUT_INVALID",
            "MARKET_CATALOG_MISMATCH",
            "MARKET_CATALOG_STALE",
            "MARKET_OBSERVATION_CONFLICT",
          ].includes(error.code)) ||
        error instanceof MarketSyncConflict
      ) {
        options.logger.error(
          `Market sync skipped: ${error instanceof MarketDataError ? error.code : "MARKET_SYNC_IDENTITY_CONFLICT"}`,
        );
        return;
      }
      // pg-boss persists thrown errors. Never propagate a provider URL/body/token/cause/stack.
      throw new Error(signal.aborted ? "MARKET_SYNC_INTERRUPTED" : "MARKET_SYNC_RETRY");
    } finally {
      clearTimeout(timer);
    }
  };
}
