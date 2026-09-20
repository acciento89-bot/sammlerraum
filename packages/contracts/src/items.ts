import { z } from "zod";

import { VisibilitySchema } from "./collections";

export type { Visibility } from "./collections";

export const AcquisitionTypeSchema = z.enum([
  "PURCHASE",
  "GIFT",
  "TRADE",
  "INHERITANCE",
  "FOUND",
  "OTHER",
]);
export type AcquisitionType = z.infer<typeof AcquisitionTypeSchema>;

export const TradeStatusSchema = z.enum(["NOT_FOR_TRADE", "OPEN_TO_TRADE", "FOR_SALE", "RESERVED"]);
export type TradeStatus = z.infer<typeof TradeStatusSchema>;

const ItemIdSchema = z.string().uuid();
const ItemTitleSchema = z.string().trim().min(1).max(200);
const OptionalTextSchema = z.string().trim().min(1).max(10_000).nullable();

function isCanonicalCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export const AcquisitionDateSchema = z
  .string()
  .refine(isCanonicalCalendarDate, "Expected a real calendar date in YYYY-MM-DD form");

export const CanonicalTimestampSchema = z.string().refine((value) => {
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value;
}, "Expected a canonical UTC timestamp");

const supportedCurrencies = new Set(Intl.supportedValuesOf("currency"));

export const PurchaseCurrencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .refine(
    (currency) => supportedCurrencies.has(currency),
    "Expected a supported ISO 4217 currency",
  );

// This is the price of one unit, not the total paid for the quantity row.
export const PurchaseAmountMinorSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

function requireMoneyPair(
  data: {
    purchaseAmountMinor?: number | null | undefined;
    purchaseCurrency?: string | null | undefined;
  },
  context: z.RefinementCtx,
) {
  if ((data.purchaseAmountMinor === null) !== (data.purchaseCurrency === null)) {
    context.addIssue({
      code: "custom",
      message: "Purchase amount and currency must both be present or both be null",
      path: data.purchaseAmountMinor === null ? ["purchaseAmountMinor"] : ["purchaseCurrency"],
    });
  }
}

export const CreateItemInputSchema = z
  .object({
    collectionId: ItemIdSchema,
    nodeId: ItemIdSchema.nullable().default(null),
    title: ItemTitleSchema,
    publicDescription: OptionalTextSchema.default(null),
    privateNotes: OptionalTextSchema.default(null),
    quantity: z.number().int().positive().max(2_147_483_647).default(1),
    acquisitionType: AcquisitionTypeSchema.default("OTHER"),
    acquisitionDate: AcquisitionDateSchema.nullable().default(null),
    purchaseAmountMinor: PurchaseAmountMinorSchema.nullable().default(null),
    purchaseCurrency: PurchaseCurrencySchema.nullable().default(null),
    visibility: VisibilitySchema.default("PRIVATE"),
    tradeStatus: TradeStatusSchema.default("NOT_FOR_TRADE"),
  })
  .superRefine(requireMoneyPair);
export type CreateItemInput = z.input<typeof CreateItemInputSchema>;

export const UpdateItemInputSchema = z
  .object({
    nodeId: ItemIdSchema.nullable().optional(),
    title: ItemTitleSchema.optional(),
    publicDescription: OptionalTextSchema.optional(),
    privateNotes: OptionalTextSchema.optional(),
    quantity: z.number().int().positive().max(2_147_483_647).optional(),
    acquisitionType: AcquisitionTypeSchema.optional(),
    acquisitionDate: AcquisitionDateSchema.nullable().optional(),
    purchaseAmountMinor: PurchaseAmountMinorSchema.nullable().optional(),
    purchaseCurrency: PurchaseCurrencySchema.nullable().optional(),
    visibility: VisibilitySchema.optional(),
    tradeStatus: TradeStatusSchema.optional(),
    disposedAt: CanonicalTimestampSchema.optional(),
  })
  .superRefine((data, context) => {
    if (Object.keys(data).length === 0) {
      context.addIssue({ code: "custom", message: "At least one item field is required" });
    }
    const changesAmount = Object.hasOwn(data, "purchaseAmountMinor");
    const changesCurrency = Object.hasOwn(data, "purchaseCurrency");
    if (changesAmount !== changesCurrency) {
      context.addIssue({
        code: "custom",
        message: "Purchase amount and currency must be updated together",
        path: changesAmount ? ["purchaseCurrency"] : ["purchaseAmountMinor"],
      });
    }
    if (changesAmount && changesCurrency) requireMoneyPair(data, context);
  });
export type UpdateItemInput = z.input<typeof UpdateItemInputSchema>;

export const CollectibleItemSchema = z.object({
  id: ItemIdSchema,
  collectionId: ItemIdSchema,
  nodeId: ItemIdSchema.nullable(),
  title: ItemTitleSchema,
  publicDescription: OptionalTextSchema,
  privateNotes: OptionalTextSchema,
  quantity: z.number().int().positive().max(2_147_483_647),
  acquisitionType: AcquisitionTypeSchema,
  acquisitionDate: AcquisitionDateSchema.nullable(),
  purchaseAmountMinor: PurchaseAmountMinorSchema.nullable(),
  purchaseCurrency: PurchaseCurrencySchema.nullable(),
  visibility: VisibilitySchema,
  tradeStatus: TradeStatusSchema,
  archivedAt: CanonicalTimestampSchema.nullable(),
  disposedAt: CanonicalTimestampSchema.nullable(),
});
export type CollectibleItem = z.infer<typeof CollectibleItemSchema>;

// Public responses are constructed from this whitelist. Protected ownership,
// acquisition, document, valuation, and storage fields are intentionally absent.
export const PublicItemSchema = z.object({
  id: ItemIdSchema,
  title: ItemTitleSchema,
  publicDescription: OptionalTextSchema,
  quantity: z.number().int().positive().max(2_147_483_647),
  tradeStatus: TradeStatusSchema,
});
export type PublicItem = z.infer<typeof PublicItemSchema>;

export const SplitQuantityInputSchema = z.number().int().positive().max(2_147_483_647);

export const SplitQuantityResultSchema = z.object({
  source: CollectibleItemSchema,
  created: CollectibleItemSchema,
});
export type SplitQuantityResult = z.infer<typeof SplitQuantityResultSchema>;

export const ItemIdentifierInputSchema = z.object({
  type: z.string().min(1).max(64),
  value: z.string().min(1).max(512),
});
export const SetItemIdentifiersInputSchema = z.object({
  identifiers: z.array(ItemIdentifierInputSchema).max(100),
});
export const SetItemTagsInputSchema = z.object({
  tags: z.array(z.string().min(1).max(100)).max(100),
});
export const SplitItemInputSchema = z.object({ quantity: SplitQuantityInputSchema });
