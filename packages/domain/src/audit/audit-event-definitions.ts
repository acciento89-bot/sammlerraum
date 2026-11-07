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
const definitions = {
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
