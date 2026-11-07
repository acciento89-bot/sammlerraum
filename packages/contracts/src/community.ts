import { z } from "zod";
import { MembershipActorIdSchema } from "./collaboration";
export type CommunityErrorCode =
  | "COMMUNITY_INVALID"
  | "NOT_FOUND"
  | "BLOCKED_INTERACTION"
  | "COMMUNITY_CONFLICT"
  | "COMMUNITY_LIMIT"
  | "COMMUNITY_UNAVAILABLE";
export class CommunityError extends Error {
  constructor(readonly code: CommunityErrorCode) {
    super(code);
    this.name = "CommunityError";
  }
}
export const FollowTargetSchema = z.object({ userId: MembershipActorIdSchema }).strict();
export const FavoriteTargetSchema = z
  .object({
    type: z.enum(["COLLECTION", "ITEM"]),
    id: z.uuid().transform((value) => value.toLowerCase()),
  })
  .strict();
export type FavoriteTarget = z.infer<typeof FavoriteTargetSchema>;
export const CommunityListQuerySchema = z
  .object({ limit: z.number().int().min(1).max(50).default(20), afterId: z.uuid().optional() })
  .strict();
export const COMMUNITY_MAX_FOLLOWS = 5000;
export const COMMUNITY_MAX_FAVORITES = 10000;
