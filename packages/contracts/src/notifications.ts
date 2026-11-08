import { z } from "zod";
import { MembershipActorIdSchema } from "./collaboration";
import { CommunityListQuerySchema } from "./community";
export class NotificationError extends Error {
  constructor(
    readonly code: "NOTIFICATION_INVALID" | "NOTIFICATION_NOT_FOUND" | "NOTIFICATION_CONFLICT",
  ) {
    super(code);
    this.name = "NotificationError";
  }
}
export const NotificationTypeSchema = z.enum([
  "FOLLOW_RECEIVED",
  "FAVORITE_RECEIVED",
  "COMMENT_RECEIVED",
  "REPLY_RECEIVED",
  "MODERATION_STATUS",
  "IMPORT_COMPLETED",
  "EXPORT_COMPLETED",
  "SECURITY_ALERT",
]);
export const NotificationCategorySchema = z.enum(["COMMUNITY", "INVENTORY", "ACCOUNT", "SECURITY"]);
export const NotificationChannelSchema = z.enum(["IN_APP", "EMAIL"]);
const uuid = z.uuid().transform((v) => v.toLowerCase());
export const NotificationTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("USER"), id: MembershipActorIdSchema }).strict(),
  z.object({ type: z.literal("ACCOUNT"), id: MembershipActorIdSchema }).strict(),
  z.object({ type: z.literal("ITEM"), id: uuid }).strict(),
  z.object({ type: z.literal("COLLECTION"), id: uuid }).strict(),
  z.object({ type: z.literal("IMPORT_JOB"), id: uuid }).strict(),
  z.object({ type: z.literal("EXPORT_JOB"), id: uuid }).strict(),
]);
export const NotificationEventSchema = z
  .object({
    recipientId: MembershipActorIdSchema,
    actorId: MembershipActorIdSchema.nullable().default(null),
    eventKey: z.string().regex(/^[a-zA-Z0-9:._-]{1,200}$/),
    type: NotificationTypeSchema,
    target: NotificationTargetSchema,
  })
  .strict()
  .superRefine((v, c) => {
    const allowed =
      v.type === "FOLLOW_RECEIVED"
        ? v.target.type === "USER" && v.target.id === v.actorId
        : ["FAVORITE_RECEIVED", "COMMENT_RECEIVED", "REPLY_RECEIVED"].includes(v.type)
          ? ["COLLECTION", "ITEM"].includes(v.target.type)
          : v.type === "IMPORT_COMPLETED"
            ? v.target.type === "IMPORT_JOB"
            : v.type === "EXPORT_COMPLETED"
              ? v.target.type === "EXPORT_JOB"
              : v.target.type === "ACCOUNT" && v.target.id === v.recipientId;
    if (
      !allowed ||
      (["FOLLOW_RECEIVED", "FAVORITE_RECEIVED", "COMMENT_RECEIVED", "REPLY_RECEIVED"].includes(
        v.type,
      ) &&
        v.actorId === null)
    )
      c.addIssue({ code: "custom", message: "Incoherent notification target" });
  });
const preference = z
  .object({
    category: NotificationCategorySchema,
    channel: NotificationChannelSchema,
    enabled: z.boolean(),
  })
  .strict();
export const UpdateNotificationPreferencesSchema = z
  .object({ locale: z.enum(["de", "en"]).optional(), preferences: z.array(preference).max(8) })
  .strict()
  .refine(
    (v) =>
      new Set(v.preferences.map((p) => p.category + ":" + p.channel)).size === v.preferences.length,
  );
export const NotificationListSchema = CommunityListQuerySchema;
export const NotificationIdSchema = uuid;
export function notificationCategory(
  type: z.infer<typeof NotificationTypeSchema>,
): z.infer<typeof NotificationCategorySchema> {
  return type === "SECURITY_ALERT"
    ? "SECURITY"
    : type === "MODERATION_STATUS"
      ? "ACCOUNT"
      : type.endsWith("_COMPLETED")
        ? "INVENTORY"
        : "COMMUNITY";
}
export type NotificationEvent = z.infer<typeof NotificationEventSchema>;
export const EmptyNotificationCommandSchema = z.object({}).strict();
