import { z } from "zod";
import { CatalogKeySchema, CatalogLabelsSchema } from "./catalog";

export const CONDITION_MAX_BODY_BYTES = 2048;
export const ConditionIdSchema = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const ConditionLabelKeySchema = z
  .string()
  .max(128)
  .regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/u);
export const NormalizedConditionBandSchema = z.number().int().min(1).max(5).nullable();
export const ConditionOptionInputSchema = z
  .object({
    labelKey: ConditionLabelKeySchema,
    labels: CatalogLabelsSchema,
    normalizedBand: NormalizedConditionBandSchema.default(null),
    active: z.boolean().default(true),
  })
  .strict();
export const CreateConditionSchemeInputSchema = z
  .object({
    categoryTemplateId: ConditionIdSchema,
    key: CatalogKeySchema,
    labels: CatalogLabelsSchema,
    active: z.boolean().default(true),
    options: z.array(ConditionOptionInputSchema).max(100).default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.options.map((option) => option.labelKey)).size !== value.options.length) {
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "Option keys must be unique",
      });
    }
  });
export const ConditionOptionSchema = ConditionOptionInputSchema.extend({
  id: ConditionIdSchema,
  schemeId: ConditionIdSchema,
  categoryTemplateId: ConditionIdSchema,
  position: z.number().int().min(0).max(99),
});
export const ConditionSchemeSchema = z
  .object({
    id: ConditionIdSchema,
    categoryTemplateId: ConditionIdSchema,
    key: CatalogKeySchema,
    labels: CatalogLabelsSchema,
    active: z.boolean(),
    options: z.array(ConditionOptionSchema).max(100),
  })
  .strict();
export const ItemConditionSchema = z
  .object({
    itemId: ConditionIdSchema,
    categoryTemplateId: ConditionIdSchema.nullable(),
    conditionOption: ConditionOptionSchema.nullable(),
    schemeActive: z.boolean().nullable(),
    normalizedBand: NormalizedConditionBandSchema,
  })
  .strict();
export const SetItemConditionInputSchema = z
  .object({ optionId: ConditionIdSchema.nullable() })
  .strict();
export const SetItemCategoryInputSchema = z
  .object({
    categoryTemplateId: ConditionIdSchema.nullable(),
    clearCondition: z.boolean().default(false),
  })
  .strict();
export type ConditionOption = z.infer<typeof ConditionOptionSchema>;
export type ConditionScheme = z.infer<typeof ConditionSchemeSchema>;
export type ItemCondition = z.infer<typeof ItemConditionSchema>;
