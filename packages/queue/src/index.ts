import { PgBoss, type Db, type SendOptions } from "pg-boss";

import { PgBossQueue } from "./pg-boss-queue";
import { QueueRuntime, WorkerRegistry } from "./runtime";

export * from "./pg-boss-queue";
export * from "./runtime";
export * from "./types";

export function createPgBossServices(databaseUrl: string) {
  const boss = new PgBoss({ connectionString: databaseUrl, connectionTimeoutMillis: 2000 });
  const registry = new WorkerRegistry();
  return {
    client: new PgBossQueue(boss),
    producerBackend: boss as TransactionalProducerBackend,
    registry,
    runtime: new QueueRuntime(boss, registry),
  };
}

/** Internal bounded-admission capability; market sends must go through its dispatcher. */
export type TransactionalProducerBackend = {
  getDb(): Db;
  send(name: string, data: object, options: SendOptions): Promise<string | null>;
};
