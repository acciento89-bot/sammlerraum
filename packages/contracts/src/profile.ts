import { z } from "zod";

export const PublicProfileSchema = z.object({
  handle: z.string(),
  displayName: z.string(),
  bio: z.string().nullable(),
  avatarAssetId: z.string().uuid().nullable(),
});

export type PublicProfile = z.infer<typeof PublicProfileSchema>;
export type UpdateOwnProfileInput = PublicProfile;
