import { z } from "zod";
export const RestoreErrorCodeSchema = z.enum([
  "RESTORE_INVALID",
  "RESTORE_NOT_FOUND",
  "RESTORE_CONFLICT",
  "RESTORE_UNSUPPORTED",
  "RESTORE_UNAVAILABLE",
  "RESTORE_INTEGRITY",
]);
export class RestoreError extends Error {
  constructor(readonly code: z.infer<typeof RestoreErrorCodeSchema>) {
    super(code);
    this.name = "RestoreError";
  }
}
export const RestoreFieldSchema = z.enum([
  "visibility",
  "title",
  "quantity",
  "nodeId",
  "tradeStatus",
  "acquisitionType",
  "acquisitionDate",
  "conditionOptionId",
  "storageLocationId",
  "name",
  "archivedAt",
  "deletedAt",
]);
export type RestoreField = z.infer<typeof RestoreFieldSchema>;
const sequence = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  .refine((v) => BigInt(v) <= 9223372036854775807n);
export const RestorePreconditionsSchema = z
  .object({ expectedUpdatedAt: z.iso.datetime(), expectedLatestSequence: sequence })
  .strict();
export const RestorePreviewInputSchema = z.object({ eventId: z.uuid() }).strict();
export const RestoreAuditInputSchema = RestorePreconditionsSchema.extend({
  eventId: z.uuid(),
  field: RestoreFieldSchema,
}).strict();
export const RestoreItemInputSchema = RestorePreconditionsSchema.extend({
  itemId: z.uuid(),
}).strict();
export const SoftDeleteItemInputSchema = z.object({ itemId: z.uuid() }).strict();
