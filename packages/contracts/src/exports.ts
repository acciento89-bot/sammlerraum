import { z } from "zod";
import { AcquisitionTypeSchema, TradeStatusSchema, CanonicalTimestampSchema } from "./items";
import { VisibilitySchema } from "./collections";
import { parseItemSearchQuery } from "./item-search";
import {
  MoneyExportOptionsSchema,
  MoneyExportSnapshotV1Schema,
  MONEY_EXPORT_MAX_BYTES,
} from "./money-transfer";
import { validUnicode, utf8Length } from "./search-parser";
export const EXPORT_MAX_BYTES = 32 * 1024 * 1024;
export class ExportError extends Error {
  constructor(
    readonly code:
      | "EXPORT_INVALID"
      | "EXPORT_NOT_FOUND"
      | "EXPORT_NOT_READY"
      | "EXPORT_LIMIT_EXCEEDED"
      | "EXPORT_INTEGRITY"
      | "EXPORT_STALE",
  ) {
    super(code);
    this.name = "ExportError";
  }
}
const id = z.uuid().transform((v) => v.toLowerCase());
export const ExportScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ALL") }).strict(),
  z.object({ kind: z.literal("COLLECTION"), collectionId: id }).strict(),
  z.object({ kind: z.literal("SUBTREE"), collectionId: id, nodeId: id }).strict(),
  z.object({ kind: z.literal("SEARCH") }).strict(),
]);
export const ExportRequestSchema = z
  .object({
    scope: ExportScopeSchema,
    format: z.enum(["CSV", "XLSX"]),
    locale: z.enum(["de", "en"]),
    query: z.unknown().optional(),
    money: MoneyExportOptionsSchema.refine((v) => v.measure === "PURCHASE").default({
      measure: "PURCHASE",
      mode: "RAW",
    }),
    includePrivateNotes: z.boolean().default(false),
    includeLocations: z.boolean().default(false),
  })
  .strict();
export function parseExportRequest(input: unknown) {
  const parsed = ExportRequestSchema.safeParse(input);
  if (!parsed.success) throw new ExportError("EXPORT_INVALID");
  const query = parseItemSearchQuery(parsed.data.query ?? {});
  if (query.cursor !== undefined || query.limit !== 20) throw new ExportError("EXPORT_INVALID");
  return { ...parsed.data, query };
}
export type ExportRequest = ReturnType<typeof parseExportRequest>;
const text = z
  .string()
  .max(10000)
  .refine((v) => validUnicode(v) && !v.includes("\0") && utf8Length(v) <= 40000);
export const ExportMetadataSchema = z
  .object({
    itemId: id,
    collectionId: id,
    nodeId: id.nullable(),
    acquisitionType: AcquisitionTypeSchema,
    visibility: VisibilitySchema,
    tradeStatus: TradeStatusSchema,
    publicDescription: text.nullable(),
    archivedAt: CanonicalTimestampSchema.nullable(),
    disposedAt: CanonicalTimestampSchema.nullable(),
    categoryTemplateId: id.nullable(),
    conditionOptionId: id.nullable(),
    catalogEntryId: id.nullable(),
    catalogVariantId: id.nullable(),
    identifiers: z
      .array(
        z
          .object({
            type: z.string().min(1).max(64),
            value: z.string().min(1).max(512),
            normalizedValue: z.string().min(1).max(512),
          })
          .strict(),
      )
      .max(100),
    acquisitionDate: z
      .string()
      .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u)
      .nullable(),
    privateNotes: text.nullable().optional(),
    location: z.object({ id, name: text }).strict().nullable().optional(),
  })
  .strict();
export type ExportMetadata = z.infer<typeof ExportMetadataSchema>;
export const TabularExportSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    ownerId: z.string().min(1).max(512),
    request: ExportRequestSchema,
    money: MoneyExportSnapshotV1Schema,
    metadata: z.array(ExportMetadataSchema).max(1000),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = value.money.rows.map((r) => r.itemId);
    if (
      value.money.measure !== "PURCHASE" ||
      new Set(ids).size !== ids.length ||
      value.metadata.length !== ids.length ||
      value.metadata.some(
        (m, i) =>
          m.itemId !== ids[i] ||
          "privateNotes" in m !== value.request.includePrivateNotes ||
          "location" in m !== value.request.includeLocations,
      ) ||
      utf8Length(JSON.stringify(value)) > MONEY_EXPORT_MAX_BYTES
    )
      ctx.addIssue({ code: "custom", message: "Invalid bounded export snapshot" });
  });
export type TabularExportSnapshot = z.infer<typeof TabularExportSnapshotSchema>;
