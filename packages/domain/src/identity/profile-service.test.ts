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
      userProfile: { findUnique, update: vi.fn() },
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
      userProfile: { findUnique: vi.fn(), update },
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
      await prisma!.userProfile.delete({ where: { userId } });
    }
  });
});
