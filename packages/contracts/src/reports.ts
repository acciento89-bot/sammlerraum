import { z } from "zod";
import { ExportScopeSchema, ExportMetadataSchema, parseExportRequest } from "./exports";
import { MoneyExportOptionsSchema, MoneyExportRowSchema } from "./money-transfer";
import { CanonicalTimestampSchema } from "./items";
import { AmountMinorSchema } from "./valuations";
import { validUnicode, utf8Length, scanFilterJson } from "./search-parser";
export class ReportError extends Error {
  constructor(
    readonly code:
      | "REPORT_INVALID"
      | "REPORT_NOT_FOUND"
      | "REPORT_NOT_READY"
      | "REPORT_LIMIT_EXCEEDED"
      | "REPORT_INTEGRITY"
      | "REPORT_STALE"
      | "REPORT_UNSUPPORTED_TEXT",
  ) {
    super(code);
    this.name = "ReportError";
  }
}
const id = z.uuid().transform((v) => v.toLowerCase());
export const ReportFieldSchema = z.enum([
  "images",
  "values",
  "identifiers",
  "privateNotes",
  "storageLocations",
  "insurance",
  "policyReferences",
  "proofs",
]);
export const InsuranceReportOptionsSchema = z
  .object({
    scope: ExportScopeSchema,
    locale: z.enum(["de", "en"]),
    query: z.unknown().optional(),
    money: MoneyExportOptionsSchema.refine((v) => v.measure === "PURCHASE").default({
      measure: "PURCHASE",
      mode: "RAW",
    }),
    include: z.array(ReportFieldSchema).max(8).default([]),
    proofAssetIds: z.array(id).max(20).default([]),
  })
  .strict();
export function parseInsuranceReportOptions(input: unknown) {
  let size: number;
  try {
    size = utf8Length(JSON.stringify(input));
  } catch {
    throw new ReportError("REPORT_INVALID");
  }
  if (size > 16384) throw new ReportError("REPORT_INVALID");
  const parsed = InsuranceReportOptionsSchema.safeParse(input);
  if (!parsed.success) throw new ReportError("REPORT_INVALID");
  const value = parsed.data,
    fields = new Set(value.include);
  if (
    fields.size !== value.include.length ||
    new Set(value.proofAssetIds).size !== value.proofAssetIds.length ||
    (value.proofAssetIds.length && !fields.has("proofs")) ||
    (fields.has("policyReferences") && !fields.has("insurance")) ||
    (value.money.mode !== "RAW" && !fields.has("values"))
  )
    throw new ReportError("REPORT_INVALID");
  let normalized: ReturnType<typeof parseExportRequest>;
  try {
    normalized = parseExportRequest({
      scope: value.scope,
      locale: value.locale,
      query: value.query,
      money: value.money,
      format: "CSV",
      includePrivateNotes: fields.has("privateNotes"),
      includeLocations: fields.has("storageLocations"),
    });
  } catch {
    throw new ReportError("REPORT_INVALID");
  }
  return {
    ...value,
    query: normalized.query,
    include: [...fields].sort(),
    proofAssetIds: [...value.proofAssetIds].sort(),
  };
}
export type InsuranceReportOptions = ReturnType<typeof parseInsuranceReportOptions>;
const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine((v) => validUnicode(v) && utf8Length(v) <= max * 4);
export const ReportAssetSchema = z
  .object({
    assetId: id,
    itemId: id,
    storageKey: text(1024),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
    byteSize: AmountMinorSchema.refine((v) => BigInt(v) > 0n && BigInt(v) <= 16777216n),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    fileName: text(255),
  })
  .strict();
export type ReportAsset = z.infer<typeof ReportAssetSchema>;
export const ReportInsuranceSchema = z
  .object({
    revision: z.number().int().min(0).max(2147483647),
    value: z
      .object({
        amountMinor: AmountMinorSchema,
        currency: z.string().regex(/^[A-Z]{3}$/u),
        minorUnitExponent: z.number().int().min(0).max(4),
        basis: z.enum(["PER_UNIT", "COLLECTION_TOTAL"]),
        valuationDate: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u),
        insurer: text(200).nullable(),
        policyReference: text(500).nullable().optional(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type ReportInsurance = z.infer<typeof ReportInsuranceSchema>;
export const ReportItemSchema = z
  .object({
    itemId: id,
    collectionId: id,
    title: text(200),
    quantity: z.string().regex(/^[1-9][0-9]*$/u),
    identifiers: ExportMetadataSchema.shape.identifiers.optional(),
    values: MoneyExportRowSchema.optional(),
    privateNotes: ExportMetadataSchema.shape.privateNotes,
    storageLocation: ExportMetadataSchema.shape.location,
    images: z.array(ReportAssetSchema).max(1).optional(),
    insurance: ReportInsuranceSchema.optional(),
  })
  .strict();
export const ReportSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    ownerId: text(512),
    reportAsOf: CanonicalTimestampSchema,
    request: InsuranceReportOptionsSchema,
    items: z.array(ReportItemSchema).max(1000),
    proofs: z.array(ReportAssetSchema).max(20).optional(),
    collectionInsurance: z
      .array(z.object({ collectionId: id, insurance: ReportInsuranceSchema }).strict())
      .max(1000)
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const fields = new Set(value.request.include),
      ids = new Set(value.items.map((v) => v.itemId));
    let invalid = ids.size !== value.items.length || utf8Length(JSON.stringify(value)) > 8388608;
    for (const item of value.items) {
      for (const [field, key] of [
        ["values", "values"],
        ["identifiers", "identifiers"],
        ["privateNotes", "privateNotes"],
        ["storageLocations", "storageLocation"],
        ["images", "images"],
        ["insurance", "insurance"],
      ] as const)
        if (key in item !== fields.has(field)) invalid = true;
      if (
        item.values &&
        (item.values.itemId !== item.itemId ||
          item.values.title !== item.title ||
          item.values.quantity !== item.quantity)
      )
        invalid = true;
      for (const asset of item.images ?? [])
        if (asset.itemId !== item.itemId || asset.mimeType === "application/pdf") invalid = true;
      if (
        item.insurance?.value &&
        "policyReference" in item.insurance.value !== fields.has("policyReferences")
      )
        invalid = true;
    }
    if (
      "proofs" in value !== fields.has("proofs") ||
      "collectionInsurance" in value !== fields.has("insurance")
    )
      invalid = true;
    const proofs = value.proofs ?? [];
    if (
      proofs.some((a) => !ids.has(a.itemId)) ||
      new Set(proofs.map((a) => a.assetId)).size !== proofs.length ||
      [...new Set(proofs.map((a) => a.assetId))].sort().join(",") !==
        [...value.request.proofAssetIds].sort().join(",")
    )
      invalid = true;
    const collections = new Set(value.items.map((v) => v.collectionId));
    if (value.request.scope.kind === "COLLECTION")
      collections.add(value.request.scope.collectionId);
    for (const entry of value.collectionInsurance ?? []) {
      if (!collections.has(entry.collectionId)) invalid = true;
      if (
        entry.insurance.value &&
        (entry.insurance.value.basis !== "COLLECTION_TOTAL" ||
          "policyReference" in entry.insurance.value !== fields.has("policyReferences"))
      )
        invalid = true;
    }
    if (invalid) ctx.addIssue({ code: "custom", message: "Invalid selected report snapshot" });
  });
export type ReportSnapshot = z.infer<typeof ReportSnapshotSchema>;

export function parseInsuranceReportJson(raw: string): unknown {
  try {
    scanFilterJson(raw);
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ReportError("REPORT_INVALID");
  }
}
