import { z } from "zod";
import { MembershipActorIdSchema } from "./collaboration";
export const AuditSourceSchema = z.enum([
  "USER",
  "IMPORT",
  "AI",
  "MARKET_SYNC",
  "SYSTEM",
  "MODERATION",
]);
export const AuditResourceTypeSchema = z.enum([
  "COLLECTION",
  "NODE",
  "ITEM",
  "LOCATION",
  "IMPORT_JOB",
  "SHARE",
]);
export const AuditErrorCodeSchema = z.enum([
  "AUDIT_INVALID",
  "AUDIT_NOT_FOUND",
  "AUDIT_FORBIDDEN",
  "AUDIT_UNAVAILABLE",
  "AUDIT_INTEGRITY",
  "AUDIT_LIMIT_EXCEEDED",
]);
export class AuditError extends Error {
  constructor(readonly code: z.infer<typeof AuditErrorCodeSchema>) {
    super(code);
    this.name = "AuditError";
  }
}
const sequence = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  .refine((value) => BigInt(value) <= 9223372036854775807n);
export const AuditMutationSchema = z
  .object({
    resourceType: AuditResourceTypeSchema,
    resourceId: z.uuid(),
    action: z.string().regex(/^[A-Z][A-Z0-9_]{1,79}$/),
    before: z.unknown(),
    after: z.unknown(),
  })
  .strict();
export const RecordAuditSchema = AuditMutationSchema.extend({
  source: AuditSourceSchema.default("USER"),
});
export const AuditResourceQuerySchema = z
  .object({
    resourceType: AuditResourceTypeSchema,
    resourceId: z.uuid(),
    limit: z.number().int().min(1).max(50).default(20),
    beforeSequence: sequence.optional(),
  })
  .strict();
export const AuditEventSchema = z
  .object({
    id: z.uuid(),
    sequence,
    resourceType: AuditResourceTypeSchema,
    resourceId: z.uuid(),
    action: z.string(),
    source: AuditSourceSchema,
    actorId: MembershipActorIdSchema.nullable(),
    before: z.unknown(),
    after: z.unknown(),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type AuditSource = z.infer<typeof AuditSourceSchema>;
export type AuditMutation = z.infer<typeof AuditMutationSchema>;
