import { randomUUID } from "node:crypto";

import { prismaAdapter } from "@better-auth/prisma-adapter";
import { createPrismaClient } from "@sammlerraum/db/create-client";
import {
  createSecurityService,
  type SecurityDatabase,
} from "@sammlerraum/domain/identity/security-service";
import { betterAuth } from "better-auth";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { buildAuthOptions } from "./auth";

const runIntegration = process.env.RUN_DATABASE_INTEGRATION === "1";
const databaseUrl = process.env.DATABASE_URL ?? "";
const prisma = runIntegration ? createPrismaClient(databaseUrl) : undefined;

const testEnv = {
  APP_ORIGIN: "https://example.test",
  BETTER_AUTH_SECRET: "test-secret-that-is-at-least-thirty-two-characters",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  APPLE_CLIENT_ID: "apple-client-id",
  APPLE_CLIENT_SECRET: "apple-client-secret",
};

describe.runIf(runIntegration)("security service Better Auth adapter integration", () => {
  beforeAll(async () => prisma?.$connect());
  afterAll(async () => prisma?.$disconnect());

  it("makes a revoked stable session id fail the next getSession call", async () => {
    const email = `${randomUUID()}@example.test`;
    const password = "correct-horse-battery-staple";
    const testAuth = betterAuth(
      buildAuthOptions(testEnv, {
        database: prismaAdapter(prisma!, { provider: "postgresql" }),
        sendEmail: vi.fn(),
      }),
    );

    await testAuth.api.signUpEmail({ body: { name: "Sammler", email, password } });
    const user = await prisma!.user.update({
      where: { email },
      data: { emailVerified: true },
    });

    try {
      const signInResponse = await testAuth.api.signInEmail({
        body: { email, password },
        asResponse: true,
      });
      const cookie = signInResponse.headers
        .getSetCookie()
        .map((value) => value.split(";", 1)[0])
        .join("; ");
      const headers = new Headers({ cookie });
      const authenticated = await testAuth.api.getSession({ headers });
      expect(authenticated?.user.id).toBe(user.id);

      const service = createSecurityService(prisma! as unknown as SecurityDatabase);
      await service.revokeSession(user.id, authenticated!.session.id);

      await expect(testAuth.api.getSession({ headers })).resolves.toBeNull();
    } finally {
      await prisma!.user.delete({ where: { id: user.id } });
    }
  });
});
