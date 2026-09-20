import { describe, expect, it, vi } from "vitest";

import { createRecoveryMethodRouteHandlers } from "../../../../../lib/account-security-routes";

describe("account recovery-method route", () => {
  it("uses the authenticated actor instead of accepting a user id from the body", async () => {
    const removeLoginMethod = vi.fn().mockResolvedValue(undefined);
    const handlers = createRecoveryMethodRouteHandlers({
      getSession: vi.fn().mockResolvedValue({
        user: { id: "trusted-user" },
        session: { id: "fresh-session", createdAt: new Date("2026-09-20T00:00:00.000Z") },
      }),
      service: { removeLoginMethod },
      appOrigin: "https://example.test",
      now: () => new Date("2026-09-20T00:01:00.000Z"),
      freshAgeSeconds: 300,
    });
    const response = await handlers.DELETE(
      new Request("https://example.test/api/v1/account/recovery-methods", {
        method: "DELETE",
        headers: { origin: "https://example.test", "content-type": "application/json" },
        body: JSON.stringify({ methodId: "password", userId: "attacker-chosen-user" }),
      }),
    );

    expect(response.status).toBe(204);
    expect(removeLoginMethod).toHaveBeenCalledWith("trusted-user", "password");
  });

  it("requires a fresh authenticated session for method removal", async () => {
    const removeLoginMethod = vi.fn();
    const handlers = createRecoveryMethodRouteHandlers({
      getSession: vi.fn().mockResolvedValue({
        user: { id: "user-1" },
        session: { id: "old-session", createdAt: new Date("2026-09-19T00:00:00.000Z") },
      }),
      service: { removeLoginMethod },
      appOrigin: "https://example.test",
      now: () => new Date("2026-09-20T00:00:00.000Z"),
      freshAgeSeconds: 300,
    });
    const response = await handlers.DELETE(
      new Request("https://example.test/api/v1/account/recovery-methods", {
        method: "DELETE",
        headers: { origin: "https://example.test", "content-type": "application/json" },
        body: JSON.stringify({ methodId: "password" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(removeLoginMethod).not.toHaveBeenCalled();
  });
});
