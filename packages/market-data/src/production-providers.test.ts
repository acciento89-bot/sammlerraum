import { describe, expect, it, vi } from "vitest";
import { inspect } from "node:util";
import { parseLocalizedMoney, MAX_AMOUNT_MINOR } from "../../domain/src/money/money";
import { currencyMinorUnitExponent } from "../../domain/src/money/currencies";
import { makeScrydexProvider } from "./scrydex-provider";
import { makePriceChartingProvider } from "./pricecharting-provider";
import { credentialKey, type ProviderDependencies } from "./provider-http";
import { ProviderFailure } from "./provider-failure";
import type { MarketFetchRequest } from "./types";
const money = {
  parseMajorUnits: (value: string, currency: string) =>
    parseLocalizedMoney(value, "en", currency).amountMinor,
  validateMinorUnits: (value: bigint, currency: string) => {
    currencyMinorUnitExponent(currency);
    if (value < 0n || value > MAX_AMOUNT_MINOR) throw Error("money");
    return value;
  },
};
const request = (id: string, scrydex = false): MarketFetchRequest => ({
  pollId: "poll",
  target: {
    entryId: "entry",
    variantId: scrydex ? "variant" : null,
    revision: 1,
    identifierId: "id",
    namespace: scrydex ? "scrydex" : "pricecharting",
    identifierType: scrydex ? "pokemon_card_variant" : "product_category",
    externalId: id,
  },
});
const pc = request('["v1","cards","1234","Pokemon Base Set"]');
const sc = request('["v1","pokemon","base1-4","unlimitedHolofoil"]', true);
const source = (prices: string) =>
  `{"id":"base1-4","variants":[{"name":"unlimitedHolofoil","prices":${prices}}]}`;
const product = (fields: string) =>
  `{"status":"success","id":"1234","console-name":"Pokemon Base Set",${fields}}`;
