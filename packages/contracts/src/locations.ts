import { z } from "zod";

import { VisibilitySchema } from "./collections";
import { CanonicalTimestampSchema } from "./items";

const LocationIdSchema = z.string().uuid();
const LocationNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), "Control characters are not allowed");

export const LocationTypeSchema = z.enum([
  "ROOM",
  "CABINET",
  "SHELF",
  "DRAWER",
  "BOX",
  "OTHER",
]);
export type LocationType = z.infer<typeof LocationTypeSchema>;

export const CreateLocationInputSchema = z.object({
  parentId: LocationIdSchema.nullable().default(null),
  name: LocationNameSchema,
  type: LocationTypeSchema.default("OTHER"),
  visibility: VisibilitySchema.default("PRIVATE"),
});
export type CreateLocationInput = z.input<typeof CreateLocationInputSchema>;

export const StorageLocationSchema = z.object({
  id: LocationIdSchema,
  parentId: LocationIdSchema.nullable(),
  name: LocationNameSchema,
  type: LocationTypeSchema,
  visibility: VisibilitySchema,
  qrToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export type StorageLocation = z.infer<typeof StorageLocationSchema>;

export const ItemLocationHistorySchema = z.object({
  id: LocationIdSchema,
  itemId: LocationIdSchema,
  fromLocationId: LocationIdSchema.nullable(),
  toLocationId: LocationIdSchema.nullable(),
  assignedById: z.string().min(1),
  movedAt: CanonicalTimestampSchema,
});
export type ItemLocationHistory = z.infer<typeof ItemLocationHistorySchema>;

export const LocationContentItemSchema = z.object({
  id: LocationIdSchema,
  collectionId: LocationIdSchema,
  title: z.string().trim().min(1).max(200),
  quantity: z.number().int().positive(),
});

export const LocationContentsSchema = z.object({
  location: StorageLocationSchema,
  childLocations: z.array(StorageLocationSchema),
  items: z.array(LocationContentItemSchema),
});
export type LocationContents = z.infer<typeof LocationContentsSchema>;
