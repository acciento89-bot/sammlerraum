import { z } from "zod";

import { CustomFieldTypeSchema, type CanonicalCustomFieldValue } from "./custom-fields";

// Keys are authored maintenance identities; labels must never generate or translate them.
export const CatalogKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/u);
const CatalogLabelSchema = z
  .string()
  .max(400)
  .refine((value) => !value.includes("\u0000"))
  .transform((value) => value.normalize("NFKC").trim())
  .pipe(z.string().min(1).max(200));
export const CatalogLabelsSchema = z
  .object({ de: CatalogLabelSchema, en: CatalogLabelSchema })
  .strict();
export type CatalogLabels = z.infer<typeof CatalogLabelsSchema>;

export const CatalogAttributeOptionInputSchema = z
  .object({
    key: CatalogKeySchema,
    labels: CatalogLabelsSchema,
  })
  .strict();
const AttributeInputObjectSchema = z
  .object({
    key: CatalogKeySchema,
    labels: CatalogLabelsSchema,
    type: CustomFieldTypeSchema,
    options: z.array(CatalogAttributeOptionInputSchema).max(100).default([]),
  })
  .strict();
function checkOptions(input: z.infer<typeof AttributeInputObjectSchema>, context: z.RefinementCtx) {
  const select = input.type === "SINGLE_SELECT" || input.type === "MULTI_SELECT";
  const hasOptions = input.options.length > 0;
  if (select !== hasOptions) {
    context.addIssue({
      code: "custom",
      path: ["options"],
      message: "Only selection fields require options",
    });
  }
  if (new Set(input.options.map((option) => option.key)).size !== input.options.length) {
    context.addIssue({ code: "custom", path: ["options"], message: "Option keys must be unique" });
  }
}
export const CatalogAttributeDefinitionInputSchema =
  AttributeInputObjectSchema.superRefine(checkOptions);
export type CatalogAttributeDefinitionInput = z.input<typeof CatalogAttributeDefinitionInputSchema>;

export const CreateCategoryTemplateInputSchema = z
  .object({
    key: CatalogKeySchema,
    labels: CatalogLabelsSchema,
    definitions: z.array(CatalogAttributeDefinitionInputSchema).max(100).default([]),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      new Set(input.definitions.map((definition) => definition.key)).size !==
      input.definitions.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["definitions"],
        message: "Attribute keys must be unique",
      });
    }
  });
export type CreateCategoryTemplateInput = z.input<typeof CreateCategoryTemplateInputSchema>;

const CatalogAttributeOptionSchema = CatalogAttributeOptionInputSchema.extend({
  id: z.string().uuid(),
  position: z.number().int().min(0).max(99),
});
export const CatalogAttributeDefinitionSchema = AttributeInputObjectSchema.extend({
  id: z.string().uuid(),
  categoryTemplateId: z.string().uuid(),
  position: z.number().int().min(0).max(99),
  options: z.array(CatalogAttributeOptionSchema).max(100),
}).superRefine(checkOptions);
export type CatalogAttributeDefinition = z.infer<typeof CatalogAttributeDefinitionSchema>;
export const CategoryTemplateSchema = z
  .object({
    id: z.string().uuid(),
    key: CatalogKeySchema,
    labels: CatalogLabelsSchema,
    definitions: z.array(CatalogAttributeDefinitionSchema).max(100),
  })
  .strict();
export type CategoryTemplate = z.infer<typeof CategoryTemplateSchema>;
export type CanonicalCatalogAttributeValue = CanonicalCustomFieldValue;