function setup(body: string, status = 200) {
  const http = vi.fn(async () => new Response(body, { status }));
  const permit = { run: vi.fn(async (_context, send) => send(_context.signal)) };
  const deps: ProviderDependencies = {
    token: "synthetic-token",
    enabled: true,
    fetch: http,
    permit,
    money,
    clock: () => new Date("2026-10-18T05:00:00.000Z"),
  };
  return { deps, http, permit };
}
const context = () => ({ signal: new AbortController().signal, reportFetchedAt: vi.fn() });
describe("exact production guide contracts (fake HTTP only)", () => {
  it("preserves numeric zero and integers beyond Number precision as pennies", async () => {
    const { deps, http, permit } = setup(
      product('"loose-price":9007199254740993,"manual-only-price":0,"cib-price":null'),
    );
    const ctx = context();
    const rows = await makePriceChartingProvider(deps).fetch(pc, ctx);
    expect(rows.map((r) => [r.sourceMetric, "amountMinor" in r ? r.amountMinor : null])).toEqual([
      ["pricecharting.loose-price", 9007199254740993n],
      ["pricecharting.manual-only-price", 0n],
    ]);
    expect(rows[1]).toMatchObject({
      kind: "CATALOG_VALUE",
      currency: "USD",
      qualifiers: { category: "cards", bucket: "PSA 10" },
      time: { basis: "FETCH", precision: "MILLISECOND" },
      identity: { mode: "POLL" },
      externalId: pc.target.externalId,
    });
    expect(ctx.reportFetchedAt).toHaveBeenCalledExactlyOnceWith("2026-10-18T05:00:00.000Z");
    expect(http).toHaveBeenCalledTimes(1);
    const [url, init] = http.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toBe("/api/product");
    expect(url.searchParams.get("t")).toBe("synthetic-token");
    expect(url.searchParams.get("id")).toBe("1234");
    expect(init.redirect).toBe("error");
    expect(permit.run.mock.calls[0]![0].credentialKey).toBe(
      credentialKey("pricecharting", "synthetic-token"),
    );
  });
  it("uses category-specific source buckets without invented company", async () => {
    const { deps } = setup(
      '{"status":"success","id":"1234","console-name":"NES","manual-only-price":99}',
    );
    expect(
      (await makePriceChartingProvider(deps).fetch(request('["v1","video_games","1234","NES"]')))[0]
        ?.qualifiers,
    ).toEqual({ category: "video_games", bucket: "manual" });
  });
  it("maps selected raw/graded metrics with exact decimals and honest qualifiers", async () => {
    const { deps } = setup(
      source(
        '[{"type":"raw","condition":"NM","currency":"USD","low":0,"market":1.230},{"type":"graded","company":"CGC","grade":"9.5","is_signed":true,"currency":"JPY","mid":100.0}]',
      ),
    );
    const rows = await makeScrydexProvider({ ...deps, teamId: "team-a" }).fetch(sc);
    expect(rows.map((r) => ["amountMinor" in r ? r.amountMinor : null, r.kind])).toEqual([
      [0n, "CATALOG_VALUE"],
      [123n, "CATALOG_VALUE"],
      [100n, "CATALOG_VALUE"],
    ]);
    expect(rows[2]).toMatchObject({
      sourceMetric: "scrydex.graded.mid",
      qualifiers: {
        variant: "unlimitedHolofoil",
        type: "graded",
        company: "CGC",
        grade: "9.5",
        is_signed: true,
      },
    });
  });
  it.each(["-1", "-0", "1e2", "1.5", "9223372036854775808", '"12"', "true", "{}"])(
    "rejects invalid penny token %s as a whole batch",
    async (value) => {
      const { deps } = setup(product(`"loose-price":1,"new-price":${value}`));
      await expect(makePriceChartingProvider(deps).fetch(pc)).rejects.toMatchObject({
        code: "INVALID_RESPONSE",
        retryable: false,
      });
    },
  );
  it.each([
    ["USD", "1.231"],
    ["JPY", "100.1"],
    ["ZZZ", "1"],
    ["USD", "1e2"],
  ])("rejects unsupported precision/currency %s %s", async (currency, value) => {
    const { deps } = setup(
      source(`[{"type":"raw","condition":"NM","currency":"${currency}","market":${value}}]`),
    );
    await expect(makeScrydexProvider({ ...deps, teamId: "team" }).fetch(sc)).rejects.toBeInstanceOf(
      ProviderFailure,
    );
  });
  it.each([
    product('"loose-price":1').replace('"1234"', '"999"'),
    product('"loose-price":1').replace("Pokemon Base Set", "NES"),
    '{"status":"error","error-message":"secret"}',
  ])("rejects mismatched or unsuccessful product response", async (body) => {
    const { deps } = setup(body);
    await expect(makePriceChartingProvider(deps).fetch(pc)).rejects.toMatchObject({
      retryable: false,
    });
  });
  it.each([
    '{"data":{"id":"base1-4"}}',
    '{"id":"base1-4","variants":[]}',
    source("null"),
    '{"id":"base1-4","variants":[{"name":"unlimitedHolofoil","prices":[]},{"name":"unlimitedHolofoil","prices":[]}]}',
  ])("fails closed on missing/ambiguous selected card data", async (body) => {
    const { deps } = setup(body);
    await expect(makeScrydexProvider({ ...deps, teamId: "team" }).fetch(sc)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
  it("accepts explicit empty arrays and absent guide fields", async () => {
    expect(
      await makeScrydexProvider({ ...setup(source("[]")).deps, teamId: "team" }).fetch(sc),
    ).toEqual([]);
    expect(
      await makePriceChartingProvider(
        setup('{"status":"success","id":"1234","console-name":"Pokemon Base Set"}').deps,
      ).fetch(pc),
    ).toEqual([]);
  });
  it.each([
    '["v1","cards","0123","NES"]',
    ' ["v1","cards","1234","NES"]',
    "upc=1234",
    '["v2","cards","1234","NES"]',
  ])("rejects noncanonical mapping before admission %s", async (id) => {
    const { deps, http, permit } = setup("{}");
    await expect(makePriceChartingProvider(deps).fetch(request(id))).rejects.toMatchObject({
      code: "INVALID_MAPPING",
    });
    expect(http).not.toHaveBeenCalled();
    expect(permit.run).not.toHaveBeenCalled();
  });
  it.each(["", " token", "token ", "token\n", "token\u0000"])(
    "rejects unsafe credentials without exposing them",
    (token) => {
      const { deps } = setup("{}");
      expect(() => makePriceChartingProvider({ ...deps, token })).toThrow("PROVIDER_CONFIGURATION");
      expect(() => makeScrydexProvider({ ...deps, teamId: token })).toThrow(
        "PROVIDER_CONFIGURATION",
      );
    },
  );
  it("shares token gate across teams and preserves exact accepted authentication", async () => {
    const { deps, http, permit } = setup(source("[]"));
    await makeScrydexProvider({ ...deps, teamId: "a" }).fetch(sc);
    await makeScrydexProvider({ ...deps, teamId: "b" }).fetch(sc);
    expect(permit.run.mock.calls[0]![0].credentialKey).toBe(
      permit.run.mock.calls[1]![0].credentialKey,
    );
    expect(
      new Headers((http.mock.calls[0] as unknown as [URL, RequestInit])[1].headers).get(
        "X-Api-Key",
      ),
    ).toBe("synthetic-token");
  });
  it("does not admit disabled or cancelled calls", async () => {
    const { deps, http, permit } = setup("{}");
    await expect(
      makePriceChartingProvider({ ...deps, enabled: false }).fetch(pc),
    ).rejects.toBeInstanceOf(ProviderFailure);
    await expect(
      makePriceChartingProvider(deps).fetch(pc, { signal: AbortSignal.abort() }),
    ).rejects.toBeInstanceOf(ProviderFailure);
    expect(http).not.toHaveBeenCalled();
    expect(permit.run).not.toHaveBeenCalled();
  });
  it.each([
    [401, false],
    [403, false],
    [429, true],
    [500, true],
  ])("classifies HTTP %i safely", async (status, retryable) => {
    const { deps } = setup("secret-provider-body", status as number);
    const error = await makePriceChartingProvider(deps)
      .fetch(pc)
      .catch((e) => e);
    expect(error.retryable).toBe(retryable);
    expect(inspect(error, { showHidden: true })).not.toContain("secret-provider-body");
    expect(error.cause).toBeUndefined();
  });
  it("strips transport messages, causes and stacks", async () => {
    const { deps } = setup("{}");
    deps.fetch = vi.fn(async () => {
      throw new Error("secret-token-url", { cause: new Error("private-body") });
    });
    const error = await makePriceChartingProvider(deps)
      .fetch(pc)
      .catch((e) => e);
    expect(inspect(error, { showHidden: true })).not.toMatch(/secret-token-url|private-body/);
    expect(error.code).toBe("TRANSPORT");
  });
  it("rejects excessive body, depth, numeric tokens and record count", async () => {
    for (const body of [
      " ".repeat(262145),
      '{"ignored":' + "[".repeat(33) + "0" + "]".repeat(33) + "}",
      product('"loose-price":' + "1".repeat(81)),
      source(
        JSON.stringify(
          Array.from({ length: 26 }, () => ({
            type: "raw",
            condition: "NM",
            currency: "USD",
            low: 1,
          })),
        ),
      ),
    ]) {
      const { deps } = setup(body);
      await expect(
        makeScrydexProvider({ ...deps, teamId: "team" }).fetch(sc),
      ).rejects.toBeInstanceOf(ProviderFailure);
    }
  });
});

it("awaits body cancellation on an oversized stream before releasing the transport", async () => {
  const { deps } = setup("{}");
  let finish!: () => void;
  let cancelled = false;
  const cancellation = new Promise<void>((r) => (finish = r));
  deps.fetch = vi.fn(
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new Uint8Array(262145));
          },
          async cancel() {
            cancelled = true;
            await cancellation;
          },
        }),
      ),
  );
  const task = makePriceChartingProvider(deps).fetch(pc);
  let done = false;
  const outcome = task.catch((e) => {
    done = true;
    return e;
  });
  await vi.waitFor(() => expect(cancelled).toBe(true));
  expect(done).toBe(false);
  finish();
  expect((await outcome).code).toBe("INVALID_RESPONSE");
});
it("normal aborted body read settles without inventing cancellation uncertainty", async () => {
  const { deps } = setup("{}");
  const ac = new AbortController();
  let entered!: () => void;
  const ready = new Promise<void>((r) => (entered = r));
  deps.fetch = vi.fn(
    async (_url, init) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            init!.signal!.addEventListener("abort", () => c.error(new Error("private abort")), {
              once: true,
            });
            entered();
          },
        }),
      ),
  );
  const task = makePriceChartingProvider(deps).fetch(pc, { signal: ac.signal });
  const outcome = expect(task).rejects.toMatchObject({ code: "INTERRUPTED" });
  await ready;
  ac.abort();
  await outcome;
});
it("reports body receipt before UTF8/JSON decoding fails", async () => {
  const { deps } = setup("{}");
  deps.fetch = vi.fn(async () => new Response(new Uint8Array([255])));
  const ctx = context();
  await expect(makePriceChartingProvider(deps).fetch(pc, ctx)).rejects.toBeInstanceOf(
    ProviderFailure,
  );
  expect(ctx.reportFetchedAt).toHaveBeenCalledExactlyOnceWith("2026-10-18T05:00:00.000Z");
});
