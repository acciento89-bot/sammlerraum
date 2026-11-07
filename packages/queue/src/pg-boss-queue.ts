import { randomUUID } from "node:crypto";

import type { FindJobsOptions, JobWithMetadata, QueueResult, SendOptions } from "pg-boss";

import type { EnqueueOptions, QueueClient } from "./types";

export const REQUIRED_QUEUE_POLICY = "exclusive" as const;

export type PgBossQueueBackend = {
  createQueue(name: string, options: { policy: typeof REQUIRED_QUEUE_POLICY }): Promise<void>;
  getQueue(name: string): Promise<Pick<QueueResult, "name" | "policy"> | null>;
  send(name: string, data: object, options: SendOptions): Promise<string | null>;
  findJobs<T>(name: string, options?: FindJobsOptions): Promise<Array<JobWithMetadata<T>>>;
};

export async function ensureExclusiveQueue(
  backend: Pick<PgBossQueueBackend, "createQueue" | "getQueue">,
  name: string,
): Promise<void> {
  await backend.createQueue(name, { policy: REQUIRED_QUEUE_POLICY });
  const persisted = await backend.getQueue(name);
  if (!persisted || persisted.policy !== REQUIRED_QUEUE_POLICY) {
    throw new Error(`Queue ${name} must use the persisted exclusive policy`);
  }
}

const terminalStates = new Set(["completed", "cancelled", "failed"]);

export class PgBossQueue implements QueueClient {
  constructor(
    private readonly backend: PgBossQueueBackend,
    private readonly createSingletonKey: () => string = randomUUID,
  ) {}

  async enqueue<T extends object>(
    name: string,
    payload: T,
    options: EnqueueOptions = {},
  ): Promise<string> {
    await ensureExclusiveQueue(this.backend, name);
    const singletonKey = options.singletonKey ?? this.createSingletonKey();
    const sendOptions: SendOptions = {
      singletonKey,
      retryLimit: options.retryLimit ?? 5,
      ...(options.priority === undefined ? {} : { priority: options.priority }),
    };
    const id = await this.backend.send(name, payload, sendOptions);
    if (id) {
      return id;
    }

    const jobs = await this.backend.findJobs(name, { key: singletonKey });
    const existing = jobs
      .filter((job) => !terminalStates.has(job.state))
      .sort((left, right) => right.createdOn.getTime() - left.createdOn.getTime())[0];
    if (existing) {
      return existing.id;
    }

    throw new Error(`Queue send returned no id and could not resolve the singleton for ${name}`);
  }
}
