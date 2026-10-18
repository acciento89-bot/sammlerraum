import { EventEmitter } from "node:events";

import type { Job, PgBoss } from "pg-boss";

import { ensureExclusiveQueue } from "./pg-boss-queue";
import type { JobHandler } from "./types";

type RegisteredHandler = {
  name: string;
  handle: JobHandler<unknown>;
  cancellable?: (payload: unknown, context: { signal: AbortSignal }) => Promise<void>;
};

export class WorkerRegistry {
  private readonly handlers = new Map<string, JobHandler<unknown>>();
  private locked = false;
  private readonly cancellable = new Map<
    string,
    (payload: unknown, context: { signal: AbortSignal }) => Promise<void>
  >();

  register<T>(name: string, handler: JobHandler<T>): void {
    if (this.locked) {
      throw new Error("Workers must be registered before the queue runtime is started");
    }
    if (this.handlers.has(name)) {
      throw new Error(`Worker ${name} is already registered`);
    }
    this.handlers.set(name, handler as JobHandler<unknown>);
  }

  registerCancellable<T>(
    name: string,
    handler: (payload: T, context: { signal: AbortSignal }) => Promise<void>,
  ): void {
    this.register(name, async () => undefined);
    this.cancellable.set(
      name,
      handler as (payload: unknown, context: { signal: AbortSignal }) => Promise<void>,
    );
  }

  lock(): void {
    this.locked = true;
  }

  entries(): RegisteredHandler[] {
    return [...this.handlers].map(([name, handle]) => ({
      name,
      handle,
      ...(this.cancellable.has(name) ? { cancellable: this.cancellable.get(name)! } : {}),
    }));
  }
}

export type QueueRuntimeBackend = Pick<
  PgBoss,
  "start" | "stop" | "createQueue" | "getQueue" | "work" | "on" | "off"
>;

export class QueueRuntime extends EventEmitter {
  private started = false;
  private initialized = false;
  private queueHealthy = true;

  private readonly handleBackendError = (error: Error) => {
    this.queueHealthy = false;
    if (this.listenerCount("error") > 0) {
      this.emit("error", error);
    }
  };

  constructor(
    private readonly backend: QueueRuntimeBackend,
    private readonly registry: WorkerRegistry,
  ) {
    super();
    this.backend.on("error", this.handleBackendError);
  }

  async start(): Promise<void> {
    if (this.started) {
      throw new Error("Queue runtime is already started");
    }
    this.registry.lock();

    try {
      await this.backend.start();
      this.started = true;
      for (const registration of this.registry.entries()) {
        await ensureExclusiveQueue(this.backend, registration.name);
        await this.backend.work(registration.name, async (jobs: Job<unknown>[]) => {
          await Promise.all(
            jobs.map((job) =>
              registration.cancellable
                ? registration.cancellable(job.data, { signal: job.signal })
                : registration.handle(job.data),
            ),
          );
        });
      }
      this.initialized = this.queueHealthy;
    } catch (error) {
      this.queueHealthy = false;
      await this.backend.stop().catch(() => undefined);
      this.started = false;
      throw error;
    }
  }

  isReady(): boolean {
    return this.started && this.initialized && this.queueHealthy;
  }

  async stop(): Promise<void> {
    this.initialized = false;
    this.queueHealthy = false;
    this.started = false;
    this.backend.off("error", this.handleBackendError);
    await this.backend.stop();
  }
}
