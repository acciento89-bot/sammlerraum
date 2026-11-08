import { describe, it, expect, vi } from "vitest";
import {
  createCommunityWorkspaceDependencies,
  createCommunityWorkspaceHandlers,
} from "./community-wishlist-routes";
const origin = "https://example.invalid",
  id = "00000000-0000-4000-8000-000000000001";
function fixture(signedIn = true) {
  const transaction = vi.fn(async () => {
    throw Error("private-wishlist-sentinel");
  });
  const getSession = vi.fn(async () => (signedIn ? { user: { id: "actual-wish-session" } } : null));
  return {
    transaction,
    getSession,
    handlers: createCommunityWorkspaceHandlers(
      createCommunityWorkspaceDependencies(
        { $transaction: transaction },
        { api: { getSession } },
        origin,
      ),
    ),
  };
}
function request(body: unknown, from = origin) {
  return new Request(origin + "/api/v1/wishlist", {
    method: "POST",
    headers: { origin: from, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
describe("authenticated feed and private wishlist boundary", () => {
  it("requires a fresh session for feed and private wishes", async () => {
    const f = fixture(false);
    expect((await f.handlers.FEED(new Request(origin + "/api/v1/community/feed"))).status).toBe(
      401,
    );
    expect((await f.handlers.WISHLIST(new Request(origin + "/api/v1/wishlist"))).status).toBe(401);
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it("rejects cross-origin creation before authentication lookup", async () => {
    const f = fixture();
    expect(
      (await f.handlers.CREATE(request({ title: "Wish" }, "https://foreign.invalid"))).status,
    ).toBe(403);
    expect(f.getSession).not.toHaveBeenCalled();
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it("rejects injected ownership and duplicate pairs that reference one specimen twice", async () => {
    const f = fixture();
    expect((await f.handlers.CREATE(request({ title: "Wish", ownerId: "other" }))).status).toBe(
      400,
    );
    expect((await f.handlers.MARK_DUPLICATE(request({ itemAId: id, itemBId: id }))).status).toBe(
      400,
    );
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it("rejects unknown viewer filters before querying private data", async () => {
    const f = fixture();
    expect(
      (await f.handlers.FEED(new Request(origin + "/api/v1/community/feed?viewerId=other"))).status,
    ).toBe(400);
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it("returns no-store errors without database/session diagnostics", async () => {
    const f = fixture();
    const response = await f.handlers.WISHLIST(new Request(origin + "/api/v1/wishlist"));
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toMatch(/private-wishlist-sentinel|actual-wish-session/);
  });
});
