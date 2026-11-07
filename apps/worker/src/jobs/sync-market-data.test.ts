import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ProviderRegistry } from "../../../../packages/market-data/src/provider-registry";
import { createMarketSyncHandler } from "./sync-market-data";
const payload = () => ({
  providerId: "fixture",
  pollId: randomUUID(),
  target: {
    entryId: randomUUID(),
    variantId: null,
    revision: 1,
    identifierId: randomUUID(),
    namespace: "fixture",
    identifierType: "product",
    externalId: "sale-123",
  },
});
function setup() {
  const receipts = new Map<string, { request: ReturnType<typeof payload> }>();
  const fetch = vi.fn(async () => []);
  const registry = new ProviderRegistry([
    {
      provider: { id: "fixture", fetch },
      identifierNamespace: "fixture",
      identifierType: "product",
    },
  ]);
  const repository = {
    find: vi.fn(async (p: ReturnType<typeof payload>) => receipts.get(p.pollId) ?? null),
    validate: vi.fn(async () => {}),
    commit: vi.fn(
      async (p: ReturnType<typeof payload>, _observations: unknown[], _fetchedAt: string) => {
        receipts.set(p.pollId, { request: p });
      },
    ),
  };
  return {
    repository,
    fetch,
    handler: createMarketSyncHandler({
      registry,
      repository,
      enabled: () => true,
      logger: { error: vi.fn() },
    }),
  };
}
describe("market synchronization", () => {
  it("receipts an empty success and skips a committed retry before catalog validation or fetch", async () => {
    const s = setup(),
      p = payload(),
      c = { signal: new AbortController().signal };
    await s.handler(p, c);
    await s.handler(p, c);
    expect(s.fetch).toHaveBeenCalledTimes(1);
    expect(s.repository.validate).toHaveBeenCalledTimes(1);
    expect(s.repository.commit).toHaveBeenCalledTimes(1);
  });
  it("never fetches a disabled provider", async () => {
    const fetch = vi.fn();
    const handler = createMarketSyncHandler({
      registry: new ProviderRegistry([
        {
          provider: { id: "fixture", fetch },
          identifierNamespace: "fixture",
          identifierType: "product",
        },
      ]),
      repository: { find: vi.fn(), validate: vi.fn(), commit: vi.fn() },
      enabled: () => false,
      logger: { error: vi.fn() },
    });
    await handler(payload(), { signal: new AbortController().signal });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("passes cancellation to the provider and does not commit an aborted fetch", async () => {
    const s = setup(),
      ac = new AbortController();
    ac.abort();
    await expect(s.handler(payload(), { signal: ac.signal })).rejects.toThrow(
      "MARKET_SYNC_INTERRUPTED",
    );
    expect(s.repository.commit).not.toHaveBeenCalled();
  });
});

it("redacts provider exceptions and leaves failed work without a receipt", async () => {
  const s = setup();
  s.fetch.mockRejectedValue(new Error("https://provider.invalid?t=secret raw body"));
  let failure: unknown;
  try {
    await s.handler(payload(), { signal: new AbortController().signal });
  } catch (error) {
    failure = error;
  }
  expect(failure).toEqual(new Error("MARKET_SYNC_RETRY"));
  expect(String(failure)).not.toContain("secret");
  expect(s.repository.commit).not.toHaveBeenCalled();
});
it("classifies conflicting committed requests without another provider call", async () => {
  const s = setup(),
    p = payload();
  await s.handler(p, { signal: new AbortController().signal });
  await s.handler(
    { ...p, target: { ...p.target, revision: 2 } },
    { signal: new AbortController().signal },
  );
  expect(s.fetch).toHaveBeenCalledTimes(1);
});
it("rejects private or malformed payload fields before touching persistence", async () => {
  const s = setup();
  await s.handler({ ...payload(), itemId: randomUUID() }, { signal: new AbortController().signal });
  expect(s.repository.find).not.toHaveBeenCalled();
});
it("propagates cancellation during a real pending fake transport and refuses ingestion", async () => {
  const s = setup(),
    ac = new AbortController();
  let ready!: () => void;
  const entered = new Promise<void>((r) => (ready = r));
  s.fetch.mockImplementation(
    (async (_request: unknown, context: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        ready();
        context.signal.addEventListener("abort", () => reject(new Error("provider secret")), {
          once: true,
        });
      })) as never,
  );
  const task = s.handler(payload(), { signal: ac.signal });
  await entered;
  ac.abort();
  await expect(task).rejects.toThrow("MARKET_SYNC_INTERRUPTED");
  expect(s.repository.commit).not.toHaveBeenCalled();
});
it("does not let an adapter mutate the persisted attachment request", async () => {
  const s = setup();
  s.fetch.mockImplementation((async (request: { target: { revision: number } }) => {
    request.target.revision++;
    return [];
  }) as never);
  await expect(s.handler(payload(), { signal: new AbortController().signal })).rejects.toThrow(
    "MARKET_SYNC_RETRY",
  );
  expect(s.repository.commit).not.toHaveBeenCalled();
});
it("aborts a compliant transport at the thirty-second request bound", async () => {
  vi.useFakeTimers();
  try {
    const s = setup();
    let entered!: () => void;
    const ready = new Promise<void>((r) => (entered = r));
    s.fetch.mockImplementation(
      (async (_request: unknown, context: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          entered();
          context.signal.addEventListener("abort", () => reject(new Error("secret")), {
            once: true,
          });
        })) as never,
    );
    const task = s.handler(payload(), { signal: new AbortController().signal });
    const outcome = expect(task).rejects.toThrow("MARKET_SYNC_INTERRUPTED");
    await ready;
    await vi.advanceTimersByTimeAsync(30000);
    await outcome;
    expect(s.repository.commit).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

it("uses one frozen response-receipt timestamp through registry before delayed decode/cooldown", async () => {
  const s = setup();
  const received = "2026-01-01T00:00:00.000Z";
  s.fetch.mockImplementation((async (
    _request: unknown,
    context: { reportFetchedAt: (value: string) => void },
  ) => {
    context.reportFetchedAt(received);
    return [];
  }) as never);
  await s.handler(payload(), { signal: new AbortController().signal });
  expect(s.repository.commit.mock.calls[0]![2]).toBe(received);
});
it.each([
  "not-a-date",
  "2026-02-30T00:00:00.000Z",
  "9999-01-01T00:00:00.000Z",
  "2026-01-01T00:00:00Z",
])("rejects malformed/future response time %s without committing", async (timestamp) => {
  const s = setup();
  s.fetch.mockImplementation((async (_r: unknown, c: { reportFetchedAt: (v: string) => void }) => {
    try {
      c.reportFetchedAt(timestamp);
    } catch {}
    return [];
  }) as never);
  await expect(s.handler(payload(), { signal: new AbortController().signal })).rejects.toThrow(
    "MARKET_SYNC_RETRY",
  );
  expect(s.repository.commit).not.toHaveBeenCalled();
});
it("rejects duplicate receipt reports even when the adapter catches the exception", async () => {
  const s = setup();
  s.fetch.mockImplementation((async (_r: unknown, c: { reportFetchedAt: (v: string) => void }) => {
    c.reportFetchedAt("2026-01-01T00:00:00.000Z");
    try {
      c.reportFetchedAt("2026-01-01T00:00:00.000Z");
    } catch {}
    return [];
  }) as never);
  await expect(s.handler(payload(), { signal: new AbortController().signal })).rejects.toThrow(
    "MARKET_SYNC_RETRY",
  );
  expect(s.repository.commit).not.toHaveBeenCalled();
});
it("terminal provider failures avoid paid retries but cancellation takes precedence", async () => {
  const { ProviderFailure } = await import("@sammlerraum/market-data/provider-failure");
  const s = setup();
  s.fetch.mockRejectedValue(new ProviderFailure("INVALID_RESPONSE"));
  await s.handler(payload(), { signal: new AbortController().signal });
  expect(s.repository.commit).not.toHaveBeenCalled();
  const ac = new AbortController();
  s.fetch.mockImplementation((async () => {
    ac.abort();
    throw new ProviderFailure("INVALID_MAPPING");
  }) as never);
  await expect(s.handler(payload(), { signal: ac.signal })).rejects.toThrow(
    "MARKET_SYNC_INTERRUPTED",
  );
});
