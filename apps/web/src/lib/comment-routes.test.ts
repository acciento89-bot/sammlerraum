import { describe, it, expect, vi } from "vitest";
import { createCommentDependencies, createCommentHandlers } from "./comment-routes";
const origin = "https://example.invalid",
  id = "00000000-0000-4000-8000-000000000001";
function fixture(authorized = true) {
  const transaction = vi.fn(async () => {
      throw Error("private-comment-database-sentinel");
    }),
    getSession = vi.fn(async () =>
      authorized ? { user: { id: "actual-comment-session-actor" } } : null,
    ),
    handlers = createCommentHandlers(
      createCommentDependencies({ $transaction: transaction }, { api: { getSession } }, origin),
    );
  return { transaction, getSession, handlers };
}
function request(path: string, body?: unknown, method = "POST", from = origin) {
  return new Request(
    origin + path,
    body === undefined
      ? {}
      : {
          method,
          headers: { origin: from, "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
}
describe("authenticated comment/block/report HTTP boundary", () => {
  it("rejects cross-origin writes before a session or private database lookup", async () => {
    const f = fixture();
    expect(
      (
        await f.handlers.CREATE_COMMENT(
          request(
            "/api/v1/community/comments",
            { target: { type: "ITEM", id }, body: "Text" },
            "POST",
            "https://foreign.invalid",
          ),
        )
      ).status,
    ).toBe(403);
    expect(f.getSession).not.toHaveBeenCalled();
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it("requires current authentication for creation and all private control endpoints", async () => {
    const f = fixture(false);
    expect(
      (
        await f.handlers.CREATE_COMMENT(
          request("/api/v1/community/comments", { target: { type: "ITEM", id }, body: "Text" }),
        )
      ).status,
    ).toBe(401);
    expect((await f.handlers.OWN_REPORTS(request("/api/v1/community/reports"))).status).toBe(401);
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it.each([
    { target: { type: "ITEM", id }, body: "Text", authorId: "forged" },
    { target: { type: "ITEM", id }, body: "Text", source: "MODERATION" },
    { target: { type: "DOCUMENT", id }, body: "Text" },
  ])("rejects author/source/document injection before the producer", async (body) => {
    const f = fixture();
    expect(
      (await f.handlers.CREATE_COMMENT(request("/api/v1/community/comments", body))).status,
    ).toBe(400);
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it("accepts an empty transport stream but rejects actual delete payload bytes before the producer", async () => {
    const f = fixture();
    const make = (body: string) =>
      new Request(origin + "/api/v1/community/comments/" + id, {
        method: "DELETE",
        headers: { origin },
        body,
      });
    const empty = await f.handlers.DELETE_COMMENT(make(""), id);
    expect(empty.status).toBe(500);
    expect(f.transaction).toHaveBeenCalledOnce();
    f.transaction.mockClear();
    expect((await f.handlers.DELETE_COMMENT(make("payload"), id)).status).toBe(413);
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it("does not accept moderator flags on an owner-only hide operation", async () => {
    const f = fixture();
    expect(
      (
        await f.handlers.HIDE_COMMENT(
          request(
            "/api/v1/community/comments/" + id,
            { hidden: true, source: "MODERATION" },
            "PATCH",
          ),
          id,
        )
      ).status,
    ).toBe(400);
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it("rejects injected reporter identity and never exposes diagnostics", async () => {
    const f = fixture();
    expect(
      (
        await f.handlers.CREATE_REPORT(
          request("/api/v1/community/reports", {
            type: "COMMENT",
            commentId: id,
            category: "SPAM",
            reason: "Own report",
            reporterId: "forged",
          }),
        )
      ).status,
    ).toBe(400);
    expect(f.transaction).not.toHaveBeenCalled();
    const result = await f.handlers.CREATE_COMMENT(
      request("/api/v1/community/comments", { target: { type: "ITEM", id }, body: "Text" }),
    );
    expect(result.status).toBe(500);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.text()).not.toMatch(
      /private-comment-database-sentinel|actual-comment-session-actor/,
    );
  });
});
