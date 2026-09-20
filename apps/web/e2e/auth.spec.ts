import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { startAuthApiServer, type AuthApiServer } from "./support/auth-api-server";

const runAuthE2E = process.env.RUN_AUTH_E2E === "1";

test.describe("password authentication API", () => {
  test.skip(!runAuthE2E, "requires the migrated PostgreSQL integration database");

  let server: AuthApiServer;

  test.beforeAll(async () => {
    server = await startAuthApiServer(process.env.DATABASE_URL ?? "");
  });

  test.afterAll(async () => {
    await server?.close();
  });

  test("registers, verifies, signs in, and lists the authenticated session", async ({
    request,
  }) => {
    const email = `auth-smoke-${randomUUID()}@example.test`;
    const password = "correct-horse-battery-staple";

    try {
      const registration = await request.post(`${server.origin}/api/auth/sign-up/email`, {
        data: { name: "Sammler", email, password },
      });
      expect(registration.ok()).toBe(true);

      const unverifiedLogin = await request.post(`${server.origin}/api/auth/sign-in/email`, {
        data: { email, password },
      });
      expect(unverifiedLogin.status()).toBe(403);

      const verificationUrl = server.verificationUrlFor(email);
      expect(verificationUrl).toMatch(
        new RegExp(`^${server.origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/api/auth/verify-email\\?`),
      );
      const verification = await request.get(verificationUrl, { maxRedirects: 0 });
      expect([200, 302]).toContain(verification.status());

      const login = await request.post(`${server.origin}/api/auth/sign-in/email`, {
        data: { email, password },
      });
      expect(login.ok()).toBe(true);

      const sessions = await request.get(`${server.origin}/api/v1/account/sessions`, {
        headers: { "x-request-id": "auth-e2e-sessions" },
      });
      expect(sessions.status()).toBe(200);
      expect(sessions.headers()["cache-control"]).toBe("no-store");
      expect(sessions.headers()["x-request-id"]).toBe("auth-e2e-sessions");

      const body = (await sessions.json()) as {
        sessions: Array<Record<string, unknown>>;
      };
      expect(body.sessions).toHaveLength(1);
      expect(body.sessions[0]).toMatchObject({ current: true });
      expect(Object.keys(body.sessions[0] ?? {}).sort()).toEqual([
        "createdAt",
        "current",
        "id",
        "lastSeenAt",
        "userAgent",
      ]);
      expect(JSON.stringify(body)).not.toContain(email);
      expect(JSON.stringify(body)).not.toContain("token");
    } finally {
      await server.removeUser(email);
    }
  });
});
