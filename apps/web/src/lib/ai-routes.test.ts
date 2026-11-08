import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
async function fixture(session = true) {
  const path = "./ai-routes",
    module = await import(path).catch(() => null);
  expect(module?.createAIApplyRouteHandlers).toBeTypeOf("function");
  const getSession = vi.fn(async () => (session ? { user: { id: "case-Sensitive-owner" } } : null)),
    apply = vi.fn(async () => ({ accepted: ["title"] })),
    review = vi.fn(async () => ({ baseline: "a".repeat(64) }));
  const handlers = module!.createAIApplyRouteHandlers({
    appOrigin: "https://example.invalid",
    getSession,
    createService: () => ({ getReview: review, applySuggestions: apply }),
  });
  const input = {
    requestKey: randomUUID(),
    baseline: "a".repeat(64),
    title: true,
    category: false,
    manufacturerFieldId: null,
    seriesOrSetFieldId: null,
    yearFieldId: null,
    identifierIndices: [],
    catalogCandidateIndex: null,
  };
  const request = (body: unknown = input, origin = "https://example.invalid") =>
    new Request("https://example.invalid/api/v1/ai/analyses/id/apply", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return { handlers, getSession, apply, review, input, request };
}
it("requires a current session and same-origin mutation before invoking confirmation", async () => {
  const f = await fixture();
  expect(
    (await f.handlers.APPLY(f.request(f.input, "https://foreign.invalid"), randomUUID())).status,
  ).toBe(403);
  expect(f.getSession).not.toHaveBeenCalled();
  expect(f.apply).not.toHaveBeenCalled();
  const absent = await fixture(false);
  expect((await absent.handlers.APPLY(absent.request(), randomUUID())).status).toBe(401);
  expect(absent.apply).not.toHaveBeenCalled();
});
it("validates a closed bounded body and returns private no-store result with the real opaque actor", async () => {
  const f = await fixture(),
    id = randomUUID();
  let response = await f.handlers.APPLY(f.request(), id);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(f.apply).toHaveBeenCalledWith({ userId: "case-Sensitive-owner" }, id, f.input);
  response = await f.handlers.APPLY(f.request({ ...f.input, authenticity: true }), id);
  expect(response.status).toBe(400);
  response = await f.handlers.APPLY(f.request({ padding: "x".repeat(32769) }), id);
  expect(response.status).toBe(413);
  expect(f.apply).toHaveBeenCalledTimes(1);
});
it("does not cache a private review or leak internal errors and rejects duplicate JSON keys", async () => {
  const f = await fixture(),
    id = randomUUID();
  let response = await f.handlers.REVIEW(
    new Request("https://example.invalid/api/v1/ai/analyses/id/review"),
    id,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  f.apply.mockRejectedValueOnce(new Error("private-source-and-credential-sentinel"));
  response = await f.handlers.APPLY(f.request(), id);
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("private-source-and-credential-sentinel");
  response = await f.handlers.APPLY(
    new Request("https://example.invalid/api/v1/ai/analyses/id/apply", {
      method: "POST",
      headers: { origin: "https://example.invalid", "content-type": "application/json" },
      body: '{"title":false,"title":true}',
    }),
    id,
  );
  expect(response.status).toBe(400);
  expect(f.apply).toHaveBeenCalledTimes(1);
});

it("reads the actual session with cookie caching and refresh disabled", async () => {
  const path = "./ai-routes",
    module = await import(path),
    getSession = vi.fn(async () => null),
    headers = new Headers({ cookie: "synthetic-opaque-session" });
  const dependencies = module.createAIApplyRouteDependencies(
    { $transaction: vi.fn() },
    { api: { getSession } },
    "https://example.invalid",
  );
  await dependencies.getSession(headers);
  expect(getSession).toHaveBeenCalledWith({
    headers,
    query: { disableCookieCache: true, disableRefresh: true },
  });
});
