import { z } from "zod";
import { CreateItemInputSchema, UpdateItemInputSchema, CollectibleItemSchema } from "./items";
import { NewMoneyIntentSchema, ExistingMoneyIntentSchema, MoneyViewSchema } from "./legacy-money";
const {
  purchaseAmountMinor: _amount,
  purchaseCurrency: _currency,
  ...create
} = CreateItemInputSchema.shape;
const {
  purchaseAmountMinor: _updateAmount,
  purchaseCurrency: _updateCurrency,
  ...update
} = UpdateItemInputSchema.shape;
export const CreateItemMoneyInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    item: z.object(create).strict(),
    purchase: NewMoneyIntentSchema.optional(),
  })
  .strict();
export const UpdateItemMoneyInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    item: z.object(update).strict().default({}),
    purchase: ExistingMoneyIntentSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v.item).length > 0 || v.purchase !== undefined);
export const CustomMoneyWriteInputSchema = z
  .object({ schemaVersion: z.literal(1), intent: ExistingMoneyIntentSchema })
  .strict();
export const ItemMoneyResultSchema = z
  .object({ schemaVersion: z.literal(1), item: CollectibleItemSchema, purchase: MoneyViewSchema })
  .strict();
export type ItemMoneyResult = z.infer<typeof ItemMoneyResultSchema>;

import { scanFilterJson, copyBoundedFilterInput } from "./search-parser";
import {
  LegacyMoneyIdSchema,
  LegacyMoneySubjectSchema,
  LegacyRawMoneySchema,
  LegacyMoneyExponentSchema,
  AuthoringReceiptSchema,
  MoneyFactTokenV1Schema,
} from "./legacy-money";
/** Reuse the existing bounded Unicode/duplicate-key scanner; JSON.parse owns syntax. */
export const scanPersonalMoneyJson = scanFilterJson;
export const copyPersonalMoneyInput = copyBoundedFilterInput;
export const MoneyHistoryQuerySchema = z
  .object({
    limit: z.number().int().min(1).max(50).default(20),
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,2048}$/u)
      .optional(),
  })
  .strict();
export const MoneyHistorySequenceSchema = MoneyFactTokenV1Schema.shape.sequence.refine(
  (value) => value !== "0",
);
export const MoneyHistoryEventSchema = z.object({
  id: LegacyMoneyIdSchema,
  sequence: MoneyHistorySequenceSchema,
  generation: LegacyMoneyIdSchema,
  operation: z.enum(["BASELINE", "RAW_WRITE", "CLEAR", "AUTHOR", "CLASSIFY", "COPY", "REVOKE"]),
  raw: LegacyRawMoneySchema.nullable(),
  exponent: LegacyMoneyExponentSchema.nullable(),
  unitKey: z.string().max(128).nullable(),
  unitLabel: z.string().max(480).nullable(),
  basisId: z.string().max(80).nullable(),
  receipt: AuthoringReceiptSchema.nullable(),
  sourceEventId: LegacyMoneyIdSchema.nullable(),
  originSubject: LegacyMoneySubjectSchema.nullable().default(null),
  originEventId: LegacyMoneyIdSchema.nullable(),
  revokedAssertionId: LegacyMoneyIdSchema.nullable(),
  revocationId: LegacyMoneyIdSchema.nullable().default(null),
  actorId: z.string().max(512).nullable(),
  evidenceCategory: z.enum(["OWNER_ATTESTATION", "OPERATOR_VERIFIED_RECORD"]).nullable(),
  evidenceReference: z.string().max(800).nullable(),
  reason: z.string().max(4000).nullable(),
  createdAt: z.string().datetime(),
  evidenceErasedAt: z.string().datetime().nullable(),
  expectedAssertionToken: z.string().max(2048).nullable(),
});

/** Exact existing private bulk/read response, separate from an immutable item snapshot. */
export const PersonalMoneyBulkResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    purchase: MoneyViewSchema,
    custom: z.array(MoneyViewSchema).max(50),
  })
  .strict();
export const MoneyValueResultSchema = z
  .object({ schemaVersion: z.literal(1), money: MoneyViewSchema })
  .strict();

export const PersonalMoneyHistoryResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    subject: LegacyMoneySubjectSchema,
    events: z.array(MoneyHistoryEventSchema).max(50),
    nextCursor: z.string().max(2048).nullable(),
  })
  .strict();
export const MoneyRevocationResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    subject: LegacyMoneySubjectSchema,
    assertionId: LegacyMoneyIdSchema,
    revoked: z.literal(true),
  })
  .strict();
