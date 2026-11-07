import { AcquisitionTypeSchema, TradeStatusSchema } from "@sammlerraum/contracts/items";
import { LocationTypeSchema } from "@sammlerraum/contracts/locations";
import { z } from "zod";
import { AuditError, AuditMutationSchema } from "@sammlerraum/contracts/audit";
const visibility = z.object({ visibility: z.enum(["PRIVATE", "UNLISTED", "PUBLIC"]) }).strict();
// Core mutation integration adds each additional definition together with its native witnesses.
const location = z
  .object({
    name: z
      .string()
      .min(1)
      .max(120)
      .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value)),
    type: LocationTypeSchema,
    parentId: z.uuid().nullable(),
  })
  .strict();
const itemCondition = z
  .object({ categoryTemplateId: z.uuid().nullable(), conditionOptionId: z.uuid().nullable() })
  .strict();
const itemLocation = z.object({ storageLocationId: z.uuid().nullable() }).strict();
const grading = z
  .object({
    id: z.uuid(),
    provider: z.string().min(1).max(120),
    grade: z.string().min(1).max(120),
    comparableValue: z.string().nullable(),
    comparableScale: z.string().nullable(),
    certificateNo: z.string().max(160).nullable(),
    gradedAt: z.string().nullable(),
  })
  .strict()
  .nullable();
const valuation = z
  .object({
    id: z.uuid(),
    basis: z.literal("PER_UNIT"),
    amountMinor: z.string().regex(/^[0-9]+$/),
    currency: z.string().regex(/^[A-Z]{3}$/),
    minorUnitExponent: z.number().int().min(0).max(6),
    observedAt: z.iso.datetime(),
  })
  .strict()
  .nullable();
const collection = z
  .object({ name: z.string().min(1).max(120), visibility: visibility.shape.visibility })
  .strict();
const node = z
  .object({
    collectionId: z.uuid(),
    parentId: z.uuid().nullable(),
    name: z.string().min(1).max(120),
    visibility: visibility.shape.visibility,
  })
  .strict();
const itemDetails = z
  .object({
    collectionId: z.uuid(),
    nodeId: z.uuid().nullable(),
    title: z.string().min(1).max(200),
    quantity: z.number().int().positive().max(2147483647),
    acquisitionType: AcquisitionTypeSchema,
    acquisitionDate: z.string().nullable(),
    tradeStatus: TradeStatusSchema,
    publicDescriptionHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    privateNotesHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
  })
  .strict();
const definitions = {
  ITEM_CREATED: {
    resourceType: "ITEM",
    snapshot: itemDetails.extend({ visibility: visibility.shape.visibility }).nullable(),
  },
  ITEM_DETAILS_CHANGED: { resourceType: "ITEM", snapshot: itemDetails },
  ITEM_SPLIT: {
    resourceType: "ITEM",
    snapshot: z
      .object({ quantity: z.number().int().positive(), createdItemId: z.uuid().nullable() })
      .strict(),
  },
  ITEM_ARCHIVED: {
    resourceType: "ITEM",
    snapshot: z
      .object({
        archivedAt: z.iso.datetime().nullable(),
        tradeStatus: itemDetails.shape.tradeStatus,
      })
      .strict(),
  },
  ITEM_DELETED: { resourceType: "ITEM", snapshot: z.object({ deleted: z.boolean() }).strict() },
  COLLECTION_CREATED: { resourceType: "COLLECTION", snapshot: collection.nullable() },
  COLLECTION_DETAILS_CHANGED: {
    resourceType: "COLLECTION",
    snapshot: z.object({ name: z.string().min(1).max(120) }).strict(),
  },
  COLLECTION_DELETED: {
    resourceType: "COLLECTION",
    snapshot: z.object({ deleted: z.boolean() }).strict(),
  },
  NODE_CREATED: { resourceType: "NODE", snapshot: node.nullable() },
  NODE_DETAILS_CHANGED: { resourceType: "NODE", snapshot: node },
  NODE_MOVED: { resourceType: "NODE", snapshot: node },
  LOCATION_CREATED: { resourceType: "LOCATION", snapshot: location.nullable() },
  ITEM_CATEGORY_CHANGED: { resourceType: "ITEM", snapshot: itemCondition },
  ITEM_GRADING_CREATED: { resourceType: "ITEM", snapshot: grading },
  ITEM_GRADING_UPDATED: { resourceType: "ITEM", snapshot: grading },
  ITEM_GRADING_REMOVED: { resourceType: "ITEM", snapshot: grading },
  ITEM_VALUATION_ADDED: { resourceType: "ITEM", snapshot: valuation },
  ITEM_CONDITION_CHANGED: { resourceType: "ITEM", snapshot: itemCondition },
  ITEM_LOCATION_CHANGED: { resourceType: "ITEM", snapshot: itemLocation },
  ITEM_VISIBILITY_CHANGED: { resourceType: "ITEM", snapshot: visibility },
  COLLECTION_VISIBILITY_CHANGED: { resourceType: "COLLECTION", snapshot: visibility },
  LOCATION_DETAILS_CHANGED: { resourceType: "LOCATION", snapshot: location },
} as const;
export function checkedAuditMutation(input: unknown) {
  const parsed = AuditMutationSchema.safeParse(input);
  if (!parsed.success) throw new AuditError("AUDIT_INVALID");
  const value = parsed.data,
    definition = definitions[value.action as keyof typeof definitions];
  if (!definition || definition.resourceType !== value.resourceType)
    throw new AuditError("AUDIT_INVALID");
  const before = definition.snapshot.safeParse(value.before),
    after = definition.snapshot.safeParse(value.after);
  if (
    !before.success ||
    !after.success ||
    JSON.stringify(before.data) === JSON.stringify(after.data)
  )
    throw new AuditError("AUDIT_INVALID");
  if (
    Buffer.byteLength(JSON.stringify(before.data)) > 16384 ||
    Buffer.byteLength(JSON.stringify(after.data)) > 16384
  )
    throw new AuditError("AUDIT_LIMIT_EXCEEDED");
  return { ...value, before: before.data, after: after.data };
}
