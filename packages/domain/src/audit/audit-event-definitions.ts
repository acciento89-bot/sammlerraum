import { UpdateItemInputSchema } from "@sammlerraum/contracts/items";
import { SharePermissionsSchema } from "@sammlerraum/contracts/sharing";
import { MoneyViewSchema } from "@sammlerraum/contracts/legacy-money";
import { DocumentCategorySchema } from "@sammlerraum/contracts/media";
import { CustomFieldTypeSchema } from "@sammlerraum/contracts/custom-fields";
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
const tag = z
  .object({ id: z.uuid(), name: z.string().min(1).max(100) })
  .strict()
  .nullable();
const digest = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .nullable();
const customValue = z
  .object({
    fieldDefinitionId: z.uuid(),
    type: CustomFieldTypeSchema,
    shortTextHash: digest,
    longTextHash: digest,
    integerValue: z
      .string()
      .regex(/^-?[0-9]+$/)
      .nullable(),
    decimalValue: z
      .string()
      .regex(/^-?[0-9]+(?:\.[0-9]+)?$/)
      .nullable(),
    dateValue: z.string().nullable(),
    booleanValue: z.boolean().nullable(),
    singleSelectOptionId: z.uuid().nullable(),
    urlHash: digest,
    moneyAmountMinor: z
      .string()
      .regex(/^[0-9]+$/)
      .nullable(),
    moneyCurrency: z.string().nullable(),
    multiSelectOptionIds: z.array(z.uuid()).max(100),
  })
  .strict()
  .nullable();
const imageLink = z
  .object({
    id: z.uuid(),
    purpose: z.enum(["GALLERY", "DETAIL"]),
    position: z.number().int().nonnegative(),
  })
  .strict()
  .nullable();
const documentLink = z
  .object({
    id: z.uuid(),
    category: DocumentCategorySchema,
    visibility: visibility.shape.visibility,
    position: z.number().int().nonnegative(),
  })
  .strict()
  .nullable();
const money = z
  .object({
    family: z.enum(["PURCHASE", "CUSTOM"]),
    fieldDefinitionId: z.uuid().nullable(),
    generation: z.uuid().nullable(),
    sequence: z.string().regex(/^[0-9]+$/),
    raw: MoneyViewSchema.shape.raw,
    interpretation: MoneyViewSchema.shape.interpretation,
  })
  .strict()
  .nullable();
const memberRole = z.enum(["OWNER", "ADMIN", "EDITOR", "VIEWER"]);
const membership = z.object({ role: memberRole.nullable() }).strict();
const sharedAccess = z
  .object({
    id: z.uuid(),
    revision: z.number().int().nonnegative(),
    target: z.object({ kind: z.enum(["COLLECTION", "NODE", "ITEM"]), id: z.uuid() }).strict(),
    permissions: SharePermissionsSchema,
    expiresAt: z.iso.datetime().nullable(),
    revoked: z.boolean(),
    pinRequired: z.boolean(),
  })
  .strict()
  .nullable();
const invitedAccess = z
  .object({
    invitationId: z.uuid(),
    role: z.enum(["ADMIN", "EDITOR", "VIEWER"]),
    targetKind: z.enum(["EMAIL", "USER"]),
    expiresAt: z.iso.datetime(),
    revoked: z.boolean(),
  })
  .strict()
  .nullable();
