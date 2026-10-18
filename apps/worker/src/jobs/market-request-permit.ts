import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import type {
  MarketDatabase,
  MarketTransaction,
} from "@sammlerraum/domain/market-data/market-data-service";
import type { MarketRequestPermit } from "@sammlerraum/market-data/types";
import { ProviderFailure, checkSignal } from "@sammlerraum/market-data/provider-failure";
export type MarketGatePolicy = {
  credentialKey: string;
  service: "scrydex" | "pricecharting";
  hourly: number;
  daily: number;
};
export type MarketGateStore = {
  acquire(key: string, attempt: string): Promise<void>;
  clear(key: string, attempt: string): Promise<void>;
};
type GateRow = {
  service: string;
  hourly: number;
  daily: number;
  policyVersion: number;
  activeAttempt: string | null;
  hourStart: Date;
  dayStart: Date;
  hourCount: number;
  dayCount: number;
  hourNow: Date;
  dayNow: Date;
};
/** Policy is trusted server configuration. Existing rows are never reset/reclaimed on startup. */
export function createPostgresMarketGate(
  database: MarketDatabase,
  policies: readonly MarketGatePolicy[],
): MarketGateStore {
  const byKey = new Map<string, MarketGatePolicy>();
  for (const policy of policies) {
    if (
      !/^[0-9a-f]{64}$/u.test(policy.credentialKey) ||
      !["scrydex", "pricecharting"].includes(policy.service) ||
      !Number.isInteger(policy.hourly) ||
      policy.hourly < 0 ||
      policy.hourly > 60 ||
      !Number.isInteger(policy.daily) ||
      policy.daily < 0 ||
      policy.daily > 500 ||
      byKey.has(policy.credentialKey)
    )
      throw new ProviderFailure("PROVIDER_CONFIGURATION");
    byKey.set(policy.credentialKey, Object.freeze({ ...policy }));
  }
  const transaction = <T>(work: (tx: MarketTransaction) => Promise<T>) =>
    database.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT set_config('TimeZone','UTC',true),set_config('lock_timeout','1s',true),set_config('statement_timeout','1s',true),set_config('transaction_timeout','5s',true)`;
        return work(tx);
      },
      { isolationLevel: "ReadCommitted" },
    );
  return {
    async acquire(key, attempt) {
      const policy = byKey.get(key);
      if (!policy || policy.hourly === 0 || policy.daily === 0)
        throw new ProviderFailure("PERMIT_UNAVAILABLE");
      await transaction(async (tx) => {
        // First explicit positive policy admission initializes an idle row atomically.
        // Conflict preserves the durable old claim, counters and original policy.
        await tx.$queryRaw`INSERT INTO "MarketRequestGate" ("credentialKey",service,hourly,daily,"policyVersion","hourStart","dayStart","hourCount","dayCount") VALUES (${key},${policy.service},${policy.hourly},${policy.daily},1,date_trunc('hour',clock_timestamp()),date_trunc('day',clock_timestamp()),0,0) ON CONFLICT ("credentialKey") DO NOTHING RETURNING "credentialKey"`;
        const [row] = await tx.$queryRaw<
          GateRow[]
        >`SELECT *,date_trunc('hour',clock_timestamp()) AS "hourNow",date_trunc('day',clock_timestamp()) AS "dayNow" FROM "MarketRequestGate" WHERE "credentialKey"=${key} FOR UPDATE`;
        if (
          !row ||
          row.activeAttempt !== null ||
          row.service !== policy.service ||
          row.hourly !== policy.hourly ||
          row.daily !== policy.daily ||
          row.policyVersion !== 1 ||
          row.hourNow < row.hourStart ||
          row.dayNow < row.dayStart
        )
          throw new ProviderFailure("PERMIT_UNAVAILABLE");
        const hourCount = row.hourNow > row.hourStart ? 0 : row.hourCount,
          dayCount = row.dayNow > row.dayStart ? 0 : row.dayCount;
        if (hourCount >= policy.hourly || dayCount >= policy.daily)
          throw new ProviderFailure("PERMIT_UNAVAILABLE");
        await tx.$queryRaw`UPDATE "MarketRequestGate" SET "activeAttempt"=${attempt}::uuid,"acquiredAt"=clock_timestamp(),"hourStart"=${row.hourNow},"dayStart"=${row.dayNow},"hourCount"=${hourCount + 1},"dayCount"=${dayCount + 1} WHERE "credentialKey"=${key} RETURNING "credentialKey"`;
      });
    },
    async clear(key, attempt) {
      await transaction(async (tx) => {
        const [row] = await tx.$queryRaw<
          GateRow[]
        >`SELECT *,date_trunc('hour',clock_timestamp()) AS "hourNow",date_trunc('day',clock_timestamp()) AS "dayNow" FROM "MarketRequestGate" WHERE "credentialKey"=${key} AND "activeAttempt"=${attempt}::uuid FOR UPDATE`;
        if (!row || row.hourNow < row.hourStart || row.dayNow < row.dayStart)
          throw new ProviderFailure("PERMIT_UNCERTAIN");
        // A holder may pause across a boundary before sending. Charge the carried attempt
        // in every advanced current bucket before any successor can reset/admit there.
        const hourCount = row.hourNow > row.hourStart ? 1 : row.hourCount,
          dayCount = row.dayNow > row.dayStart ? 1 : row.dayCount;
        const rows = await tx.$queryRaw<
          Array<{ credentialKey: string }>
        >`UPDATE "MarketRequestGate" SET "activeAttempt"=NULL,"acquiredAt"=NULL,"hourStart"=${row.hourNow},"dayStart"=${row.dayNow},"hourCount"=${hourCount},"dayCount"=${dayCount} WHERE "credentialKey"=${key} AND "activeAttempt"=${attempt}::uuid RETURNING "credentialKey"`;
        if (rows.length !== 1) throw new ProviderFailure("PERMIT_UNCERTAIN");
      });
    },
  };
}
async function cooldown(): Promise<void> {
  const until = performance.now() + 1000;
  while (performance.now() < until) await delay(Math.ceil(until - performance.now()));
}
/** Durable claim spans actual body settlement and a monotonic post-settlement cooldown.
 * Ambiguous admission never sends. Ambiguous clear may have committed: DB is authoritative,
 * but local stop still fails. No TTL, takeover, refund, detached work or automatic recovery.
 */
export function createMarketRequestPermit({
  store,
}: {
  store: MarketGateStore;
}): MarketRequestPermit & { stop(): Promise<void> } {
  const controller = new AbortController(),
    pending = new Set<Promise<unknown>>();
  let stopping = false,
    uncertain = false,
    stopPromise: Promise<void> | undefined;
  async function execute<T>(
    key: string,
    signal: AbortSignal,
    send: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    checkSignal(signal);
    if (uncertain) throw new ProviderFailure("PERMIT_UNCERTAIN");
    const attempt = randomUUID();
    try {
      await store.acquire(key, attempt);
    } catch (error) {
      if (error instanceof ProviderFailure && error.code === "PERMIT_UNAVAILABLE") throw error;
      uncertain = true;
      throw new ProviderFailure("PERMIT_UNCERTAIN");
    }
    let value: T | undefined, failure: ProviderFailure | undefined;
    try {
      checkSignal(signal);
      value = await send(signal);
      checkSignal(signal);
    } catch (error) {
      failure = error instanceof ProviderFailure ? error : new ProviderFailure("TRANSPORT");
    }
    if (failure?.code === "TRANSPORT_UNCERTAIN") {
      uncertain = true;
      throw new ProviderFailure("PERMIT_UNCERTAIN");
    }
    // Signal cancellation must not cancel this independent cleanup obligation.
    await cooldown();
    try {
      await store.clear(key, attempt);
    } catch {
      uncertain = true;
      throw new ProviderFailure("PERMIT_UNCERTAIN");
    }
    if (failure) throw failure;
    checkSignal(signal);
    return value as T;
  }
  return {
    run<T>(
      { credentialKey, signal }: { credentialKey: string; signal: AbortSignal },
      send: (signal: AbortSignal) => Promise<T>,
    ): Promise<T> {
      if (stopping) return Promise.reject(new ProviderFailure("INTERRUPTED"));
      const task = execute(credentialKey, AbortSignal.any([signal, controller.signal]), send);
      pending.add(task);
      void task.then(
        () => pending.delete(task),
        () => pending.delete(task),
      );
      return task;
    },
    stop() {
      if (stopPromise) return stopPromise;
      stopping = true;
      controller.abort();
      stopPromise = (async () => {
        await Promise.allSettled([...pending]);
        if (uncertain) throw new ProviderFailure("PERMIT_UNCERTAIN");
      })();
      return stopPromise;
    },
  };
}
