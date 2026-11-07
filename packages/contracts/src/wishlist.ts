import { z } from "zod";
import { validUnicode } from "./search-parser";
export type WishlistErrorCode =
  | "WISHLIST_INVALID"
  | "WISHLIST_NOT_FOUND"
  | "WISHLIST_CONFLICT"
  | "WISHLIST_LIMIT"
  | "WISHLIST_UNAVAILABLE";
export class WishlistError extends Error {
  constructor(readonly code: WishlistErrorCode) {
    super(code);
    this.name = "WishlistError";
  }
}
export const WishlistIdSchema = z.uuid().transform((value) => value.toLowerCase());
const text = (max: number) => z.string().trim().min(1).max(max).refine(validUnicode);
export const WishlistTargetPriceSchema = z
  .object({
    amountMinor: z
      .string()
      .regex(/^(?:0|[1-9][0-9]{0,18})$/u)
      .refine(
        (value) => /^(?:0|[1-9][0-9]{0,18})$/u.test(value) && BigInt(value) <= 9223372036854775807n,
      ),
    currency: z.string().regex(/^[A-Z]{3}$/u),
    minorUnitExponent: z.number().int().min(0).max(6),
  })
  .strict();
export const CreateWishlistEntrySchema = z
  .object({
    title: text(200),
    catalogEntryId: WishlistIdSchema.nullable().default(null),
    catalogVariantId: WishlistIdSchema.nullable().default(null),
    desiredCondition: text(200).nullable().default(null),
    targetPrice: WishlistTargetPriceSchema.nullable().default(null),
    priority: z.number().int().min(1).max(5).default(3),
    notes: text(10000).nullable().default(null),
  })
  .strict()
  .refine((value) => value.catalogVariantId === null || value.catalogEntryId !== null);
export const WishlistListQuerySchema = z
  .object({
    limit: z.number().int().min(1).max(50).default(20),
    afterId: WishlistIdSchema.optional(),
    status: z.enum(["ALL", "OPEN", "FULFILLED"]).default("ALL"),
  })
  .strict();
export const WishlistEntrySchema = z
  .object({
    id: WishlistIdSchema,
    title: text(200),
    catalogEntryId: WishlistIdSchema.nullable(),
    catalogVariantId: WishlistIdSchema.nullable(),
    desiredCondition: text(200).nullable(),
    targetPrice: WishlistTargetPriceSchema.nullable(),
    priority: z.number().int().min(1).max(5),
    notes: text(10000).nullable(),
    fulfilledAt: z.iso.datetime({ precision: 3 }).nullable(),
    createdAt: z.iso.datetime({ precision: 3 }),
  })
  .strict();
export const DuplicateCandidatesQuerySchema = z
  .object({
    itemId: WishlistIdSchema,
    afterId: WishlistIdSchema.optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();
export const WISHLIST_MAX_ENTRIES = 1000;
export const DUPLICATE_MAX_RELATIONS = 10000;
export const DuplicatePairSchema = z
  .object({ itemAId: WishlistIdSchema, itemBId: WishlistIdSchema })
  .strict()
  .refine((v) => v.itemAId !== v.itemBId);
export const EmptyWishlistCommandSchema = z.object({}).strict();
