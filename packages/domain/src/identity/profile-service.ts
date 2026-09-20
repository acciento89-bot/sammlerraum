import {
  PublicProfileSchema,
  type PublicProfile,
  type UpdateOwnProfileInput,
} from "@sammlerraum/contracts/profile";

const publicProfileSelect = {
  handle: true,
  displayName: true,
  bio: true,
  avatarAssetId: true,
} as const;

type ProfileRecord = {
  handle: string;
  displayName: string;
  bio: string | null;
  avatarAssetId: string | null;
};

type ProfileDatabase = {
  userProfile: {
    findUnique(args: {
      where: { handle: string } | { userId: string };
      select: typeof publicProfileSelect;
    }): Promise<ProfileRecord | null>;
    update(args: {
      where: { userId: string };
      data: UpdateOwnProfileInput;
      select: typeof publicProfileSelect;
    }): Promise<ProfileRecord>;
    upsert(args: {
      where: { userId: string };
      create: UpdateOwnProfileInput & { userId: string };
      update: UpdateOwnProfileInput;
      select: typeof publicProfileSelect;
    }): Promise<ProfileRecord>;
  };
};

function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase();
}

export class ProfileServiceError extends Error {
  constructor(readonly code: "HANDLE_TAKEN") {
    super("Profile handle is already in use");
    this.name = "ProfileServiceError";
  }
}

export function createProfileService(database: ProfileDatabase) {
  return {
    async getPublicProfile(handle: string): Promise<PublicProfile | null> {
      const profile = await database.userProfile.findUnique({
        where: { handle: normalizeHandle(handle) },
        select: publicProfileSelect,
      });
      return profile === null ? null : PublicProfileSchema.parse(profile);
    },

    async getOwnProfile(userId: string): Promise<PublicProfile | null> {
      const profile = await database.userProfile.findUnique({
        where: { userId },
        select: publicProfileSelect,
      });
      return profile === null ? null : PublicProfileSchema.parse(profile);
    },

    async upsertOwnProfile(userId: string, input: UpdateOwnProfileInput): Promise<PublicProfile> {
      const data = PublicProfileSchema.parse({ ...input, handle: normalizeHandle(input.handle) });
      let profile: ProfileRecord;
      try {
        profile = await database.userProfile.upsert({
          where: { userId },
          create: { userId, ...data },
          update: data,
          select: publicProfileSelect,
        });
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2002"
        ) {
          throw new ProfileServiceError("HANDLE_TAKEN");
        }
        throw error;
      }
      return PublicProfileSchema.parse(profile);
    },

    async updateOwnProfile(userId: string, input: UpdateOwnProfileInput): Promise<PublicProfile> {
      const data = PublicProfileSchema.parse({
        ...input,
        handle: normalizeHandle(input.handle),
      });
      const profile = await database.userProfile.update({
        where: { userId },
        data,
        select: publicProfileSelect,
      });
      return PublicProfileSchema.parse(profile);
    },
  };
}
