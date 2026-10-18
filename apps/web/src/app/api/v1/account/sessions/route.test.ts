import { describe, expect, it, vi } from "vitest";

import { createSessionRouteHandlers } from "../../../../../lib/account-security-routes";

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
      new Request("https://example.test/api/v1/account/sessions", {
        headers: { "x-request-id": "list-request" },
      }),
    );

    expect(listSessions).toHaveBeenCalledWith("user-1", "current-session");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe("list-request");
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
        headers: {
          origin: "https://attacker.test",
          "content-type": "application/json",
          "x-request-id": "cross-origin-request",
        },
        body: JSON.stringify({ sessionId: "victim-session" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe("cross-origin-request");
    expect(await response.json()).toEqual({
      error: {
        code: "FORBIDDEN",
        message: "Cross-origin request rejected",
        requestId: "cross-origin-request",
      },
    });
    expect(revokeSession).not.toHaveBeenCalled();
  });

  it("maps malformed JSON to a safe validation failure", async () => {
    const revokeSession = vi.fn();
    const handlers = createSessionRouteHandlers({
      getSession: vi.fn().mockResolvedValue(session),
      service: { listSessions: vi.fn(), revokeSession },
      appOrigin: "https://example.test",
    });
    const response = await handlers.DELETE(
      new Request("https://example.test/api/v1/account/sessions", {
        method: "DELETE",
        headers: {
          origin: "https://example.test",
          "content-type": "application/json",
          "x-request-id": "malformed-request",
        },
        body: '{"sessionId":"submitted-secret"',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(response.headers.get("x-request-id")).toBe("malformed-request");
    expect(body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        requestId: "malformed-request",
      },
    });
    expect(JSON.stringify(body)).not.toContain("submitted-secret");
    expect(revokeSession).not.toHaveBeenCalled();
  });

  it("hides unexpected service errors behind the generic envelope", async () => {
    const handlers = createSessionRouteHandlers({
      getSession: vi.fn().mockResolvedValue(session),
      service: {
        listSessions: vi.fn().mockRejectedValue(new Error("database connection secret")),
        revokeSession: vi.fn(),
      },
      appOrigin: "https://example.test",
    });
    const response = await handlers.GET(
      new Request("https://example.test/api/v1/account/sessions", {
        headers: { "x-request-id": "failure-request" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe("failure-request");
    expect(body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
        requestId: "failure-request",
      },
    });
    expect(JSON.stringify(body)).not.toContain("database connection secret");
  });
});
