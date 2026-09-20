import { describe, expect, it, vi } from "vitest";

import { createSessionRouteHandlers } from "./route";

const session = {
  user: { id: "user-1" },
  session: { id: "current-session", createdAt: new Date() },
};

describe("account sessions route", () => {
  it("derives actor and current session from server auth and prevents response caching", async () => {
    const listSessions = vi.fn().mockResolvedValue([]);
    const handlers = createSessionRouteHandlers({
      getSession: vi.fn().mockResolvedValue(session),
      service: { listSessions, revokeSession: vi.fn() },
      appOrigin: "https://example.test",
    });
    const response = await handlers.GET(
      new Request("https://example.test/api/v1/account/sessions"),
    );

    expect(listSessions).toHaveBeenCalledWith("user-1", "current-session");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects cross-origin cookie-authenticated revocation", async () => {
    const revokeSession = vi.fn();
    const handlers = createSessionRouteHandlers({
      getSession: vi.fn().mockResolvedValue(session),
      service: { listSessions: vi.fn(), revokeSession },
      appOrigin: "https://example.test",
    });
    const response = await handlers.DELETE(
      new Request("https://example.test/api/v1/account/sessions", {
        method: "DELETE",
        headers: { origin: "https://attacker.test", "content-type": "application/json" },
        body: JSON.stringify({ sessionId: "victim-session" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(revokeSession).not.toHaveBeenCalled();
  });
});
