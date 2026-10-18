import { z } from "zod";

export const VisibilitySchema = z.enum(["PRIVATE", "UNLISTED", "PUBLIC"]);
export type Visibility = z.infer<typeof VisibilitySchema>;

const CollectionNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => !value.includes("\u0000"), "NUL is not allowed");
const CollectionIdSchema = z.string().uuid();

export const CreateCollectionInputSchema = z.object({
  name: CollectionNameSchema,
  visibility: VisibilitySchema.default("PRIVATE"),
});
export type CreateCollectionInput = z.input<typeof CreateCollectionInputSchema>;

export const CollectionSchema = z.object({
  id: CollectionIdSchema,
  name: CollectionNameSchema,
  visibility: VisibilitySchema,
});
export type Collection = z.infer<typeof CollectionSchema>;

export const UpdateCollectionInputSchema = z
  .object({
    name: CollectionNameSchema.optional(),
    visibility: VisibilitySchema.optional(),
  })
  .refine((input) => Object.keys(input).length > 0, "At least one collection field is required");
export type UpdateCollectionInput = z.infer<typeof UpdateCollectionInputSchema>;

export const CreateCollectionNodeInputSchema = z.object({
  collectionId: CollectionIdSchema,
  parentId: CollectionIdSchema.nullable().default(null),
  name: CollectionNameSchema,
  visibility: VisibilitySchema.default("PRIVATE"),
});
export type CreateCollectionNodeInput = z.input<typeof CreateCollectionNodeInputSchema>;

export const CollectionNodeSchema = z.object({
  id: CollectionIdSchema,
  collectionId: CollectionIdSchema,
  parentId: CollectionIdSchema.nullable(),
  name: CollectionNameSchema,
  visibility: VisibilitySchema,
});
export type CollectionNode = z.infer<typeof CollectionNodeSchema>;

export const UpdateCollectionNodeInputSchema = z
  .object({
    parentId: CollectionIdSchema.nullable().optional(),
    name: CollectionNameSchema.optional(),
    visibility: VisibilitySchema.optional(),
  })
  .refine((input) => Object.keys(input).length > 0, "At least one node field is required");
export type UpdateCollectionNodeInput = z.infer<typeof UpdateCollectionNodeInputSchema>;

export const MoveCollectionNodeInputSchema = z.object({
  parentId: CollectionIdSchema.nullable(),
});
export type MoveCollectionNodeInput = z.infer<typeof MoveCollectionNodeInputSchema>;

export const AncestorVisibilitySchema = z.object({
  visibilityPath: z.array(VisibilitySchema).min(1),
  effectiveVisibility: VisibilitySchema,
});
export type AncestorVisibility = z.infer<typeof AncestorVisibilitySchema>;
