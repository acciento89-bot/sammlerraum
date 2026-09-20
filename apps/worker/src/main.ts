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
  let stopped = false;
  const handleQueueError = () => {
    queueHealthy = false;
    options.logger.error("Worker queue error");
  };
  options.queue.on("error", handleQueueError);
  options.onQueueListenerInstalled?.();

  const stop = async () => {
    if (stopped) return;
    stopped = true;
    process.off("SIGTERM", handleSignal);
    process.off("SIGINT", handleSignal);
    await endpoint?.close();
    await options.queue.stop();
    options.queue.off("error", handleQueueError);
    await options.disconnectDatabase();
  };
  const handleSignal = () => {
    void stop().catch(() => {
      process.exitCode = 1;
    });
  };

  try {
    await options.queue.start();
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
