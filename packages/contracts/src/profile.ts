import { z } from "zod";

export const UpdateOwnProfileSchema = z.object({
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{2,63}$/),
  displayName: z.string().trim().min(1).max(80),
  bio: z.string().trim().max(500).nullable(),
  avatarAssetId: z.string().uuid().nullable(),
});

export const PublicProfileSchema = UpdateOwnProfileSchema;

export type PublicProfile = z.infer<typeof PublicProfileSchema>;
export type UpdateOwnProfileInput = PublicProfile;
