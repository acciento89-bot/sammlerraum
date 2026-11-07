import { randomUUID } from "node:crypto";

import type { EnqueueOptions, QueueClient } from "../types";

export class InMemoryQueueClient implements QueueClient {
  private readonly singletonIds = new Map<string, string>();

  async enqueue<T extends object>(
    name: string,
    _payload: T,
    options: EnqueueOptions = {},
  ): Promise<string> {
    if (!options.singletonKey) {
      return randomUUID();
    }

    const key = `${name}\0${options.singletonKey}`;
    const existing = this.singletonIds.get(key);
    if (existing) {
      return existing;
    }

    const id = randomUUID();
    this.singletonIds.set(key, id);
    return id;
  }
}