const restoredRef = { restoredEventId: z.uuid() };
const restoredItemDetails = z.union([
  z.object({ title: UpdateItemInputSchema.shape.title.unwrap(), ...restoredRef }).strict(),
  z.object({ quantity: UpdateItemInputSchema.shape.quantity.unwrap(), ...restoredRef }).strict(),
  z.object({ nodeId: UpdateItemInputSchema.shape.nodeId.unwrap(), ...restoredRef }).strict(),
  z
    .object({ tradeStatus: UpdateItemInputSchema.shape.tradeStatus.unwrap(), ...restoredRef })
    .strict(),
  z
    .object({
      acquisitionType: UpdateItemInputSchema.shape.acquisitionType.unwrap(),
      ...restoredRef,
    })
    .strict(),
  z
    .object({
      acquisitionDate: UpdateItemInputSchema.shape.acquisitionDate.unwrap(),
      ...restoredRef,
    })
    .strict(),
]);
const definitions = {
  ITEM_VISIBILITY_RESTORED: { resourceType: "ITEM", snapshot: visibility.extend(restoredRef) },
  COLLECTION_VISIBILITY_RESTORED: {
    resourceType: "COLLECTION",
    snapshot: visibility.extend(restoredRef),
  },
  ITEM_DETAILS_RESTORED: { resourceType: "ITEM", snapshot: restoredItemDetails },
  COLLECTION_DETAILS_RESTORED: {
    resourceType: "COLLECTION",
    snapshot: z.object({ name: z.string().min(1).max(120), ...restoredRef }).strict(),
  },
  ITEM_CONDITION_RESTORED: { resourceType: "ITEM", snapshot: itemCondition.extend(restoredRef) },
  ITEM_LOCATION_RESTORED: { resourceType: "ITEM", snapshot: itemLocation.extend(restoredRef) },
  ITEM_ARCHIVE_RESTORED: {
    resourceType: "ITEM",
    snapshot: z.object({ archivedAt: z.iso.datetime().nullable(), ...restoredRef }).strict(),
  },
  ITEM_RESTORED: {
    resourceType: "ITEM",
    snapshot: z.object({ deleted: z.boolean(), ...restoredRef }).strict(),
  },
  COLLECTION_RESTORED: {
    resourceType: "COLLECTION",
    snapshot: z.object({ deleted: z.boolean(), ...restoredRef }).strict(),
  },
  SHARE_CREATED: { resourceType: "SHARE", snapshot: sharedAccess },
  SHARE_REVOKED: { resourceType: "SHARE", snapshot: sharedAccess },
  INVITATION_CREATED: { resourceType: "COLLECTION", snapshot: invitedAccess },
  INVITATION_REVOKED: { resourceType: "COLLECTION", snapshot: invitedAccess },
  ITEM_CATALOG_LINK_CHANGED: {
    resourceType: "ITEM",
    snapshot: z
      .object({
        catalogEntryId: z.uuid().nullable(),
        catalogVariantId: z.uuid().nullable(),
        categoryTemplateId: z.uuid().nullable(),
      })
      .strict(),
  },
  ITEM_DISPOSED: {
    resourceType: "ITEM",
    snapshot: z
      .object({ disposedAt: z.iso.datetime().nullable(), tradeStatus: TradeStatusSchema })
      .strict(),
  },
  MEMBERSHIP_ADDED: { resourceType: "COLLECTION", snapshot: membership },
  MEMBERSHIP_ROLE_CHANGED: { resourceType: "COLLECTION", snapshot: membership },
  MEMBERSHIP_REMOVED: { resourceType: "COLLECTION", snapshot: membership },
  MEMBERSHIP_JOINED: {
    resourceType: "COLLECTION",
    snapshot: membership.extend({ invitationId: z.uuid() }),
  },
  COLLECTION_OWNERSHIP_TRANSFERRED: {
    resourceType: "COLLECTION",
    snapshot: z.object({ role: memberRole, previousOwnerRole: memberRole }).strict(),
  },
  IMPORT_BATCH_COMMITTED: {
    resourceType: "IMPORT_JOB",
    snapshot: z
      .object({
        committedRows: z.number().int().nonnegative(),
        status: z.enum(["COMMITTING", "COMPLETED"]),
        revision: z.number().int().nonnegative(),
      })
      .strict(),
  },
  ITEM_MONEY_CHANGED: { resourceType: "ITEM", snapshot: money },
  ITEM_MEDIA_LINKED: { resourceType: "ITEM", snapshot: imageLink },
  ITEM_MEDIA_UNLINKED: { resourceType: "ITEM", snapshot: imageLink },
  ITEM_MEDIA_REORDERED: {
    resourceType: "ITEM",
    snapshot: z.object({ id: z.uuid(), position: z.number().int().nonnegative() }).strict(),
  },
  ITEM_DOCUMENT_LINKED: { resourceType: "ITEM", snapshot: documentLink },
  ITEM_DOCUMENT_UNLINKED: { resourceType: "ITEM", snapshot: documentLink },
  ITEM_DOCUMENT_CHANGED: { resourceType: "ITEM", snapshot: documentLink },
  CUSTOM_FIELD_DEFINITION_CREATED: {
    resourceType: "COLLECTION",
    snapshot: z
      .object({
        id: z.uuid(),
        name: z.string().min(1).max(120),
        type: CustomFieldTypeSchema,
        optionIds: z.array(z.uuid()).max(100),
      })
      .strict()
      .nullable(),
  },
  ITEM_CUSTOM_FIELD_CHANGED: { resourceType: "ITEM", snapshot: customValue },
  ITEM_TAG_ATTACHED: { resourceType: "ITEM", snapshot: tag },
  ITEM_TAG_DETACHED: { resourceType: "ITEM", snapshot: tag },
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
  if (
    value.subjectUserId !== null &&
    ![
      "MEMBERSHIP_ADDED",
      "MEMBERSHIP_ROLE_CHANGED",
      "MEMBERSHIP_REMOVED",
      "MEMBERSHIP_JOINED",
      "COLLECTION_OWNERSHIP_TRANSFERRED",
    ].includes(value.action)
  )
    throw new AuditError("AUDIT_INVALID");
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
