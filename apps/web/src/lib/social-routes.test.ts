import { describe, it, expect, vi } from "vitest";
import { createSocialDependencies, createSocialHandlers } from "./social-routes";
const origin = "https://example.invalid";
function fixture(authorized = true) {
  const transaction = vi.fn(async () => {
    throw Error("private-social-database-sentinel");
  });
  const getSession = vi.fn(async () =>
    authorized ? { user: { id: "actual-session-actor" } } : null,
  );
  const handlers = createSocialHandlers(
    createSocialDependencies({ $transaction: transaction }, { api: { getSession } }, origin),
  );
  return { transaction, getSession, handlers };
}
function request(body: unknown, from = origin, method = "POST") {
  return new Request(origin + "/api/v1/community/follows", {
    method,
    headers: { origin: from, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
describe("private authenticated community HTTP boundary", () => {
  it("denies cross-origin mutations before authentication or database reads", async () => {
    const f = fixture();
    expect(
      (await f.handlers.FOLLOW(request({ userId: "target" }, "https://foreign.invalid"))).status,
    ).toBe(403);
    expect(f.getSession).not.toHaveBeenCalled();
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it("requires an actual current cookie session", async () => {
    const f = fixture(false);
    expect((await f.handlers.FOLLOW(request({ userId: "target" }))).status).toBe(401);
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it.each([
    { userId: "target", actorId: "forged" },
    { userId: "target", source: "MODERATION" },
    { userId: "" },
  ])("rejects actor/source injection and malformed target", async (body) => {
    const f = fixture();
    expect((await f.handlers.FOLLOW(request(body))).status).toBe(400);
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it("rejects duplicate decoded JSON keys and never returns database diagnostics", async () => {
    const f = fixture(),
      duplicate = new Request(origin + "/api/v1/community/follows", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: '{"userId":"one","userId":"two"}',
      });
    expect((await f.handlers.FOLLOW(duplicate)).status).toBe(400);
    expect(f.transaction).not.toHaveBeenCalled();
    const result = await f.handlers.FOLLOW(request({ userId: "target" }));
    expect(result.status).toBe(500);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.text()).not.toMatch(
      /private-social-database-sentinel|actual-session-actor/,
    );
  });
  it("permits no private-document favorite target or actor override on removal", async () => {
    const f = fixture();
    expect(
      (
        await f.handlers.FAVORITE(
          request({ type: "DOCUMENT", id: "00000000-0000-4000-8000-000000000001" }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await f.handlers.UNFOLLOW(
          request({ userId: "target", actorId: "forged" }, origin, "DELETE"),
        )
      ).status,
    ).toBe(400);
    expect(f.transaction).not.toHaveBeenCalled();
  });
});
