import { randomUUID } from "node:crypto";

import { createPrismaClient } from "@sammlerraum/db/create-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSecurityService, type SecurityDatabase } from "./security-service";

type State = {
  emailVerified: boolean;
  sessions: Array<{
    id: string;
    userId: string;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date;
    userAgent: string | null;
    token?: string;
  }>;
  accounts: Array<{ id: string; userId: string; providerId: string; password: string | null }>;
  passkeys: Array<{ id: string; userId: string }>;
};

function fakeDatabase(state: State): SecurityDatabase {
  const transaction = {
    $queryRaw: async () => [{ id: "user-1" }],
    user: {
      findUnique: async () => ({ emailVerified: state.emailVerified }),
    },
    account: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        state.accounts.filter((account) => account.userId === where.userId),
      deleteMany: async ({
        where,
      }: {
        where: { userId: string; id?: string; providerId?: string };
      }) => {
        const before = state.accounts.length;
        state.accounts = state.accounts.filter(
          (account) =>
            !(
              account.userId === where.userId &&
              (where.id === undefined || account.id === where.id) &&
              (where.providerId === undefined || account.providerId === where.providerId)
            ),
        );
        return { count: before - state.accounts.length };
      },
    },
    passkey: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        state.passkeys.filter((passkey) => passkey.userId === where.userId),
      deleteMany: async ({ where }: { where: { id: string; userId: string } }) => {
        const before = state.passkeys.length;
        state.passkeys = state.passkeys.filter(
          (passkey) => !(passkey.id === where.id && passkey.userId === where.userId),
        );
        return { count: before - state.passkeys.length };
      },
    },
  };

  return {
    session: {
      findMany: async ({ where }: { where: { userId: string; expiresAt: { gt: Date } } }) =>
        state.sessions.filter(
          (session) => session.userId === where.userId && session.expiresAt > where.expiresAt.gt,
        ),
      deleteMany: async ({ where }: { where: { id: string; userId: string } }) => {
        const before = state.sessions.length;
        state.sessions = state.sessions.filter(
          (session) => !(session.id === where.id && session.userId === where.userId),
        );
        return { count: before - state.sessions.length };
      },
    },
    $transaction: async (operation) => operation(transaction),
  } as SecurityDatabase;
}

function initialState(): State {
  return {
    emailVerified: true,
    sessions: [],
    accounts: [
      { id: "credential-account", userId: "user-1", providerId: "credential", password: "hash" },
    ],
    passkeys: [],
  };
}

describe("security service", () => {
  it("refuses to remove the final verified recovery method", async () => {
    const state = initialState();
    const service = createSecurityService(fakeDatabase(state));

    await expect(service.removeLoginMethod("user-1", "password")).rejects.toMatchObject({
      code: "RECOVERY_METHOD_REQUIRED",
    });
    expect(state.accounts).toHaveLength(1);
  });

  it("counts only verified password, completed OAuth accounts, and persisted passkeys", async () => {
    const state = initialState();
    state.emailVerified = false;
    state.accounts.push({ id: "google-1", userId: "user-1", providerId: "google", password: null });
    const service = createSecurityService(fakeDatabase(state));

    await expect(service.removeLoginMethod("user-1", "account:google-1")).rejects.toMatchObject({
      code: "RECOVERY_METHOD_REQUIRED",
    });
  });

  it("removes an owned method when another verified factor remains", async () => {
    const state = initialState();
    state.passkeys.push({ id: "passkey-1", userId: "user-1" });
    const service = createSecurityService(fakeDatabase(state));

    await expect(service.removeLoginMethod("user-1", "password")).resolves.toBeUndefined();
    expect(state.accounts).toEqual([]);
  });

  it("enforces ownership for sessions and passkeys", async () => {
    const state = initialState();
    state.sessions.push({
      id: "other-session",
      userId: "other-user",
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      userAgent: null,
    });
    state.passkeys.push({ id: "other-passkey", userId: "other-user" });
    const service = createSecurityService(fakeDatabase(state));

    await expect(service.revokeSession("user-1", "other-session")).rejects.toMatchObject({
      code: "SESSION_NOT_FOUND",
    });
    await expect(
      service.removeLoginMethod("user-1", "passkey:other-passkey"),
    ).rejects.toMatchObject({ code: "LOGIN_METHOD_NOT_FOUND" });
    expect(state.sessions).toHaveLength(1);
    expect(state.passkeys).toHaveLength(1);
  });

  it("returns stable ids and sanitized active-session metadata", async () => {
    const state = initialState();
    state.sessions.push({
      id: "session-1",
      userId: "user-1",
      createdAt: new Date("2026-09-20T10:00:00.000Z"),
      updatedAt: new Date("2026-09-20T11:00:00.000Z"),
      expiresAt: new Date("2026-09-21T00:00:00.000Z"),
      userAgent: "Browser\nInjected\u0000",
      token: "never-return-this-token",
    });
    const service = createSecurityService(
      fakeDatabase(state),
      () => new Date("2026-09-20T12:00:00.000Z"),
    );

    const sessions = await service.listSessions("user-1", "session-1");

    expect(sessions).toEqual([
      {
        id: "session-1",
        createdAt: new Date("2026-09-20T10:00:00.000Z"),
        lastSeenAt: new Date("2026-09-20T11:00:00.000Z"),
        userAgent: "Browser Injected",
        current: true,
      },
    ]);
    expect(sessions[0]).not.toHaveProperty("token");
  });
});

const runIntegration = process.env.RUN_DATABASE_INTEGRATION === "1";
const databaseUrl = process.env.DATABASE_URL ?? "";
const prisma = runIntegration ? createPrismaClient(databaseUrl) : undefined;

describe.runIf(runIntegration)("security service PostgreSQL integration", () => {
  beforeAll(async () => prisma?.$connect());
  afterAll(async () => prisma?.$disconnect());

  it("serializes concurrent removal so one verified recovery method remains", async () => {
    const userId = randomUUID();
    await prisma!.user.create({
      data: {
        id: userId,
        name: "Sammler",
        email: `${userId}@example.test`,
        emailVerified: true,
        accounts: {
          create: [
            { id: randomUUID(), accountId: userId, providerId: "credential", password: "hash" },
            { id: randomUUID(), accountId: randomUUID(), providerId: "google" },
          ],
        },
      },
    });
    const google = await prisma!.account.findFirstOrThrow({
      where: { userId, providerId: "google" },
    });
    const service = createSecurityService(prisma! as unknown as SecurityDatabase);

    try {
      const results = await Promise.allSettled([
        service.removeLoginMethod(userId, "password"),
        service.removeLoginMethod(userId, `account:${google.id}`),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      expect(await prisma!.account.count({ where: { userId } })).toBe(1);
    } finally {
      await prisma!.user.delete({ where: { id: userId } });
    }
  });
});
