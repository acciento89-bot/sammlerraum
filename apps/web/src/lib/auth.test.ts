import { describe, expect, it, vi } from "vitest";

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
    expect(options.session?.cookieCache?.enabled).toBe(false);
    expect(options.disabledPaths).toContain("/unlink-account");
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
});
