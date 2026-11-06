import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MoneyCapabilitiesSchema } from "@sammlerraum/contracts/money-capabilities";
import {
  LEGACY_MONEY_PROFILE_ID,
  LEGACY_MONEY_AUTHORITY_HASH,
} from "@sammlerraum/contracts/legacy-money";
import { loadMoneyCapabilities, writeMoney } from "./legacy-money-client";
const capabilities = MoneyCapabilitiesSchema.parse({
  actorId: "synthetic",
  schemaVersion: 1,
  readVersion: 1,
  authoringProfiles: [
    { profileId: LEGACY_MONEY_PROFILE_ID, authorityHash: LEGACY_MONEY_AUTHORITY_HASH },
  ],
  classificationVersion: 1,
  canonicalConsumers: false,
});
const ack = z.object({ accepted: z.literal(true) }).strict();
describe("monetary request acknowledgment", () => {
  it("accepts only affirmative pinned capability and never falls back from a missing route", async () => {
    let calls = 0;
    await expect(
      loadMoneyCapabilities(async (url) => {
        calls++;
        expect(url).toBe("/api/v1/money/capabilities");
        return new Response("not found", { status: 404 });
      }),
    ).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect(calls).toBe(1);
    const loaded = await loadMoneyCapabilities(async () => Response.json(capabilities));
    expect(loaded).toEqual(capabilities);
  });
  it("blocks a disabled profile before attempting a write", async () => {
    let calls = 0;
    await expect(
      writeMoney(
        "/explicit",
        "POST",
        {},
        ack,
        { ...capabilities, authoringProfiles: [] },
        async () => {
          calls++;
          return Response.json({ accepted: true });
        },
      ),
    ).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
    expect(calls).toBe(0);
  });
  it("treats a lost response or server error as unknown and never retries", async () => {
    let calls = 0;
    await expect(
      writeMoney("/explicit", "POST", {}, ack, capabilities, async () => {
        calls++;
        throw new TypeError("synthetic network loss after possible commit");
      }),
    ).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    expect(calls).toBe(1);
    await expect(
      writeMoney(
        "/explicit",
        "POST",
        {},
        ack,
        capabilities,
        async () => new Response("unavailable", { status: 503 }),
      ),
    ).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN", status: 503 });
  });
  it("distinguishes an acknowledged but unreadable response from a rejected mutation", async () => {
    await expect(
      writeMoney("/explicit", "PATCH", {}, ack, capabilities, async () =>
        Response.json({ wrong: true }),
      ),
    ).rejects.toMatchObject({ code: "ACKNOWLEDGED_UNREADABLE", status: 200 });
    await expect(
      writeMoney("/explicit", "PATCH", {}, ack, capabilities, async () =>
        Response.json({ error: { code: "MONEY_CONFLICT" } }, { status: 409 }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
    await expect(
      writeMoney(
        "/explicit",
        "PATCH",
        {},
        ack,
        capabilities,
        async () => new Response("forbidden", { status: 403 }),
      ),
    ).rejects.toMatchObject({ code: "REFUSED", status: 403 });
  });
  it("returns the validated acknowledgment and uses only the explicit requested route", async () => {
    let calls = 0;
    const result = await writeMoney(
      "/api/v1/money/items",
      "POST",
      { schemaVersion: 1 },
      ack,
      capabilities,
      async (url, init) => {
        calls++;
        expect(url).toBe("/api/v1/money/items");
        expect(init).toMatchObject({
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
        });
        expect(new Headers(init?.headers).get("x-money-actor")).toBe(capabilities.actorId);
        expect(JSON.parse(String(init?.body))).toEqual({ schemaVersion: 1 });
        return Response.json({ accepted: true }, { status: 201 });
      },
    );
    expect(result).toEqual({ accepted: true });
    expect(calls).toBe(1);
  });
});
