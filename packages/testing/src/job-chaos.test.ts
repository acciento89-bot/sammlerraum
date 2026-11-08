import { EventEmitter } from "node:events";
import { randomUUID, createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PgBossQueue } from "../../queue/src/pg-boss-queue";
import { QueueRuntime, WorkerRegistry } from "../../queue/src/runtime";
import sharp from "sharp";
import { createImportCommitter } from "../../../apps/worker/src/jobs/commit-import";
import { createSendEmailJob } from "../../../apps/worker/src/jobs/send-email";
import { createAnalyzeItemJob } from "../../../apps/worker/src/jobs/analyze-item";
import { createMarketSyncHandler } from "../../../apps/worker/src/jobs/sync-market-data";
import { ProviderRegistry } from "../../market-data/src/provider-registry";
import { createImageProcessor } from "../../../apps/worker/src/jobs/process-image";

describe("bounded worker execution and recovery", () => {
  it.each([
    "media.process-image",
    "imports.commit",
    "ai.analyze-item",
    "market.sync",
    "notification.send-email",
  ])("%s sends with explicit finite retry backoff and active-time budget", async (name) => {
    const backend = {
      createQueue: vi.fn(async () => {}),
      getQueue: vi.fn(async () => ({ name, policy: "exclusive" })),
      send: vi.fn(async (_name: string, _data: object, _options: Record<string, unknown>) =>
        randomUUID(),
      ),
      findJobs: vi.fn(async () => []),
    };
    await new PgBossQueue(backend as never).enqueue(name, { id: randomUUID() });
    expect(backend.send.mock.calls[0]?.[2]).toMatchObject({
      retryLimit: 5,
      retryDelay: 5,
      retryBackoff: true,
      retryDelayMax: 300,
      expireInSeconds: expect.any(Number),
    });
    const options = backend.send.mock.calls[0]?.[2] as unknown as { expireInSeconds: number };
    expect(options.expireInSeconds).toBeGreaterThanOrEqual(60);
    expect(options.expireInSeconds).toBeLessThanOrEqual(600);
  });

  it("polls one job per bounded worker and stops with explicit graceful drain", async () => {
    const registry = new WorkerRegistry();
    registry.register("image.process", async () => {});
    const backend = Object.assign(new EventEmitter(), {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      createQueue: vi.fn(async () => {}),
      getQueue: vi.fn(async () => ({ name: "image.process", policy: "exclusive" })),
      work: vi.fn(async () => "worker"),
    });
    const runtime = new QueueRuntime(backend as never, registry);
    await runtime.start();
    expect(backend.work).toHaveBeenCalledWith(
      "image.process",
      { batchSize: 1, localConcurrency: 1, pollingIntervalSeconds: 1 },
      expect.any(Function),
    );
    await runtime.stop();
    expect(runtime.isReady()).toBe(false);
    expect(backend.stop).toHaveBeenCalledWith({ graceful: true, timeout: 30000 });
  });

  it("caps actual image storage read before allocating source bytes", async () => {
    const id = randomUUID(),
      read = vi.fn(async () => {
        throw Error("controlled storage refusal");
      });
    const repository = {
      claim: vi.fn(async () => ({
        id,
        token: randomUUID(),
        kind: "IMAGE",
        mimeType: "image/png",
        storageKey: "originals/owned",
        byteSize: 8n,
        checksumSha256: "a".repeat(64),
      })),
      fail: vi.fn(async () => {}),
    };
    await createImageProcessor(repository as never, { read } as never, { maxImageBytes: 32 })({
      assetId: id,
    });
    expect(read).toHaveBeenCalledWith("originals/owned", { maxBytes: 32 });
    expect(repository.fail).toHaveBeenCalledOnce();
  });
});

