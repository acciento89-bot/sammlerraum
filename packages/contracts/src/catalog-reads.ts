import { z } from "zod";
import { CatalogKeySchema, CatalogLabelsSchema, CatalogSourceSchema } from "./catalog";

export const CatalogReadIdSchema = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const CATALOG_LINK_MAX_BODY_BYTES = 2048;
export const CatalogLinkInputSchema = z
  .object({ entryId: CatalogReadIdSchema, variantId: CatalogReadIdSchema.nullable().default(null) })
  .strict();
const text = z.string().min(1).max(300);
export const CatalogTitleSummarySchema = z
  .object({
    language: z.string().max(20),
    title: text,
    translations: z.array(z.object({ language: z.string().max(20), title: text }).strict()).max(20),
  })
  .strict();
export const CatalogVariantSummarySchema = z
  .object({
    id: CatalogReadIdSchema,
    text: CatalogTitleSummarySchema,
    language: z.string().max(20).optional(),
    edition: z.string().max(200).optional(),
    reference: z.string().max(200).optional(),
  })
  .strict();
export const CategorySummarySchema = z
  .object({ id: CatalogReadIdSchema, key: CatalogKeySchema, labels: CatalogLabelsSchema })
  .strict();
export const CatalogSearchResultSchema = z
  .object({
    id: CatalogReadIdSchema,
    category: CategorySummarySchema,
    revision: z.number().int().positive(),
    text: CatalogTitleSummarySchema,
    variants: z.array(CatalogVariantSummarySchema).max(5),
    variantCount: z.number().int().min(0).max(100),
    identifiers: z
      .array(
        z
          .object({
            id: CatalogReadIdSchema,
            variantId: CatalogReadIdSchema.optional(),
            namespace: CatalogKeySchema,
            type: CatalogKeySchema,
            value: z.string().max(500),
            sources: z.array(CatalogSourceSchema).max(20),
          })
          .strict(),
      )
      .max(5),
    identifierCount: z.number().int().min(0).max(200),
  })
  .strict();
export type CatalogSearchResult = z.infer<typeof CatalogSearchResultSchema>;
export const CatalogPageInputSchema = z
  .object({
    limit: z.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();
export const CatalogSearchInputSchema = CatalogPageInputSchema.extend({
  mode: z.enum(["text", "identifier"]),
  q: z
    .string()
    .min(1)
    .max(500)
    .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value)),
  categoryId: CatalogReadIdSchema.optional(),
  namespace: CatalogKeySchema.optional(),
  type: CatalogKeySchema.optional(),
})
  .superRefine((value, context) => {
    if (
      value.mode === "text" &&
      (value.q.trim().length < 2 ||
        value.q.trim().length > 200 ||
        value.namespace !== undefined ||
        value.type !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "Text query must have 2–200 characters and no identifier filters",
      });
    }
    if (!value.q.trim()) context.addIssue({ code: "custom", message: "A query is required" });
  })
  .transform((value) => ({ ...value, q: value.mode === "text" ? value.q.trim() : value.q }));
export type CatalogSearchInput = z.input<typeof CatalogSearchInputSchema>;
export const ItemCatalogLinkSchema = z
  .object({
    itemId: CatalogReadIdSchema,
    categoryTemplateId: CatalogReadIdSchema.nullable(),
    catalogEntryId: CatalogReadIdSchema.nullable(),
    catalogVariantId: CatalogReadIdSchema.nullable(),
    entry: z
      .object({
        id: CatalogReadIdSchema,
        revision: z.number().int().positive(),
        text: CatalogTitleSummarySchema,
      })
      .strict()
      .nullable(),
    variant: CatalogVariantSummarySchema.extend({ active: z.boolean() }).nullable(),
  })
  .strict();
export type ItemCatalogLink = z.infer<typeof ItemCatalogLinkSchema>;
