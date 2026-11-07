import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { makePriceChartingProvider } from "@sammlerraum/market-data/pricecharting-provider";
import { ProviderRegistry } from "@sammlerraum/market-data/provider-registry";
import { createMarketRequestPermit } from "./market-request-permit";
import { domainMoney } from "./market-provider-composition";
import { createMarketSyncHandler } from "./sync-market-data";

function setup() {
  let active: string | undefined;
  const store = {
    acquire: vi.fn(async (_key: string, attempt: string) => {
      expect(active).toBeUndefined();
      active = attempt;
    }),
    clear: vi.fn(async (_key: string, attempt: string) => {
      expect(active).toBe(attempt);
      active = undefined;
    }),
  };
  const permit = createMarketRequestPermit({ store });
  const http = vi.fn(async () => new Response(new Uint8Array([255])));
  const provider = makePriceChartingProvider({
    token: "synthetic-malformed-token",
    enabled: true,
    permit,
    money: domainMoney,
    fetch: http,
  });
  const payload = {
    providerId: "pricecharting",
    pollId: randomUUID(),
    target: {
      entryId: randomUUID(),
      variantId: null,
      revision: 1,
      identifierId: randomUUID(),
      namespace: "pricecharting",
      identifierType: "product_category",
      externalId: '["v1","cards","1234","Pokemon Base Set"]',
    },
  };
  return { store, permit, http, provider, payload, active: () => active };
}

describe("malformed response through the actual request permit", () => {
  it("preserves terminal UTF-8 classification after physical settlement and own clear", async () => {
    const s = setup();
    const reportFetchedAt = vi.fn();
    await expect(
      s.provider.fetch(s.payload, {
        signal: new AbortController().signal,
        reportFetchedAt,
      }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE", retryable: false });
    expect(reportFetchedAt).toHaveBeenCalledTimes(1);
    expect(s.http).toHaveBeenCalledTimes(1);
    expect(s.store.acquire).toHaveBeenCalledTimes(1);
    expect(s.store.clear).toHaveBeenCalledTimes(1);
    expect(s.active()).toBeUndefined();
    await s.permit.stop();
  });

  it("acknowledges malformed UTF-8 without a receipt, commit or retry request", async () => {
    const s = setup();
    const receipts = new Map<string, unknown>();
    const repository = {
      find: vi.fn(async () => null),
      validate: vi.fn(async () => {}),
      commit: vi.fn(async () => {
        receipts.set(s.payload.pollId, s.payload);
      }),
    };
    const logger = { error: vi.fn() };
    const handler = createMarketSyncHandler({
      registry: new ProviderRegistry([
        {
          provider: s.provider,
          identifierNamespace: "pricecharting",
          identifierType: "product_category",
        },
      ]),
      repository,
      enabled: () => true,
      logger,
    });
    // Resolved handler acknowledges this job; no retry is requested from the broker.
    await expect(
      handler(s.payload, { signal: new AbortController().signal }),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledExactlyOnceWith("Market sync skipped: INVALID_RESPONSE");
    expect(repository.commit).not.toHaveBeenCalled();
    expect(receipts.size).toBe(0);
    expect(s.http).toHaveBeenCalledTimes(1);
    expect(s.store.acquire).toHaveBeenCalledTimes(1);
    expect(s.store.clear).toHaveBeenCalledTimes(1);
    await s.permit.stop();
  });
});
