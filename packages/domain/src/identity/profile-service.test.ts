import { randomUUID } from "node:crypto";

import { createPrismaClient } from "@sammlerraum/db/create-client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createProfileService } from "./profile-service";

function profileRecord() {
  return {
    userId: "user-1",
    handle: "sammler",
    displayName: "Sammler",
    bio: null,
    avatarAssetId: null,
    email: "login@example.test",
    createdAt: new Date("2026-09-20T00:00:00.000Z"),
    updatedAt: new Date("2026-09-20T00:00:00.000Z"),
  };
}

describe("profile service", () => {
  it("never exposes login email in the public profile projection", async () => {
    const findUnique = vi.fn().mockResolvedValue(profileRecord());
    const service = createProfileService({
      userProfile: { findUnique, update: vi.fn(), upsert: vi.fn() },
    });

    const result = await service.getPublicProfile("sammler");

    expect(findUnique).toHaveBeenCalledWith({
      where: { handle: "sammler" },
      select: {
        handle: true,
        displayName: true,
        bio: true,
        avatarAssetId: true,
      },
    });
    expect(result).toEqual({
      handle: "sammler",
      displayName: "Sammler",
      bio: null,
      avatarAssetId: null,
    });
    expect(result).not.toHaveProperty("email");
  });

  it("updates only the profile belonging to the trusted caller user id", async () => {
    const update = vi.fn().mockResolvedValue({
      handle: "sammler",
      displayName: "Neue Anzeige",
      bio: "Über mich",
      avatarAssetId: null,
    });
    const service = createProfileService({
      userProfile: { findUnique: vi.fn(), update, upsert: vi.fn() },
    });

    await expect(
      service.updateOwnProfile("trusted-user-id", {
        handle: "  SAMMLER  ",
        displayName: "Neue Anzeige",
        bio: "Über mich",
        avatarAssetId: null,
      }),
    ).resolves.toEqual({
      handle: "sammler",
      displayName: "Neue Anzeige",
      bio: "Über mich",
      avatarAssetId: null,
    });
    expect(update).toHaveBeenCalledWith({
      where: { userId: "trusted-user-id" },
      data: {
        handle: "sammler",
        displayName: "Neue Anzeige",
        bio: "Über mich",
        avatarAssetId: null,
      },
      select: {
        handle: true,
        displayName: true,
        bio: true,
        avatarAssetId: true,
      },
    });
  });

  it("creates an initial profile from explicit public fields for the trusted user", async () => {
    const upsert = vi.fn().mockResolvedValue({
      handle: "new-sammler",
      displayName: "Sammler",
      bio: null,
      avatarAssetId: null,
    });
    const service = createProfileService({
      userProfile: { findUnique: vi.fn(), update: vi.fn(), upsert },
    });

    await service.upsertOwnProfile("trusted-user", {
      handle: "  NEW-SAMMLER ",
      displayName: "Sammler",
      bio: null,
      avatarAssetId: null,
    });

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "trusted-user" },
      create: expect.objectContaining({ userId: "trusted-user", handle: "new-sammler" }),
    }));
  });
});

const runIntegration = process.env.RUN_DATABASE_INTEGRATION === "1";
const databaseUrl = process.env.DATABASE_URL ?? "";
const prisma = runIntegration ? createPrismaClient(databaseUrl) : undefined;

describe.runIf(runIntegration)("profile service PostgreSQL integration", () => {
  beforeAll(async () => {
    await prisma?.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("persists a normalized profile and reads only its public projection", async () => {
    const userId = randomUUID();
    const handle = `sammler-${randomUUID()}`;
    const service = createProfileService(prisma!);

    await prisma!.user.create({
      data: {
        id: userId,
        name: "Sammler",
        email: `${userId}@example.test`,
        emailVerified: true,
      },
    });
    await prisma!.userProfile.create({
      data: {
        userId,
        handle,
        displayName: "Sammler",
      },
    });

    try {
      await expect(
        service.updateOwnProfile(userId, {
          handle: `  ${handle.toUpperCase()}  `,
          displayName: "Neue Anzeige",
          bio: "Über mich",
          avatarAssetId: null,
        }),
      ).resolves.toEqual({
        handle,
        displayName: "Neue Anzeige",
        bio: "Über mich",
        avatarAssetId: null,
      });
      await expect(service.getPublicProfile(handle)).resolves.toEqual({
        handle,
        displayName: "Neue Anzeige",
        bio: "Über mich",
        avatarAssetId: null,
      });
    } finally {
      await prisma!.user.delete({ where: { id: userId } });
    }
  });
});
