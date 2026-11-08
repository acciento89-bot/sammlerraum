import { describe, it, expect, vi } from "vitest";
import { createModerationDependencies, createModerationHandlers } from "./moderation-routes";
const origin = "https://example.invalid",
  id = "00000000-0000-4000-8000-000000000001";
function fixture(signedIn = true) {
  const transaction = vi.fn(async () => {
    throw Error("private-moderation-sentinel");
  });
  const getSession = vi.fn(async () =>
    signedIn ? { user: { id: "actual-moderator-session" } } : null,
  );
  return {
    transaction,
    getSession,
    handlers: createModerationHandlers(
      createModerationDependencies({ $transaction: transaction }, { api: { getSession } }, origin),
    ),
  };
}
function request(body: unknown, from = origin) {
  return new Request(origin + "/api/v1/moderation/comments/" + id, {
    method: "POST",
    headers: { origin: from, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
describe("platform moderation HTTP boundary", () => {
  it("rejects a cross-origin decision before session and database access", async () => {
    const f = fixture();
    expect(
      (
        await f.handlers.VISIBILITY(
          request({ action: "HIDE", reason: "Review" }, "https://foreign.invalid"),
          id,
        )
      ).status,
    ).toBe(403);
    expect(f.getSession).not.toHaveBeenCalled();
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it("requires authentication for private reports and review text", async () => {
    const f = fixture(false);
    expect(
      (await f.handlers.REPORTS(new Request(origin + "/api/v1/moderation/reports"))).status,
    ).toBe(401);
    expect(
      (await f.handlers.REVIEW(new Request(origin + "/api/v1/moderation/comments/" + id), id))
        .status,
    ).toBe(401);
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it.each([
    { action: "HIDE", reason: "Review", isModerator: true },
    { action: "HIDE", reason: "Review", source: "USER" },
    { action: "HIDE", reason: " " },
  ])("rejects role/source injection and missing reasons", async (body) => {
    const f = fixture();
    expect((await f.handlers.VISIBILITY(request(body), id)).status).toBe(400);
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it("does not expose private backend diagnostics", async () => {
    const f = fixture();
    const result = await f.handlers.REPORTS(new Request(origin + "/api/v1/moderation/reports"));
    expect(result.status).toBe(500);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.text()).not.toMatch(/private-moderation-sentinel|actual-moderator-session/);
  });
});