/** Real handlers, fake durable ports/external I/O; PostgreSQL counterparts run separately. */
describe("durable side effect acknowledgement loss and redelivery", () => {
  it("imports.commit resumes its durable batch receipt without a duplicate inventory mutation", async () => {
    let committed = false,
      mutations = 0;
    const service = {
      commitNextBatch: vi.fn(async () => {
        if (!committed) {
          committed = true;
          mutations++;
          throw Error("lost acknowledgement after commit");
        }
        return { complete: true };
      }),
      failCommit: vi.fn(),
    };
    const handler = createImportCommitter(service as never),
      input = { jobId: randomUUID() };
    await expect(handler(input)).rejects.toThrow("temporarily unavailable");
    await handler(input);
    expect(mutations).toBe(1);
    expect(service.failCommit).not.toHaveBeenCalled();
  });

  it("notification.send-email never resends an accepted SMTP message after all acknowledgement retries fail", async () => {
    let state = "PENDING";
    const repo = {
      claim: vi.fn(async () =>
        state === "PENDING" ? ((state = "CLAIMED"), { state, token: "owned" }) : { state },
      ),
      beginSend: vi.fn(async () => ({
        state: (state = "SENDING"),
        message: { to: "owned@example.test", type: "COMMENT_RECEIVED", locale: "de" as const },
      })),
      markSent: vi.fn(async () => {
        throw Error("acknowledgement unavailable");
      }),
      markFailure: vi.fn(async () => {
        state = "UNKNOWN";
      }),
    };
    const send = vi.fn(async () => ({ providerMessageId: "accepted-owned-message" }));
    const handler = createSendEmailJob(repo, { send }, { appOrigin: "https://example.invalid" });
    const input = { deliveryId: randomUUID() };
    await expect(handler(input)).rejects.toThrow("acknowledgement persistence");
    await handler(input);
    expect(send).toHaveBeenCalledOnce();
    expect(repo.markSent).toHaveBeenCalledTimes(3);
    expect(state).toBe("SENDING"); // Domain reconciliation quarantines expired SENDING as UNKNOWN.
  });

  it("market.sync reuses its committed poll receipt after acknowledgement loss without a second fetch", async () => {
    const input = {
      providerId: "fixture",
      pollId: randomUUID(),
      target: {
        entryId: randomUUID(),
        variantId: null,
        revision: 1,
        identifierId: randomUUID(),
        namespace: "fixture",
        identifierType: "product",
        externalId: "owned-1",
      },
    };
    let receipt: { request: unknown } | null = null;
    const fetch = vi.fn(async () => []);
    const commit = vi.fn(async () => {
      receipt = { request: input };
      throw Error("lost committed response");
    });
    const handler = createMarketSyncHandler({
      registry: new ProviderRegistry([
        {
          provider: { id: "fixture", fetch },
          identifierNamespace: "fixture",
          identifierType: "product",
        },
      ]),
      repository: { find: async () => receipt, validate: async () => {}, commit },
      enabled: () => true,
      logger: { error: vi.fn() },
    });
    const context = { signal: new AbortController().signal };
    await expect(handler(input, context)).rejects.toThrow();
    await handler(input, context);
    expect(fetch).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledOnce();
  });

  it("media.process-image does not rewrite variants after the READY side effect committed but its response was lost", async () => {
    const bytes = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#4b7965" },
    })
      .png()
      .toBuffer();
    const id = randomUUID();
    let ready = false;
    const claim = {
      id,
      token: randomUUID(),
      kind: "IMAGE",
      mimeType: "image/png",
      storageKey: "original/owned",
      byteSize: BigInt(bytes.length),
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    };
    const put = vi.fn(async () => {});
    const repository = {
      claim: async () => (ready ? null : claim),
      renew: async () => true,
      reserveVariant: async () => true,
      finishVariant: async () => true,
      ready: async () => {
        ready = true;
        throw Error("lost ready response");
      },
      // Actual repository uses the PROCESSING token CAS; READY cannot be reverted by this failure.
      fail: vi.fn(async () => {}),
    };
    const handler = createImageProcessor(
      repository as never,
      { read: async () => bytes, put } as never,
    );
    await handler({ assetId: id });
    await handler({ assetId: id });
    expect(ready).toBe(true);
    expect(put).toHaveBeenCalledTimes(3);
  });

  it("ai.analyze-item never calls the provider again after its immutable result committed but response was lost", async () => {
    const bytes = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#4b7965" },
    })
      .webp()
      .toBuffer();
    const id = randomUUID();
    let stored = false;
    const claim = {
      providerId: "fixture",
      model: "fixture-vision",
      sources: [
        {
          storageKey: "variant/owned",
          byteSize: BigInt(bytes.length),
          checksumSha256: createHash("sha256").update(bytes).digest("hex"),
          width: 8,
          height: 8,
        },
      ],
    };
    const analysis = {
      categoryKey: null,
      title: "Owned ceramic",
      manufacturer: null,
      seriesOrSet: null,
      year: null,
      identifiers: [],
      catalogCandidates: [],
      warnings: [],
    };
    const analyzeCollectible = vi.fn(async () => ({
      analysis,
      usage: { inputTokens: 10, outputTokens: 5 },
    }));
    const service = {
      claimAnalysis: async () => (stored ? null : claim),
      renewAnalysis: async () => true,
      getWorkerContext: async () => ({ categories: [], catalogCandidates: [] }),
      recordAnalysisUsage: vi.fn(async () => {}),
      storeAnalysisResult: vi.fn(async () => {
        stored = true;
        throw Error("lost immutable result response");
      }),
      failAnalysis: vi.fn(async () => {}), // Real DB CAS cannot revert a completed result.
    };
    const handler = createAnalyzeItemJob(
      service as never,
      { id: "fixture", model: "fixture-vision", analyzeCollectible },
      { read: async () => bytes },
    );
    await handler({ analysisJobId: id });
    await handler({ analysisJobId: id });
    expect(stored).toBe(true);
    expect(service.storeAnalysisResult).toHaveBeenCalledOnce();
    expect(analyzeCollectible).toHaveBeenCalledOnce();
  });

  it("does not close the worker while an abort-ignoring handler is still settling", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const registry = new WorkerRegistry();
    registry.registerCancellable("market.sync", async () => pending);
    let execute!: (jobs: unknown[]) => Promise<void>;
    const backend = Object.assign(new EventEmitter(), {
      start: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      createQueue: vi.fn(async () => {}),
      getQueue: vi.fn(async () => ({ name: "market.sync", policy: "exclusive" })),
      work: vi.fn(async (_name, _options, handle) => {
        execute = handle;
        return "worker";
      }),
    });
    const runtime = new QueueRuntime(backend as never, registry);
    await runtime.start();
    const active = execute([{ data: { id: randomUUID() }, signal: new AbortController().signal }]);
    let stopped = false;
    const stop = runtime.stop().then(() => {
      stopped = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(stopped).toBe(false);
    expect(runtime.isReady()).toBe(false);
    release();
    await Promise.all([active, stop]);
    expect(stopped).toBe(true);
  });
});

it("terminally classifies an actual bounded-storage refusal instead of retrying oversized source bytes", async () => {
  const id = randomUUID();
  const repository = {
    claim: async () => ({
      id,
      token: randomUUID(),
      kind: "IMAGE",
      mimeType: "image/png",
      storageKey: "owned/source",
      byteSize: 8n,
      checksumSha256: "a".repeat(64),
    }),
    fail: vi.fn(async () => {}),
  };
  const read = async () => {
    throw Object.assign(Error("oversized source"), { code: "STORAGE_TOO_LARGE" });
  };
  await createImageProcessor(repository as never, { read } as never)({ assetId: id });
  expect(repository.fail).toHaveBeenCalledWith(expect.any(Object), "SOURCE_TOO_LARGE", false);
});
