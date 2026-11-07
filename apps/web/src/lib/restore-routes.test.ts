import { describe, it, expect, vi } from "vitest";
import { createRestoreRouteDependencies, createRestoreRouteHandlers } from "./restore-routes";
const origin = "https://example.invalid",
  eventId = "00000000-0000-4000-8000-000000000001",
  body = {
    field: "visibility",
    expectedUpdatedAt: "2026-11-07T00:00:00.000Z",
    expectedLatestSequence: "1",
  };
function fixture(signedIn = true) {
  const transact = vi.fn(async () => {
      throw new Error("private-restore-sql-sentinel");
    }),
    getSession = vi.fn(async () => (signedIn ? { user: { id: "trusted-owned-session" } } : null)),
    handlers = createRestoreRouteHandlers(
      createRestoreRouteDependencies({ $transaction: transact }, { api: { getSession } }, origin),
    );
  return { transact, getSession, handlers };
}
function post(value = JSON.stringify(body), headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/v1/audit/${eventId}/restore`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body: value,
  });
}
async function closed(response: Response, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const value = await response.json();
  expect(value).toHaveProperty("error.requestId");
  expect(JSON.stringify(value)).not.toMatch(
    /private-restore-sql-sentinel|trusted-owned-session|postgres|Prisma/,
  );
}
describe("private restoration HTTP boundary", () => {
  it("rejects cross-origin writes before reading a session or database", async () => {
    const f = fixture();
    await closed(
      await f.handlers.POST(post(undefined, { origin: "https://foreign.invalid" }), eventId),
      403,
    );
    expect(f.getSession).not.toHaveBeenCalled();
    expect(f.transact).not.toHaveBeenCalled();
  });
  it("requires a fresh real server session", async () => {
    const f = fixture(false);
    await closed(await f.handlers.POST(post(), eventId), 401);
    expect(f.getSession).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      query: { disableCookieCache: true, disableRefresh: true },
    });
    expect(f.transact).not.toHaveBeenCalled();
  });
  it.each([
    JSON.stringify({ ...body, userId: "forged-owner" }),
    JSON.stringify({ ...body, source: "SYSTEM" }),
    JSON.stringify({ ...body, resourceId: eventId }),
    JSON.stringify({ ...body, field: "purchaseAmountMinor" }),
    JSON.stringify({ ...body, expectedLatestSequence: "9223372036854775808" }),
    ' {"field":"visibility","field":"title","expectedUpdatedAt":"2026-11-07T00:00:00.000Z","expectedLatestSequence":"1"}',
  ])("rejects forged or structurally ambiguous input before domain access", async (value) => {
    const f = fixture();
    await closed(await f.handlers.POST(post(value), eventId), 400);
    expect(f.transact).not.toHaveBeenCalled();
  });
  it("bounds the body and requires JSON", async () => {
    const f = fixture();
    await closed(await f.handlers.POST(post("x".repeat(20000)), eventId), 413);
    await closed(
      await f.handlers.POST(post(undefined, { "content-type": "text/plain" }), eventId),
      400,
    );
    expect(f.transact).not.toHaveBeenCalled();
  });
  it("rejects unknown URL parameters before private access", async () => {
    const f = fixture();
    await closed(
      await f.handlers.GET(
        new Request(`${origin}/api/v1/audit/${eventId}/restore?userId=forged`),
        eventId,
      ),
      400,
    );
    expect(f.transact).not.toHaveBeenCalled();
  });
  it("closes unexpected backend errors and does not cache private responses", async () => {
    const f = fixture();
    await closed(await f.handlers.POST(post(), eventId), 500);
    expect(f.transact).toHaveBeenCalled();
  });
});
