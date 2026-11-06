import { describe, expect, it } from "vitest";
import { createMoneyCapabilitiesRouteHandler } from "./money-capabilities-routes";
import { MoneyCapabilitiesSchema } from "@sammlerraum/contracts/money-capabilities";
const origin = "https://sammlerraum.example.invalid";
describe("private monetary capability response", () => {
  it("never caches compatibility and keeps canonical consumers disabled independently of authoring", async () => {
    for (const enabled of [true, false]) {
      let sessions = 0;
      const get = createMoneyCapabilitiesRouteHandler({
        appOrigin: origin,
        authoringEnabled: enabled,
        getSession: async () => {
          sessions++;
          return { user: { id: "synthetic" } };
        },
      });
      const response = await get(new Request(`${origin}/api/v1/money/capabilities`));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-request-id")).toBeTruthy();
      expect(MoneyCapabilitiesSchema.parse(await response.json())).toMatchObject({
        canonicalConsumers: false,
        authoringProfiles: enabled ? [expect.anything()] : [],
      });
      expect(sessions).toBe(1);
    }
  });
  it("denies foreign origin before session access and requires a live session", async () => {
    let sessions = 0;
    const get = createMoneyCapabilitiesRouteHandler({
      appOrigin: origin,
      authoringEnabled: true,
      getSession: async () => {
        sessions++;
        return null;
      },
    });
    expect(
      (
        await get(
          new Request(`${origin}/api/v1/money/capabilities`, {
            headers: { origin: "https://foreign.invalid" },
          }),
        )
      ).status,
    ).toBe(403);
    expect(sessions).toBe(0);
    expect((await get(new Request(`${origin}/api/v1/money/capabilities`))).status).toBe(401);
    expect(sessions).toBe(1);
  });
  it("does not accept client selection of supported profile or activation", async () => {
    const get = createMoneyCapabilitiesRouteHandler({
      appOrigin: origin,
      authoringEnabled: false,
      getSession: async () => ({ user: { id: "synthetic" } }),
    });
    expect(
      (await get(new Request(`${origin}/api/v1/money/capabilities?authoringEnabled=true`))).status,
    ).toBe(400);
  });
});
