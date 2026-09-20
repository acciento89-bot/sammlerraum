import { passkey } from "@better-auth/passkey";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { parseAuthEnv, type AuthEnv } from "@sammlerraum/config/server";
import { prisma } from "@sammlerraum/db/client";
import { betterAuth, type BetterAuthOptions } from "better-auth";

import { createSmtpEmailSender, type EmailSender } from "./email";

type AuthOptionsEnvironment = Pick<
  AuthEnv,
  | "APP_ORIGIN"
  | "BETTER_AUTH_SECRET"
  | "GOOGLE_CLIENT_ID"
  | "GOOGLE_CLIENT_SECRET"
  | "APPLE_CLIENT_ID"
  | "APPLE_CLIENT_SECRET"
>;

interface AuthDependencies {
  database: NonNullable<BetterAuthOptions["database"]>;
  sendEmail: EmailSender;
}

export function buildAuthOptions(
  env: AuthOptionsEnvironment,
  dependencies: AuthDependencies,
): BetterAuthOptions {
  const applicationUrl = new URL(env.APP_ORIGIN);

  return {
    appName: "Sammlerraum",
    baseURL: env.APP_ORIGIN,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: dependencies.database,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        await dependencies.sendEmail({
          to: user.email,
          subject: "Reset your Sammlerraum password",
          text: `Reset your Sammlerraum password: ${url}`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        await dependencies.sendEmail({
          to: user.email,
          subject: "Verify your Sammlerraum email",
          text: `Verify your Sammlerraum email: ${url}`,
        });
      },
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
      apple: {
        clientId: env.APPLE_CLIENT_ID,
        clientSecret: env.APPLE_CLIENT_SECRET,
      },
    },
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        allowDifferentEmails: false,
        allowUnlinkingAll: false,
      },
    },
    session: {
      cookieCache: { enabled: false },
    },
    verification: {
      storeIdentifier: "hashed",
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 300, max: 3 },
        "/request-password-reset": { window: 300, max: 3 },
        "/send-verification-email": { window: 300, max: 3 },
      },
    },
    disabledPaths: ["/unlink-account"],
    trustedOrigins: [env.APP_ORIGIN],
    plugins: [
      passkey({
        rpID: applicationUrl.hostname,
        rpName: "Sammlerraum",
        origin: applicationUrl.origin,
      }),
    ],
    advanced: {
      database: { joins: true },
    },
    telemetry: { enabled: false },
  };
}

const authEnvironment = parseAuthEnv(process.env);

export const auth = betterAuth(
  buildAuthOptions(authEnvironment, {
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    sendEmail: createSmtpEmailSender(authEnvironment),
  }),
);
