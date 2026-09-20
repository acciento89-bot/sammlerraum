import { describe, expect, it, vi } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

import { buildAuthOptions } from "./auth";

const testEnv = {
  APP_ORIGIN: "https://example.test",
  BETTER_AUTH_SECRET: "test-secret-that-is-at-least-thirty-two-characters",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  APPLE_CLIENT_ID: "apple-client-id",
  APPLE_CLIENT_SECRET: "apple-client-secret",
};

describe("Better Auth configuration", () => {
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
