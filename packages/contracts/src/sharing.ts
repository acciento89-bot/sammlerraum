import { z } from "zod";
import { MembershipActorIdSchema } from "./collaboration";
import { LegacyRawMoneySchema } from "./legacy-money";

export const ShareErrorCodeSchema = z.enum([
  "SHARE_INVALID",
  "SHARE_NOT_FOUND",
  "SHARE_FORBIDDEN",
  "SHARE_CONFLICT",
  "SHARE_REVOKED",
  "SHARE_EXPIRED",
  "SHARE_PIN_REQUIRED",
  "SHARE_PIN_INVALID",
  "SHARE_RATE_LIMITED",
  "SHARE_LIMIT_EXCEEDED",
  "SHARE_UNAVAILABLE",
  "SHARE_INTEGRITY",
]);
export class ShareError extends Error {
  constructor(public readonly code: z.infer<typeof ShareErrorCodeSchema>) {
    super(code);
    this.name = "ShareError";
  }
}
export const SharePermissionsSchema = z
  .object({
    readOnly: z.literal(true).default(true),
    images: z.boolean().default(false),
    privateNotes: z.boolean().default(false),
    storageLocation: z.boolean().default(false),
    insurance: z.boolean().default(false),
    purchaseReceipts: z.boolean().default(false),
    values: z.boolean().default(false),
    export: z.boolean().default(false),
    documents: z.array(z.uuid()).max(50).default([]),
  })
  .strict();
export const CreateShareSchema = z
  .object({
    target: z.object({ kind: z.enum(["COLLECTION", "NODE", "ITEM"]), id: z.uuid() }).strict(),
    recipient: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("TOKEN") }).strict(),
      z.object({ kind: z.literal("USER"), userId: MembershipActorIdSchema }).strict(),
    ]),
    expectedRevision: z.number().int().min(0).max(2147483647),
    permissions: SharePermissionsSchema.default(() => SharePermissionsSchema.parse({})),
    expiresInSeconds: z.number().int().min(60).max(31536000).nullable().default(604800),
    pin: z
      .string()
      .regex(/^[0-9]{6,12}$/)
      .optional(),
  })
  .strict();
export const ResolveShareSchema = z.union([
  z
    .object({
      token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      pin: z
        .string()
        .regex(/^[0-9]{6,12}$/)
        .optional(),
      accessToken: z
        .string()
        .regex(/^[A-Za-z0-9_-]{43}$/)
        .optional(),
      after: z.uuid().optional(),
    })
    .strict(),
  z
    .object({
      shareId: z.uuid(),
      pin: z
        .string()
        .regex(/^[0-9]{6,12}$/)
        .optional(),
      accessToken: z
        .string()
        .regex(/^[A-Za-z0-9_-]{43}$/)
        .optional(),
      after: z.uuid().optional(),
    })
    .strict(),
]);
export const RevokeShareSchema = z
  .object({ shareId: z.uuid(), expectedRevision: z.number().int().min(0).max(2147483647) })
  .strict();

export const ReadSharedAssetSchema = z
  .object({ access: ResolveShareSchema, kind: z.enum(["IMAGE", "DOCUMENT"]), linkId: z.uuid() })
  .strict();

export const SharedItemSchema = z
  .object({
    id: z.uuid(),
    title: z.string().max(2000),
    publicDescription: z.string().max(100000).nullable(),
    quantity: z.number().int().positive(),
    privateNotes: z.string().max(100000).nullable().optional(),
    storageLocation: z
      .object({ name: z.string(), type: z.string() })
      .strict()
      .nullable()
      .optional(),
    insurance: z
      .object({
        amountMinor: z.string().nullable(),
        currency: z.string().nullable(),
        minorUnitExponent: z.number().int().nullable(),
        basis: z.string(),
        valuationDate: z.string().nullable(),
        insurer: z.string().nullable(),
        policyReference: z.string().nullable(),
      })
      .strict()
      .nullable()
      .optional(),
    purchase: z
      .object({
        raw: LegacyRawMoneySchema.nullable(),
        interpretation: z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("MISSING") }).strict(),
          z.object({ kind: z.literal("UNKNOWN"), reason: z.string() }).strict(),
          z
            .object({
              kind: z.literal("INTERPRETED"),
              exponent: z.number().int(),
              decimal: z.string(),
              unitKey: z.string(),
              eligibility: z.enum(["ELIGIBLE", "UNIT_UNSUPPORTED"]),
            })
            .strict(),
        ]),
      })
      .strict()
      .optional(),
    valuation: z
      .object({
        amountMinor: z.string(),
        currency: z.string(),
        minorUnitExponent: z.number().int(),
        basis: z.string(),
        observedAt: z.string(),
      })
      .strict()
      .nullable()
      .optional(),
    documents: z
      .array(
        z
          .object({
            id: z.uuid(),
            title: z.string().nullable(),
            category: z.string(),
            mimeType: z.literal("application/pdf"),
          })
          .strict(),
      )
      .max(50)
      .optional(),
    images: z
      .array(
        z
          .object({
            id: z.uuid(),
            title: z.string().nullable(),
            mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
            width: z.number().int().nullable(),
            height: z.number().int().nullable(),
          })
          .strict(),
      )
      .max(8)
      .optional(),
  })
  .strict();
export const ShareResolutionSchema = z
  .object({
    accessToken: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .optional(),
    data: z
      .object({
        shareId: z.uuid(),
        target: CreateShareSchema.shape.target,
        items: z.array(SharedItemSchema).max(100),
        next: z.uuid().nullable(),
        exportAllowed: z.boolean(),
        insurance: SharedItemSchema.shape.insurance,
      })
      .strict(),
  })
  .strict();
export type SharedItem = z.infer<typeof SharedItemSchema>;
