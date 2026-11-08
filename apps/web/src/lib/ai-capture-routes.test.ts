import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
async function fixture(enabled = true) {
  const path = "./ai-capture-routes",
    module = await import(path).catch(() => null);
  expect(module?.createAICaptureRouteHandlers).toBeTypeOf("function");
  const capture = vi.fn(async () => ({ itemId: randomUUID(), photos: [], latestJob: null })),
    request = vi.fn(async () => ({ id: randomUUID(), status: "PENDING" })),
    cancel = vi.fn(async () => ({ status: "CANCELLED" })),
    get = vi.fn(async () => ({ status: "PENDING" })),
    usage = vi.fn(async () => ({ requests: 0 }));
  const handlers = module!.createAICaptureRouteHandlers({
    appOrigin: "https://example.invalid",
    enabled,
    monthlyLimit: 3,
    getSession: async () => ({ user: { id: "real-opaque-owner" } }),
    service: {
      getCapture: capture,
      requestItemAnalysis: request,
      cancelAnalysis: cancel,
      getAnalysis: get,
    },
    usage: { getAIUsage: usage },
  });
  const id = randomUUID(),
    body = { assetIds: [randomUUID()], requestKey: randomUUID() };
  const req = (input: unknown = body) =>
    new Request(`https://example.invalid/api/v1/items/${id}/ai`, {
      method: "POST",
      headers: { origin: "https://example.invalid", "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  return { handlers, capture, request, cancel, get, usage, id, body, req };
}
it("does not admit work when analysis is unavailable while retaining truthful owned capture and usage", async () => {
  const f = await fixture(false);
  expect((await f.handlers.REQUEST(f.req(), f.id)).status).toBe(503);
  expect(f.request).not.toHaveBeenCalled();
  const response = await f.handlers.CAPTURE(
    new Request(`https://example.invalid/api/v1/items/${f.id}/ai`),
    f.id,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    capture: { enabled: false, monthlyLimit: 3, usage: { requests: 0 } },
  });
});
it("admits a closed explicit selection for the real session actor and rejects foreign source metadata", async () => {
  const f = await fixture();
  let response = await f.handlers.REQUEST(f.req(), f.id);
  expect(response.status).toBe(201);
  expect(f.request).toHaveBeenCalledWith(
    { userId: "real-opaque-owner" },
    f.id,
    f.body.assetIds,
    f.body.requestKey,
  );
  response = await f.handlers.REQUEST(f.req({ ...f.body, storageKey: "private-file" }), f.id);
  expect(response.status).toBe(400);
  expect(f.request).toHaveBeenCalledTimes(1);
});
it("checks origin and never takes a user id from request data for cancellation or usage", async () => {
  const f = await fixture();
  const wrong = new Request(`https://example.invalid/api/v1/ai/analyses/${f.id}/cancel`, {
    method: "POST",
    headers: { origin: "https://foreign.invalid" },
  });
  expect((await f.handlers.CANCEL(wrong, f.id)).status).toBe(403);
  expect(f.cancel).not.toHaveBeenCalled();
  const response = await f.handlers.USAGE(
    new Request("https://example.invalid/api/v1/ai/usage?userId=foreign"),
  );
  expect(response.status).toBe(400);
  expect(f.usage).not.toHaveBeenCalled();
});
