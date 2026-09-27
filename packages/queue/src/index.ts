import { PgBoss } from "pg-boss";

import { PgBossQueue } from "./pg-boss-queue";
import { QueueRuntime, WorkerRegistry } from "./runtime";

export * from "./pg-boss-queue";
export * from "./runtime";
export * from "./types";

export function createPgBossServices(databaseUrl: string) {
  const boss = new PgBoss(databaseUrl);
  const registry = new WorkerRegistry();
  return {
    client: new PgBossQueue(boss),
    registry,
    runtime: new QueueRuntime(boss, registry),
  };
}
