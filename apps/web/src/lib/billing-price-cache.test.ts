import { it, expect, vi } from "vitest";
const offers = [
  {
    cadence: "MONTHLY",
    amountMinor: "2900",
    currency: "EUR",
    minorUnitExponent: 2,
    taxBehavior: "inclusive",
  },
  {
    cadence: "YEARLY",
    amountMinor: "29000",
    currency: "EUR",
    minorUnitExponent: 2,
    taxBehavior: "inclusive",
  },
];
async function cache(now: () => number) {
  const path = "./billing-price-cache";
  const module = await import(path).catch(() => null);
  expect(module?.createBillingPriceCache).toBeTypeOf("function");
  return module!.createBillingPriceCache(now);
}
it("coalesces concurrent metadata reads, keeps returned objects isolated and expires successes", async () => {
  let now = 0;
  const c = await cache(() => now),
    load = vi.fn(async () => structuredClone(offers));
  const [a, b] = await Promise.all([c.read("config-A", load), c.read("config-A", load)]);
  expect(load).toHaveBeenCalledTimes(1);
  a![0]!.amountMinor = "1";
  expect(b![0]!.amountMinor).toBe("2900");
  now = 299999;
  expect((await c.read("config-A", load))![0]!.amountMinor).toBe("2900");
  expect(load).toHaveBeenCalledTimes(1);
  now = 300001;
  await c.read("config-A", load);
  expect(load).toHaveBeenCalledTimes(2);
});
it("backs off failed metadata and invalidates only for changed provider configuration", async () => {
  let now = 0;
  const c = await cache(() => now),
    load = vi.fn(async () => {
      throw Error("private provider details");
    });
  expect(await c.read("config-A", load)).toBeNull();
  expect(await c.read("config-A", load)).toBeNull();
  expect(load).toHaveBeenCalledTimes(1);
  await c.read("config-B", load);
  expect(load).toHaveBeenCalledTimes(2);
  now = 30001;
  await c.read("config-B", load);
  expect(load).toHaveBeenCalledTimes(3);
});
it("never publishes partial or duplicate-cadence offers", async () => {
  const c = await cache(() => 0);
  expect(await c.read("partial", async () => offers.slice(0, 1))).toBeNull();
  expect(await c.read("duplicate", async () => [offers[0], offers[0]])).toBeNull();
});
