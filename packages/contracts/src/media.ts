import { z } from "zod";

// x-file-name-encoding marks exactly one encodeURIComponent/decodeURIComponent pass.
// Without this marker, x-file-name remains a literal legacy filename (including percent signs).
export const MEDIA_FILE_NAME_ENCODING = "percent-utf8";
export const MEDIA_FILE_NAME_MAX_LENGTH = 255;
// A UTF-16 code unit uses at most three UTF-8 bytes, each escaped as %XX.
export const MEDIA_FILE_NAME_MAX_HEADER_LENGTH = MEDIA_FILE_NAME_MAX_LENGTH * 9;

export const MediaAssetSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["IMAGE", "DOCUMENT"]),
  status: z.enum(["UPLOADING", "PENDING", "PROCESSING", "READY", "FAILED"]),
  mimeType: z.string(),
  byteSize: z.number().int().nonnegative(),
  checksumSha256: z.string().length(64),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  originalFileName: z.string(),
});

export const DocumentCategorySchema = z.enum([
  "PURCHASE_RECEIPT",
  "INVOICE",
  "AUTHENTICITY_CERTIFICATE",
  "GRADING_PROOF",
  "APPRAISAL",
  "INSURANCE",
  "PROVENANCE",
  "WARRANTY",
  "OTHER_PRIVATE",
]);

export const LinkAssetInputSchema = z.discriminatedUnion("target", [
  z.object({
    target: z.literal("ITEM"),
    itemId: z.uuid(),
    assetId: z.uuid(),
    purpose: z.enum(["GALLERY", "DETAIL"]),
    title: z
      .string()
      .trim()
      .max(255)
      .refine((value) => !value.includes("\u0000"), "NUL is not allowed")
      .nullable()
      .optional(),
  }),
  z.object({
    target: z.literal("ITEM_DOCUMENT"),
    itemId: z.uuid(),
    assetId: z.uuid(),
    category: DocumentCategorySchema,
    visibility: z.enum(["PRIVATE", "UNLISTED", "PUBLIC"]).default("PRIVATE"),
    title: z
      .string()
      .trim()
      .max(255)
      .refine((value) => !value.includes("\u0000"), "NUL is not allowed")
      .nullable()
      .optional(),
  }),
]);

export type LinkAssetInput = z.input<typeof LinkAssetInputSchema>;
export type MediaAsset = z.infer<typeof MediaAssetSchema>;
