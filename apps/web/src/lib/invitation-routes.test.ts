import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import {
  createInvitationRouteDependencies,
  createInvitationRouteHandlers,
} from "./invitation-routes";
const origin = "https://example.invalid",
  collection = "00000000-0000-4000-8000-000000000001",
  invitation = "00000000-0000-4000-8000-000000000002";
type Operation = "POST" | "ACCEPT" | "REVOKE";
function fixture(authenticated = true) {
  const transact = vi.fn(async () => {
    throw Error("private-sql-sentinel");
  });
  const getSession = vi.fn(async () =>
    authenticated ? { user: { id: "trusted-session-user" } } : null,
  );
  return {
    transact,
    getSession,
    handlers: createInvitationRouteHandlers(
      createInvitationRouteDependencies(
        { $transaction: transact },
        { api: { getSession } },
        origin,
      ),
    ),
  };
}
function request(op: Operation, body?: string, headers: Record<string, string> = {}, suffix = "") {
  return new Request(`${origin}/api/v1/invitations${suffix}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body:
      body ??
      JSON.stringify(
        op === "ACCEPT"
          ? { token: "a".repeat(43) }
          : op === "REVOKE"
            ? { expectedRevision: 0 }
            : {
                expectedRevision: 0,
                target: { kind: "EMAIL", email: "private-body-sentinel@example.invalid" },
                role: "VIEWER",
              },
      ),
  });
}
function invoke(f: ReturnType<typeof fixture>, op: Operation, req: Request) {
  return op === "POST"
    ? f.handlers.POST(req, collection)
    : op === "ACCEPT"
      ? f.handlers.ACCEPT(req)
      : f.handlers.REVOKE(req, collection, invitation);
}
async function closed(response: Response, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = z
    .object({
      error: z
        .object({ code: z.string(), message: z.string(), requestId: z.string().min(1) })
        .strict(),
    })
    .strict()
    .parse(await response.json());
  expect(body.error.requestId).toBe(response.headers.get("x-request-id"));
  expect(JSON.stringify(body)).not.toMatch(
    /private-sql-sentinel|private-body-sentinel|SELECT|tokenHash/,
  );
  return body;
}
describe("private invitation HTTP boundary", () => {
  for (const op of ["POST", "ACCEPT", "REVOKE"] as const) {
    it(`${op} checks Origin before session and private body`, async () => {
      const f = fixture(),
        req = request(op, undefined, { origin: "https://foreign.invalid" });
      const body = vi.spyOn(req, "body", "get").mockImplementation(() => {
        throw Error("body too early");
      });
      await closed(await invoke(f, op, req), 403);
      expect(f.getSession).not.toHaveBeenCalled();
      expect(body).not.toHaveBeenCalled();
      expect(f.transact).not.toHaveBeenCalled();
    });
    it(`${op} checks a fresh session before URL and body`, async () => {
      const f = fixture(false),
        req = request(op, undefined, {}, "?private-body-sentinel=hidden");
      const body = vi.spyOn(req, "body", "get").mockImplementation(() => {
        throw Error("body too early");
      });
      await closed(await invoke(f, op, req), 401);
      expect(body).not.toHaveBeenCalled();
      expect(f.transact).not.toHaveBeenCalled();
      expect(f.getSession).toHaveBeenCalledWith({
        headers: req.headers,
        query: { disableCookieCache: true, disableRefresh: true },
      });
    });
    it(`${op} rejects URL payloads, duplicate keys and oversized streamed bodies before database access`, async () => {
      const f = fixture();
      await closed(
        await invoke(f, op, request(op, undefined, {}, "?actorId=private-body-sentinel")),
        400,
      );
      await closed(
        await invoke(f, op, request(op, '{"expectedRevision":0,"expectedRevision":1}')),
        400,
      );
      await closed(
        await invoke(f, op, request(op, "{}" + " ".repeat(16385), { "content-length": "1" })),
        413,
      );
      expect(f.transact).not.toHaveBeenCalled();
    });
  }
  it("rejects caller actor/collection injection and hides actual database failures", async () => {
    const f = fixture();
    await closed(
      await f.handlers.POST(
        request(
          "POST",
          JSON.stringify({
            actorId: "forged",
            collectionId: collection,
            expectedRevision: 0,
            target: { kind: "EMAIL", email: "safe@example.invalid" },
            role: "VIEWER",
          }),
        ),
        collection,
      ),
      400,
    );
    expect(f.transact).not.toHaveBeenCalled();
    await closed(await f.handlers.POST(request("POST"), collection), 500);
    expect(f.transact).toHaveBeenCalledTimes(1);
  });
});
