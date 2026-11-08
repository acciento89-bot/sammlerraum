import { it, expect, vi } from "vitest";
it("loads product quota configuration without unrelated database/auth environment side effects", async () => {
  vi.stubEnv("DATABASE_URL", undefined);
  vi.stubEnv("APP_ORIGIN", undefined);
  vi.stubEnv("UPLOADS_DIR", undefined);
  try {
    const path = "./billing",
      m = await import(path).catch(() => null);
    expect(m?.parseBillingPolicyEnv, "pure product policy parser").toBeTypeOf("function");
    expect(m?.parseBillingContextEnv({ NODE_ENV: "production" })).toEqual({
      liveMode: true,
      providerIds: ["stripe_live"],
    });
  } finally {
    vi.unstubAllEnvs();
  }
});
