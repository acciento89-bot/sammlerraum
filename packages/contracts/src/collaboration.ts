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

export class InvitationError extends Error {
  constructor(
    readonly code:
      | "INVITATION_INVALID"
      | "INVITATION_NOT_FOUND"
      | "INVITATION_FORBIDDEN"
      | "INVITATION_CONFLICT"
      | "INVITATION_RECIPIENT_MISMATCH"
      | "INVITATION_VERIFICATION_REQUIRED"
      | "INVITATION_EXPIRED"
      | "INVITATION_REVOKED"
      | "INVITATION_MEMBERSHIP_CONFLICT"
      | "INVITATION_LIMIT_EXCEEDED"
      | "INVITATION_UNAVAILABLE"
      | "INVITATION_INTEGRITY",
  ) {
    super(code);
    this.name = "InvitationError";
  }
}
export const InvitationTargetSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("EMAIL"),
      email: z
        .string()
        .trim()
        .max(254)
        .email()
        .transform((value) => value.toLowerCase()),
    })
    .strict(),
  z.object({ kind: z.literal("USER"), userId }).strict(),
]);
export const CreateInvitationSchema = mutation
  .extend({
    target: InvitationTargetSchema,
    role: CollectionMemberRoleSchema,
    expiresInSeconds: z
      .number()
      .int()
      .min(60)
      .max(14 * 24 * 60 * 60)
      .default(48 * 60 * 60),
  })
  .strict();
export const RevokeInvitationSchema = mutation.extend({ invitationId: id }).strict();
export const AcceptInvitationSchema = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();
export const INVITATION_MAX_PENDING = 20;

/** Explicit private response contracts: never serialize token hashes or internal creator rows. */
export const InvitationDtoSchema = z
  .object({
    id,
    collectionId: id,
    target: InvitationTargetSchema,
    role: CollectionMemberRoleSchema,
    expiresAt: z.iso.datetime(),
    status: z.enum(["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"]),
  })
  .strict();
export const InvitationCreatedResponseSchema = z
  .object({ invitation: InvitationDtoSchema, token: AcceptInvitationSchema.shape.token })
  .strict();
export const InvitationListResponseSchema = z
  .object({ invitations: z.array(InvitationDtoSchema).max(INVITATION_MAX_PENDING) })
  .strict();
export const InvitationAcceptanceResponseSchema = z
  .object({
    collectionId: id,
    role: z.enum(["OWNER", "ADMIN", "EDITOR", "VIEWER"]),
    acceptedAt: z.iso.datetime(),
    alreadyAccepted: z.boolean(),
  })
  .strict();
export type InvitationDto = z.infer<typeof InvitationDtoSchema>;
