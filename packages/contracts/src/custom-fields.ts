import { z } from "zod";

import { PurchaseAmountMinorSchema, PurchaseCurrencySchema } from "./items";

export const CustomFieldTypeSchema = z.enum([
  "SHORT_TEXT",
  "LONG_TEXT",
  "INTEGER",
  "DECIMAL",
  "DATE",
  "BOOLEAN",
  "SINGLE_SELECT",
  "MULTI_SELECT",
  "URL",
  "MONEY",
]);
export type CustomFieldType = z.infer<typeof CustomFieldTypeSchema>;

const CustomFieldIdSchema = z.string().uuid();
const CustomFieldNameSchema = z.string().trim().min(1).max(120);
export const CustomFieldOptionInputSchema = z.string().trim().min(1).max(200);

export const CreateCustomFieldDefinitionInputSchema = z
  .object({
    collectionId: CustomFieldIdSchema,
    name: CustomFieldNameSchema,
    type: CustomFieldTypeSchema,
    options: z.array(CustomFieldOptionInputSchema).max(100).default([]),
  })
  .superRefine((input, context) => {
    const isSelect = input.type === "SINGLE_SELECT" || input.type === "MULTI_SELECT";
    if (isSelect && input.options.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "Selection fields require at least one option",
      });
    }
    if (!isSelect && input.options.length !== 0) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "Only selection fields accept options",
      });
    }
  });
export type CreateCustomFieldDefinitionInput = z.input<
  typeof CreateCustomFieldDefinitionInputSchema
>;

export const CustomFieldDefinitionSchema = z.object({
  id: CustomFieldIdSchema,
  collectionId: CustomFieldIdSchema,
  name: CustomFieldNameSchema,
  type: CustomFieldTypeSchema,
  options: z.array(CustomFieldOptionInputSchema),
});
export type CustomFieldDefinition = z.infer<typeof CustomFieldDefinitionSchema>;

export const CustomFieldMoneyValueSchema = z
  .object({
    amountMinor: PurchaseAmountMinorSchema,
    currency: PurchaseCurrencySchema,
  })
  .strict();
export type CustomFieldMoneyValue = z.infer<typeof CustomFieldMoneyValueSchema>;

export type CanonicalCustomFieldValue =
  | string
  | number
  | boolean
  | string[]
  | CustomFieldMoneyValue;

export type CustomFieldValueRecord = {
  itemId: string;
  fieldDefinitionId: string;
  type: CustomFieldType;
  value: CanonicalCustomFieldValue;
};

export const SetCustomFieldValueInputSchema = z.object({ value: z.unknown() });
