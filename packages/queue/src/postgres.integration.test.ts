import { randomUUID } from "node:crypto";

import { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PgBossQueue } from "./pg-boss-queue";

const runIntegration = process.env.RUN_DATABASE_INTEGRATION === "1";
const databaseUrl = process.env.DATABASE_URL ?? "";
const boss = runIntegration ? new PgBoss(databaseUrl) : undefined;

describe.runIf(runIntegration)("pg-boss singleton integration", () => {
  beforeAll(async () => {
    boss!.on("error", () => undefined);
    await boss!.start();
  });

  afterAll(async () => {
    await boss?.stop({ graceful: false });
  });

  it("returns one PostgreSQL-backed job for a reused singleton key", async () => {
    const queue = new PgBossQueue(boss!);
    const queueName = `integration-${randomUUID()}`;
    const singletonKey = randomUUID();

    try {
      const first = await queue.enqueue(queueName, { id: "first" }, { singletonKey });
      const second = await queue.enqueue(queueName, { id: "second" }, { singletonKey });

      expect(second).toBe(first);
      const jobs = await boss!.findJobs(queueName, { key: singletonKey });
      expect(
        jobs.filter((job) => !["completed", "cancelled", "failed"].includes(job.state)),
      ).toHaveLength(1);
    } finally {
      await boss!.deleteQueue(queueName);
    }
  });
});
