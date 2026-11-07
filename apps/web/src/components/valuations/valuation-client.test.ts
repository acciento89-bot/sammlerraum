import { afterEach, expect, it, vi } from "vitest";
import { valuationTransport } from "./valuation-client";
import { ValuationController } from "./valuation-state";
afterEach(() => vi.unstubAllGlobals());
it("treats a malformed 201 as unknown and never replays the write", async () => {
  let posts = 0;
  vi.stubGlobal("fetch", async (_url: string, options: RequestInit) => {
    if (options.method === "POST") {
      posts++;
      return Response.json({ valuation: { amountMinor: "0" } }, { status: 201 });
    }
    return Response.json({ summary: null });
  });
  const c = new ValuationController(valuationTransport("11111111-1111-4111-8111-111111111111"));
  await c.append({ amountMinor: "0", currency: "EUR", note: null });
  await c.append({ amountMinor: "0", currency: "EUR", note: null });
  expect(c.state.mutation).toBe("unknown");
  expect(posts).toBe(1);
});
it("keeps malformed GET data as an error rather than inventing empty history", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ summary: { manual: { latest: null } } }));
  const c = new ValuationController(valuationTransport("11111111-1111-4111-8111-111111111111"));
  await c.load();
  expect(c.state.error).toBe("readError");
  expect(c.state.summary).toBeNull();
});
it("clears session data even when a 401 body is malformed", async () => {
  vi.stubGlobal("fetch", async () => new Response("not json", { status: 401 }));
  const c = new ValuationController(valuationTransport("11111111-1111-4111-8111-111111111111"));
  await c.load();
  expect(c.state.access).toBe("session");
  expect(c.state.summary).toBeNull();
});
