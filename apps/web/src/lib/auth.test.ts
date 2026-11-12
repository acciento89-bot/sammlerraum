import { describe, expect, it, vi } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

import { buildAuthOptions } from "./auth";
import { acquisitionEligibility } from "./acquisition";

const testEnv = {
  APP_ORIGIN: "https://example.test",
  BETTER_AUTH_SECRET: "test-secret-that-is-at-least-thirty-two-characters",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  APPLE_CLIENT_ID: "apple-client-id",
  APPLE_CLIENT_SECRET: "apple-client-secret",
};

describe("Better Auth configuration", () => {
  it("makes a newly confirmed registration measurable without a second password login", async () => {
    const database: Record<string, Record<string, unknown>[]> = {
      user: [],
      session: [],
      account: [],
      verification: [],
      rateLimit: [],
    };
    let verificationUrl = "";
    const instance = betterAuth(
      buildAuthOptions(testEnv, {
        database: memoryAdapter(database),
        sendEmail: async (message) => {
          verificationUrl = message.text.match(/https?:\/\/\S+/)?.[0] ?? "";
        },
      }),
    );
    const started = new Date();
    const signup = await instance.handler(
      new Request(`${testEnv.APP_ORIGIN}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { origin: testEnv.APP_ORIGIN, "content-type": "application/json" },
        body: JSON.stringify({
          name: "Synthetic collector",
          email: "confirmed-collector@example.org",
          password: "Synthetic-local-password-only-123",
          callbackURL: "/de/login",
        }),
      }),
    );
    expect(signup.status).toBe(200);
    expect(await instance.api.getSession({ headers: new Headers() })).toBeNull();
    expect(verificationUrl).toContain("/api/auth/verify-email?");
    const verified = await instance.handler(new Request(verificationUrl));
    expect([200, 302]).toContain(verified.status);
    const cookie = verified.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; ");
    const session = await instance.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.emailVerified).toBe(true);
    expect(
      acquisitionEligibility(session ? { ...session.user, applicationRoleGrant: null } : null, {
        start: started,
        now: new Date(),
        secret: "synthetic-acquisition-secret",
        firstItemAt: null,
      }).events.map((event) => event.kind),
    ).toEqual(["registration"]);
    const replay = await instance.handler(new Request(verificationUrl));
    expect(replay.headers.getSetCookie()).toEqual([]);
    expect(database.session).toHaveLength(1);
    const invalid = new URL(verificationUrl);
    invalid.searchParams.set("token", "invalid-token");
    const denied = await instance.handler(new Request(invalid));
    expect(denied.headers.getSetCookie()).toEqual([]);
    expect(database.session).toHaveLength(1);
  });

  it("enables the required authentication methods and safe account linking", () => {
    const options = buildAuthOptions(testEnv, {
      database: {} as never,
      sendEmail: vi.fn(),
    });

    expect(options.emailAndPassword?.enabled).toBe(true);
    expect(options.emailAndPassword?.requireEmailVerification).toBe(true);
    expect(options.emailVerification?.sendOnSignUp).toBe(true);
    expect(options.emailVerification?.sendOnSignIn).toBe(true);
    expect(Object.keys(options.socialProviders ?? {})).toEqual(
      expect.arrayContaining(["google", "apple"]),
    );
    expect(options.plugins?.length).toBeGreaterThan(0);
    expect(options.account?.accountLinking?.disableImplicitLinking).toBe(true);
    expect(options.account?.encryptOAuthTokens).toBe(true);
    expect(options.session?.cookieCache?.enabled).toBe(false);
    expect(options.disabledPaths).toEqual(
      expect.arrayContaining([
        "/unlink-account",
        "/passkey/delete-passkey",
        "/list-sessions",
        "/revoke-session",
        "/revoke-sessions",
        "/revoke-other-sessions",
      ]),
    );
    expect(options.rateLimit).toMatchObject({
      enabled: true,
      storage: "database",
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 300, max: 3 },
        "/request-password-reset": { window: 300, max: 3 },
      },
    });
  });

  it("delivers verification and password-reset links through the injected email sender", async () => {
    const sendEmail = vi.fn().mockResolvedValue(undefined);
    const options = buildAuthOptions(testEnv, {
      database: {} as never,
      sendEmail,
    });
    const user = {
      id: "user-1",
      email: "login@example.test",
      name: "Sammler",
      emailVerified: false,
      image: null,
      createdAt: new Date("2026-09-20T00:00:00.000Z"),
      updatedAt: new Date("2026-09-20T00:00:00.000Z"),
    };

    await options.emailVerification?.sendVerificationEmail?.({
      user,
      url: "https://example.test/api/auth/verify-email?token=verification-token",
      token: "verification-token",
    });
    await options.emailAndPassword?.sendResetPassword?.({
      user,
      url: "https://example.test/reset-password?token=reset-token",
      token: "reset-token",
    });

    expect(sendEmail).toHaveBeenNthCalledWith(1, {
      to: "login@example.test",
      subject: "Verify your Sammlerraum email",
      text: expect.stringContaining("https://example.test/api/auth/verify-email"),
    });
    expect(sendEmail).toHaveBeenNthCalledWith(2, {
      to: "login@example.test",
      subject: "Reset your Sammlerraum password",
      text: expect.stringContaining("https://example.test/reset-password"),
    });
  });

  it("removes identity tokens at the database adapter boundary on create and update", async () => {
    const database: Record<string, Record<string, unknown>[]> = {};
    const testAuth = betterAuth(
      buildAuthOptions(testEnv, {
        database: memoryAdapter(database),
        sendEmail: vi.fn(),
      }),
    );
    const context = await testAuth.$context;
    const created = await context.internalAdapter.createAccount({
      accountId: "provider-account-id",
      providerId: "google",
      userId: "user-1",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      idToken: "eyJhbGciOiJSUzI1NiJ9.eyJlbWFpbCI6ImxvZ2luQGV4YW1wbGUudGVzdCJ9.signature",
    });

    expect(created?.idToken).toBeNull();
    expect(database.account?.[0]?.idToken).toBeNull();

    const updated = await context.internalAdapter.updateAccount(created!.id, {
      idToken: "eyJhbGciOiJSUzI1NiJ9.eyJlbWFpbCI6Im5ld0BleGFtcGxlLnRlc3QifQ.signature",
    });

    expect(updated?.idToken).toBeNull();
    expect(database.account?.[0]?.idToken).toBeNull();
  });
});
