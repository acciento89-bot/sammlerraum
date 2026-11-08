import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { SearchDatabase } from "@sammlerraum/domain/search/item-search-service";
import {
  createPersonalMilestoneRouteDependencies,
  createPersonalMilestoneRouteHandlers,
} from "./personal-milestone-routes";
const origin = "https://example.invalid",
  id = "00000000-0000-4000-8000-000000000001";
type Operation = "POST" | "QUERY" | "PATCH" | "DELETE";
const payloads = {
  POST: { title: "private-content-sentinel", milestoneDate: "2026-11-05" },
  QUERY: {},
  PATCH: { title: "private-content-sentinel", milestoneDate: "2026-11-05", expectedRevision: 1 },
  DELETE: { expectedRevision: 1 },
};
function fixture(authenticated = true, failure: unknown = new Error("Database must not be used")) {
  const transact = vi.fn(async () => {
    throw failure;
  });
  const database: SearchDatabase = { $transaction: transact };
  const getSession = vi.fn(async () =>
    authenticated ? { user: { id: "synthetic-private-owner" } } : null,
  );
  const dependencies = createPersonalMilestoneRouteDependencies(
    database,
    { api: { getSession } },
    origin,
  );
  return { handler: createPersonalMilestoneRouteHandlers(dependencies), getSession, transact };
}
function request(operation: Operation, suffix = "", headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/v1/dashboard/milestones${suffix}`, {
    method: operation === "PATCH" || operation === "DELETE" ? operation : "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body: JSON.stringify(payloads[operation]),
  });
}
const invoke = (
  handler: ReturnType<typeof createPersonalMilestoneRouteHandlers>,
  op: Operation,
  req: Request,
) => (op === "PATCH" || op === "DELETE" ? handler[op](req, id) : handler[op](req));
async function closed(response: Response, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = z
    .object({
      error: z.object({ code: z.string(), message: z.string(), requestId: z.string() }).strict(),
    })
    .strict()
    .parse(await response.json());
  expect(body.error.requestId).toBe(response.headers.get("x-request-id"));
  expect(body.error.requestId).toBeTruthy();
  expect(JSON.stringify(body)).not.toContain("private-content-sentinel");
  return body;
}
describe("private milestone route authorization and error order", () => {
  for (const op of ["POST", "QUERY", "PATCH", "DELETE"] as const) {
    it(`${op} rejects Origin before reading a fresh session or a private body`, async () => {
      const f = fixture(),
        req = request(op, "?private-content-sentinel=ignored", {
          origin: "https://foreign.invalid",
        });
      const body = vi.spyOn(req, "body", "get").mockImplementation(() => {
        throw Error("Body read before origin");
      });
      expect((await closed(await invoke(f.handler, op, req), 403)).error.code).toBe("FORBIDDEN");
      expect(f.getSession).not.toHaveBeenCalled();
      expect(body).not.toHaveBeenCalled();
      expect(f.transact).not.toHaveBeenCalled();
    });
    it(`${op} rejects an absent session before reading URL content or private body`, async () => {
      const f = fixture(false),
        req = request(op, "?private-content-sentinel=" + "x".repeat(32769));
      const body = vi.spyOn(req, "body", "get").mockImplementation(() => {
        throw Error("Body read before auth");
      });
      expect((await closed(await invoke(f.handler, op, req), 401)).error.code).toBe("UNAUTHORIZED");
      expect(f.getSession).toHaveBeenCalledWith({
        headers: req.headers,
        query: { disableCookieCache: true, disableRefresh: true },
      });
      expect(body).not.toHaveBeenCalled();
      expect(f.transact).not.toHaveBeenCalled();
    });
    it(`${op} accepts only a body envelope after fresh auth and keeps URL rejection private`, async () => {
      for (const suffix of [
        "?limit=5",
        "?ownerId=private-content-sentinel",
        "?%FF=x",
        "?%",
        "?x=a&x=b",
        "#private-content-sentinel",
        "?x=" + "z".repeat(32769),
      ]) {
        const f = fixture(),
          req = request(op, suffix),
          body = vi.spyOn(req, "body", "get").mockImplementation(() => {
            throw Error("URL rejection must precede body");
          });
        await closed(await invoke(f.handler, op, req), suffix.length > 32768 ? 414 : 400);
        expect(f.getSession).toHaveBeenCalledTimes(1);
        expect(body).not.toHaveBeenCalled();
        expect(f.transact).not.toHaveBeenCalled();
      }
    });
    it(`${op} retains actual streamed16KiB cap with a false Content-Length`, async () => {
      const f = fixture();
      const bytes = new TextEncoder().encode("{}" + " ".repeat(16383));
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (let n = 0; n < bytes.length; n += 997)
            controller.enqueue(bytes.subarray(n, n + 997));
        },
        cancel() {
          cancelled = true;
        },
      });
      const req = new Request(origin + "/api/v1/dashboard/milestones", {
        method: op === "PATCH" || op === "DELETE" ? op : "POST",
        headers: { origin, "content-type": "application/json", "content-length": "1" },
        body: stream,
        duplex: "half",
      } as RequestInit);
      await closed(await invoke(f.handler, op, req), 413);
      expect(cancelled).toBe(true);
      expect(f.transact).not.toHaveBeenCalled();
      expect(f.getSession).toHaveBeenCalledTimes(1);
    });
  }
  it("sanitizes known dependency and unknown driver faults without private details", async () => {
    for (const [failure, status, code] of [
      [
        Object.assign(new Error("private-content-sentinel SQL"), { code: "P1001" }),
        503,
        "SEARCH_UNAVAILABLE",
      ],
      [new Error("private-content-sentinel SQL"), 500, "SEARCH_INVARIANT"],
    ] as const) {
      const f = fixture(true, failure);
      const response = await invoke(f.handler, "POST", request("POST"));
      expect((await closed(response, status)).error.code).toBe(code);
      expect(f.transact).toHaveBeenCalledTimes(1);
    }
  });
});
