import { z } from "zod";
import { validUnicode } from "./search-parser";
export class MembershipError extends Error {
  constructor(
    readonly code:
      | "MEMBERSHIP_INVALID"
      | "MEMBERSHIP_NOT_FOUND"
      | "MEMBERSHIP_FORBIDDEN"
      | "MEMBERSHIP_CONFLICT"
      | "MEMBERSHIP_OWNER_REQUIRED"
      | "MEMBERSHIP_LIMIT_EXCEEDED"
      | "MEMBERSHIP_TRANSFER_BLOCKED"
      | "MEMBERSHIP_UNAVAILABLE"
      | "MEMBERSHIP_INTEGRITY",
  ) {
    super(code);
    this.name = "MembershipError";
  }
}
const id = z.uuid().transform((value) => value.toLowerCase());
const userId = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => value.trim() === value && !value.includes("\0") && validUnicode(value));
export const CollectionMemberRoleSchema = z.enum(["ADMIN", "EDITOR", "VIEWER"]);
const mutation = z.object({
  collectionId: id,
  expectedRevision: z.number().int().min(0).max(2147483646),
});
export const MemberMutationSchema = mutation
  .extend({ userId, role: CollectionMemberRoleSchema })
  .strict();
export const MemberRemovalSchema = mutation.extend({ userId }).strict();
export const OwnershipTransferSchema = mutation
  .extend({ newOwnerId: userId, confirmPrivateTransfer: z.literal(true) })
  .strict();
export const MembershipCollectionIdSchema = id;
export const MembershipActorIdSchema = userId;
export const MEMBERSHIP_MAX_MEMBERS = 200;
