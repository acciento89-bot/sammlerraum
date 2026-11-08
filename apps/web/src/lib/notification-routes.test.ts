import { describe, it, expect, vi } from "vitest";
import { createNotificationDependencies, createNotificationHandlers } from "./notification-routes";
const origin = "https://example.invalid",
  id = "00000000-0000-4000-8000-000000000001";
function fixture(signedIn = true) {
  const transaction = vi.fn(async () => {
    throw Error("private-notification-sentinel");
  });
  const getSession = vi.fn(async () =>
    signedIn ? { user: { id: "actual-notice-session" } } : null,
  );
  return {
    transaction,
    getSession,
    handlers: createNotificationHandlers(
      createNotificationDependencies(
        { $transaction: transaction },
        { api: { getSession } },
        origin,
      ),
    ),
  };
}
function request(body: unknown, from = origin) {
  return new Request(origin + "/api/v1/notifications/preferences", {
    method: "PATCH",
    headers: { origin: from, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
describe("private notification HTTP boundary", () => {
  it("requires a current session for listing and preferences", async () => {
    const f = fixture(false);
    expect((await f.handlers.LIST(new Request(origin + "/api/v1/notifications"))).status).toBe(401);
    expect(
      (await f.handlers.PREFERENCES(new Request(origin + "/api/v1/notifications/preferences")))
        .status,
    ).toBe(401);
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it("rejects cross-origin changes before session lookup", async () => {
    const f = fixture();
    expect(
      (await f.handlers.UPDATE_PREFERENCES(request({ preferences: [] }, "https://foreign.invalid")))
        .status,
    ).toBe(403);
    expect(f.getSession).not.toHaveBeenCalled();
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it.each([
    { preferences: [], userId: "other" },
    { preferences: [{ category: "COMMUNITY", channel: "SMS", enabled: true }] },
    {
      preferences: [
        { category: "ACCOUNT", channel: "EMAIL", enabled: true },
        { category: "ACCOUNT", channel: "EMAIL", enabled: false },
      ],
    },
  ])(
    "rejects recipient injection, unsupported channels and duplicate category keys",
    async (body) => {
      const f = fixture();
      expect((await f.handlers.UPDATE_PREFERENCES(request(body))).status).toBe(400);
      expect(f.transaction).not.toHaveBeenCalled();
    },
  );
  it("has no client create-event endpoint and accepts no data on mark-read", async () => {
    const f = fixture();
    expect((await f.handlers.READ(request({ recipientId: "forged" }), id)).status).toBe(400);
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it("does not expose private diagnostics", async () => {
    const f = fixture();
    const r = await f.handlers.LIST(new Request(origin + "/api/v1/notifications"));
    expect(r.status).toBe(500);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.text()).not.toMatch(/private-notification-sentinel|actual-notice-session/);
  });
});
