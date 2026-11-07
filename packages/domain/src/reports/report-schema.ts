import { TabularExportSnapshotSchema } from "@sammlerraum/contracts/exports";
import {
  ReportError,
  ReportSnapshotSchema,
  parseInsuranceReportOptions,
  type ReportAsset,
  type ReportInsurance,
} from "@sammlerraum/contracts/reports";
export { parseInsuranceReportOptions } from "@sammlerraum/contracts/reports";
export function buildReportModel(
  sourceInput: unknown,
  optionsInput: unknown,
  extra: {
    images?: Map<string, ReportAsset[]>;
    proofs?: ReportAsset[];
    itemInsurance?: Map<string, ReportInsurance>;
    collectionInsurance?: { collectionId: string; insurance: ReportInsurance }[];
  } = {},
) {
  const parsed = TabularExportSnapshotSchema.safeParse(sourceInput);
  if (!parsed.success) throw new ReportError("REPORT_INTEGRITY");
  const source = parsed.data,
    request = parseInsuranceReportOptions(optionsInput),
    fields = new Set(request.include);
  const items = source.money.rows.map((row, index) => {
    const meta = source.metadata[index]!;
    return {
      itemId: row.itemId,
      collectionId: meta.collectionId,
      title: row.title,
      quantity: row.quantity,
      ...(fields.has("values") ? { values: row } : {}),
      ...(fields.has("identifiers") ? { identifiers: meta.identifiers } : {}),
      ...(fields.has("privateNotes") ? { privateNotes: meta.privateNotes ?? null } : {}),
      ...(fields.has("storageLocations") ? { storageLocation: meta.location ?? null } : {}),
      ...(fields.has("images") ? { images: extra.images?.get(row.itemId) ?? [] } : {}),
      ...(fields.has("insurance")
        ? { insurance: extra.itemInsurance?.get(row.itemId) ?? { revision: 0, value: null } }
        : {}),
    };
  });
  const result = ReportSnapshotSchema.safeParse({
    schemaVersion: 1,
    ownerId: source.ownerId,
    reportAsOf: source.money.asOf,
    request,
    items,
    ...(fields.has("proofs") ? { proofs: extra.proofs ?? [] } : {}),
    ...(fields.has("insurance") ? { collectionInsurance: extra.collectionInsurance ?? [] } : {}),
  });
  if (!result.success) throw new ReportError("REPORT_INTEGRITY");
  return result.data;
}
