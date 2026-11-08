import { z } from "zod";
import { CollectionSchema } from "./collections";
import { CustomFieldDefinitionSchema, CustomFieldOptionInputSchema } from "./custom-fields";
import { CatalogAttributeDefinitionSchema } from "./catalog";
import { CategorySummarySchema } from "./catalog-reads";
import {
  ConditionIdSchema,
  ConditionOptionSchema,
  ConditionSchemeSchema,
  NormalizedConditionBandSchema,
} from "./condition";
import { searchFail } from "./item-search";
export const REFERENCE_MAX_RESPONSE_BYTES = 1_048_576;
export const ReferenceIdSchema = ConditionIdSchema;
export const ReferencePageInputSchema = z
  .object({
    limit: z.number().int().min(1).max(50).default(20),
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,2048}$/u)
      .optional(),
  })
  .strict();
export const CustomReferencePageInputSchema = ReferencePageInputSchema.extend({
  collectionId: ReferenceIdSchema,
});
export const ConditionReferencePageInputSchema = ReferencePageInputSchema.extend({
  categoryId: ReferenceIdSchema,
});
const pair = z.tuple([ReferenceIdSchema, ReferenceIdSchema]);
const conditionPair = z.tuple([ReferenceIdSchema, ReferenceIdSchema.nullable()]);
function unique<T extends z.ZodType>(schema: T) {
  return z
    .array(schema)
    .min(1)
    .max(50)
    .refine(
      (values) => new Set(values.map((value) => JSON.stringify(value))).size === values.length,
    );
}
export const CollectionReferencesInputSchema = z
  .object({ ids: unique(ReferenceIdSchema) })
  .strict();
export const CustomReferencesInputSchema = z
  .object({ references: unique(pair), detail: z.enum(["SUMMARY", "OPTIONS"]).default("SUMMARY") })
  .strict()
  .refine((input) => input.detail !== "OPTIONS" || input.references.length <= 2);
export const ConditionReferencesInputSchema = z
  .object({ references: unique(conditionPair) })
  .strict();
export const CollectionReferenceSchema = CollectionSchema.pick({ id: true, name: true }).strict();
export const CustomReferenceSchema = CustomFieldDefinitionSchema.omit({ options: true }).strict();
export const CustomReferenceOptionsSchema = CustomReferenceSchema.extend({
  options: z.array(CustomFieldOptionInputSchema).max(100),
}).refine(
  (value) =>
    (value.type === "SINGLE_SELECT" || value.type === "MULTI_SELECT") === value.options.length > 0,
);
export const ConditionReferenceOptionSchema = ConditionOptionSchema.extend({
  active: z.boolean(),
  normalizedBand: NormalizedConditionBandSchema,
});
export const ConditionSchemeSummarySchema = ConditionSchemeSchema.omit({ options: true });
export const CatalogDefinitionChoiceSchema = CatalogAttributeDefinitionSchema.omit({
  options: true,
});
const envelope = { version: z.literal(1), readAt: z.string().datetime() };
const page = {
  ...envelope,
  nextCursor: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,2048}$/u)
    .nullable(),
};
export const CollectionReferencePageSchema = z
  .object({ ...page, collections: z.array(CollectionReferenceSchema).max(50) })
  .strict();
export const CustomReferencePageSchema = z
  .object({
    ...page,
    collection: CollectionReferenceSchema,
    definitions: z.array(CustomReferenceSchema).max(50),
  })
  .strict();
export const ConditionReferencePageSchema = z
  .object({
    ...page,
    category: CategorySummarySchema,
    scheme: ConditionSchemeSummarySchema.nullable(),
    options: z.array(ConditionReferenceOptionSchema).max(50),
  })
  .strict();
