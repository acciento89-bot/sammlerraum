import type { EventEmitter } from "node:events";

import { startHealthServer, type HealthEndpoint } from "./health";

type Logger = {
  info(message: string): void;
  error(message: string): void;
};

type QueueLifecycle = Pick<EventEmitter, "on" | "off"> & {
  start(): Promise<void>;
  stop(): Promise<void>;
  isReady(): boolean;
};

type StartWorkerOptions = {
  queue: QueueLifecycle;
  databaseHealth(): Promise<{ ok: boolean }>;
  disconnectDatabase(): Promise<void>;
  startHealth?: typeof startHealthServer;
  healthPort: number;
  logger: Logger;
  installSignals?: boolean;
  onQueueListenerInstalled?: () => void;
  marketSync?: { start(): void; stop(): Promise<void> };
  mediaCleanup?: { start(): void; stop(): Promise<void> };
  imageDispatcher?: { start(): void; stop(): Promise<void> };
};

export type RunningWorker = {
  endpoint: HealthEndpoint;
  isHealthy(): boolean;
  stop(): Promise<void>;
};

export async function runWorkerMain(
  start: () => Promise<unknown>,
  logger: Pick<Logger, "error"> = console,
): Promise<number> {
  try {
    await start();
    return 0;
  } catch {
    logger.error("Worker startup failed");
    return 1;
  }
}

export async function startWorker(options: StartWorkerOptions): Promise<RunningWorker> {
  let queueHealthy = true;
  let endpoint: HealthEndpoint | undefined;
  let stopPromise: Promise<void> | undefined;
  const handleQueueError = () => {
    queueHealthy = false;
    options.logger.error("Worker queue error");
  };
  options.queue.on("error", handleQueueError);
  options.onQueueListenerInstalled?.();

  const stop = (): Promise<void> => {
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
      process.off("SIGTERM", handleSignal);
      process.off("SIGINT", handleSignal);
      // Abort market I/O synchronously before waiting for independent cleanup.
      let marketSettled = true;
      const errors: unknown[] = [];
      let marketStop: Promise<void> | undefined;
      try {
        marketStop = options.marketSync?.stop();
      } catch {
        marketSettled = false;
        errors.push(new Error("Market shutdown failed"));
      }
      const marketResult = marketStop?.catch(() => {
        marketSettled = false;
        errors.push(new Error("Market shutdown failed"));
      });
      const attempt = async (work: () => Promise<unknown> | undefined) => {
        try {
          await work();
        } catch {
          errors.push(new Error("Worker cleanup failed"));
        }
      };
      await attempt(() => endpoint?.close());
      await attempt(() => options.mediaCleanup?.stop());
      await attempt(() => options.imageDispatcher?.stop());
      await marketResult;
      await attempt(() => options.queue.stop());
      options.queue.off("error", handleQueueError);
      // An abort/timeout is not proof that a transport or transaction has stopped.
      if (marketSettled) await attempt(() => options.disconnectDatabase());
      if (errors.length) throw new Error("Worker shutdown failed");
    })();
    return stopPromise;
  };
  const handleSignal = () => {
    void stop().catch(() => {
      process.exitCode = 1;
    });
  };

  try {
    await options.queue.start();
    options.imageDispatcher?.start();
    options.mediaCleanup?.start();
    options.marketSync?.start();
    endpoint = await (options.startHealth ?? startHealthServer)({
      port: options.healthPort,
      databaseHealth: options.databaseHealth,
      queueReady: () => queueHealthy && options.queue.isReady(),
    });
    if (options.installSignals !== false) {
      process.once("SIGTERM", handleSignal);
      process.once("SIGINT", handleSignal);
    }
    options.logger.info("Worker ready");
    return {
      endpoint,
      isHealthy: () => queueHealthy && options.queue.isReady(),
      stop,
    };
  } catch (error) {
    await stop().catch(() => undefined);
    throw error;
  }
}
