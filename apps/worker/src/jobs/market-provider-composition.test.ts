import { describe, expect, it, vi } from "vitest";
import { parseServerEnv } from "@sammlerraum/config/server";
import { createProductionMarketProviders } from "./market-provider-composition";
const base = {
  DATABASE_URL: "postgresql://test:test@localhost:5432/sammlerraum_test",
  APP_ORIGIN: "http://localhost:3000",
  UPLOADS_DIR: "/tmp/uploads",
};
describe("production provider config", () => {
  it("defaults off with zero budgets; credentials alone never register providers", () => {
    const config = parseServerEnv({
      ...base,
      SCRYDEX_API_KEY: "token",
      SCRYDEX_TEAM_ID: "team",
      PRICECHARTING_API_TOKEN: "token",
    });
    expect(config.SCRYDEX_ENABLED).toBe(false);
    expect(config.PRICECHARTING_ENABLED).toBe(false);
    expect(config.SCRYDEX_HOURLY_CALL_BUDGET).toBe(0);
    const database = { $transaction: vi.fn() };
    const result = createProductionMarketProviders({ config, database });
    expect(result.registrations).toEqual([]);
    expect(database.$transaction).not.toHaveBeenCalled();
  });
  it.each([
    {},
    { PRICECHARTING_API_TOKEN: "token" },
    {
      PRICECHARTING_API_TOKEN: "token",
      PRICECHARTING_HOURLY_CALL_BUDGET: "1",
      PRICECHARTING_DAILY_CALL_BUDGET: "1",
    },
  ])("rejects enabled setup without credentials, budgets and explicit approved policy", (extra) => {
    expect(() =>
      parseServerEnv({
        ...base,
        MARKET_SYNC_ENABLED: "true",
        PRICECHARTING_ENABLED: "true",
        ...extra,
      }),
    ).toThrow("Invalid environment configuration");
  });
  it.each([" token", "token ", "token\n", "token\u0000", ""])(
    "rejects ambiguous credential bytes without disclosing values",
    (token) => {
      expect(() => parseServerEnv({ ...base, PRICECHARTING_API_TOKEN: token })).toThrow(
        "PRICECHARTING_API_TOKEN",
      );
    },
  );
  it("constructs the real explicit registry with injected fake HTTP only after validated activation", async () => {
    const config = parseServerEnv({
      ...base,
      MARKET_SYNC_ENABLED: "true",
      PRICECHARTING_ENABLED: "true",
      PRICECHARTING_API_TOKEN: "token",
      PRICECHARTING_POLICY_APPROVED: "true",
      PRICECHARTING_HOURLY_CALL_BUDGET: "1",
      PRICECHARTING_DAILY_CALL_BUDGET: "2",
    });
    const result = createProductionMarketProviders({ config, database: { $transaction: vi.fn() } });
    expect(
      result.registrations.map((r) => [r.provider.id, r.identifierNamespace, r.identifierType]),
    ).toEqual([["pricecharting", "pricecharting", "product_category"]]);
    await result.requestLifecycle.stop();
  });
});

it("zero or missing request policy cannot touch the database or send HTTP", async () => {
  const { createPostgresMarketGate, createMarketRequestPermit } = await import(
    "./market-request-permit"
  );
  const { credentialKey } = await import("@sammlerraum/market-data/provider-http");
  const key = credentialKey("pricecharting", "fixture-token");
  for (const policies of [
    [],
    [{ credentialKey: key, service: "pricecharting" as const, hourly: 0, daily: 0 }],
  ]) {
    const database = { $transaction: vi.fn() },
      send = vi.fn();
    const permit = createMarketRequestPermit({
      store: createPostgresMarketGate(database, policies),
    });
    await expect(
      permit.run({ credentialKey: key, signal: new AbortController().signal }, send),
    ).rejects.toMatchObject({ code: "PERMIT_UNAVAILABLE" });
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    await permit.stop();
  }
});