export const CollectionReferencesSchema = z
  .object({
    ...envelope,
    references: z
      .array(
        z.discriminatedUnion("state", [
          z
            .object({
              id: ReferenceIdSchema,
              state: z.literal("AVAILABLE"),
              collection: CollectionReferenceSchema,
            })
            .strict(),
          z
            .object({
              id: ReferenceIdSchema,
              state: z.literal("UNAVAILABLE"),
              collection: z.null(),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(50),
  })
  .strict();
const customEntries = <T extends z.ZodType>(definition: T, max: number) =>
  z
    .array(
      z.discriminatedUnion("state", [
        z.object({ reference: pair, state: z.literal("AVAILABLE"), definition }).strict(),
        z
          .object({ reference: pair, state: z.literal("UNAVAILABLE"), definition: z.null() })
          .strict(),
      ]),
    )
    .min(1)
    .max(max);
export const CustomReferencesSchema = z.discriminatedUnion("detail", [
  z
    .object({
      ...envelope,
      detail: z.literal("SUMMARY"),
      references: customEntries(CustomReferenceSchema, 50),
    })
    .strict(),
  z
    .object({
      ...envelope,
      detail: z.literal("OPTIONS"),
      references: customEntries(CustomReferenceOptionsSchema, 2),
    })
    .strict(),
]);
export const ConditionReferencesSchema = z
  .object({
    ...envelope,
    references: z
      .array(
        z.discriminatedUnion("state", [
          z
            .object({
              reference: conditionPair,
              state: z.literal("AVAILABLE"),
              category: CategorySummarySchema,
              scheme: ConditionSchemeSummarySchema.nullable(),
              option: ConditionReferenceOptionSchema.nullable(),
            })
            .strict(),
          z
            .object({
              reference: conditionPair,
              state: z.literal("UNAVAILABLE"),
              category: z.null(),
              scheme: z.null(),
              option: z.null(),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(50),
  })
  .strict();
export const CatalogDefinitionChoicesSchema = z
  .object({
    ...envelope,
    category: CategorySummarySchema,
    definitions: z.array(CatalogDefinitionChoiceSchema).max(100),
  })
  .strict();
export const CatalogDefinitionReferenceSchema = z
  .object({
    ...envelope,
    category: CategorySummarySchema,
    definition: CatalogAttributeDefinitionSchema,
  })
  .strict();
export function parseReferenceInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) return searchFail("SEARCH_INVALID");
  return result.data;
}
export type ReferenceFamily = "COLLECTIONS" | "CUSTOM_FIELDS" | "CONDITIONS";

// Bounded SQL projection envelopes, validated before public DTO assembly.
export const ReferenceCursorSchema = z
  .object({
    v: z.literal(1),
    contextHash: z.string().regex(/^[a-f0-9]{64}$/u),
    after: z
      .string()
      .uuid()
      .refine((id) => id === id.toLowerCase()),
  })
  .strict();
export const ReferenceCollectionRowsSchema = z
  .array(z.object({ id: ReferenceIdSchema, collection: z.unknown() }).strict())
  .max(50);
export const ReferenceCustomRowsSchema = z
  .array(z.object({ reference: pair, definition: z.unknown() }).strict())
  .max(50);
export const ReferenceConditionRowsSchema = z
  .array(
    z
      .object({
        reference: conditionPair,
        category: z.unknown(),
        scheme: z.unknown(),
        option: z.unknown(),
      })
      .strict(),
  )
  .max(50);
export const ReferenceCustomPageRowSchema = z
  .object({ collection: z.unknown(), definitions: z.array(z.unknown()).max(51) })
  .strict();
export const ReferenceCustomOptionRowsSchema = z
  .array(
    z
      .object({
        ordinal: z.number().int().min(0).max(1),
        id: ReferenceIdSchema.nullable(),
        options: z.array(z.unknown()).max(101),
      })
      .strict(),
  )
  .max(2);
export const ReferenceConditionPageRowSchema = z
  .object({ category: z.unknown(), scheme: z.unknown(), options: z.array(z.unknown()).max(101) })
  .strict();
export const ReferenceCatalogChoicesRowSchema = z
  .object({ category: z.unknown(), definitions: z.array(z.unknown()).max(101) })
  .strict();
export const ReferenceCatalogDefinitionRowSchema = z
  .object({ category: z.unknown(), definition: z.unknown() })
  .strict();
export const ReferenceOptionsRowSchema = z
  .object({ options: z.array(z.unknown()).max(101) })
  .passthrough();

export type CollectionReferencePage = z.infer<typeof CollectionReferencePageSchema>;
export type CollectionReferences = z.infer<typeof CollectionReferencesSchema>;
export type CustomReferencePage = z.infer<typeof CustomReferencePageSchema>;
export type CustomReferences = z.infer<typeof CustomReferencesSchema>;
export type ConditionReferencePage = z.infer<typeof ConditionReferencePageSchema>;
export type ConditionReferences = z.infer<typeof ConditionReferencesSchema>;
export type CatalogDefinitionChoices = z.infer<typeof CatalogDefinitionChoicesSchema>;
export type CatalogDefinitionReference = z.infer<typeof CatalogDefinitionReferenceSchema>;
