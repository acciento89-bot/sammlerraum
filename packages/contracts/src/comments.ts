import { z } from "zod";
import { FavoriteTargetSchema, CommunityListQuerySchema, FollowTargetSchema } from "./community";
import { validUnicode } from "./search-parser";
const text = (max: number) => z.string().trim().min(1).max(max).refine(validUnicode);
export const CreateCommentSchema = z
  .object({
    target: FavoriteTargetSchema,
    body: text(4000),
    parentId: z
      .uuid()
      .transform((value) => value.toLowerCase())
      .nullable()
      .default(null),
  })
  .strict();
export const CommentListSchema = CommunityListQuerySchema.extend({
  target: FavoriteTargetSchema,
  includeOwnerHidden: z.boolean().default(false),
}).strict();
export const CommentPolicySchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("GLOBAL"), enabled: z.boolean() }).strict(),
  z
    .object({
      scope: z.literal("COLLECTION"),
      targetId: z.uuid().transform((value) => value.toLowerCase()),
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      scope: z.literal("ITEM"),
      targetId: z.uuid().transform((value) => value.toLowerCase()),
      enabled: z.boolean(),
    })
    .strict(),
]);
export const CommentHideSchema = z.object({ hidden: z.boolean() }).strict();
export const ReportReasonSchema = z
  .object({
    category: z.enum(["SPAM", "HARASSMENT", "ILLEGAL_CONTENT", "OTHER"]),
    reason: text(2000),
  })
  .strict();
export const ReportCommentSchema = ReportReasonSchema.extend({
  commentId: z.uuid().transform((value) => value.toLowerCase()),
}).strict();
export const ReportUserSchema = ReportReasonSchema.extend({
  userId: FollowTargetSchema.shape.userId,
}).strict();

export const CreateReportSchema = z.discriminatedUnion("type", [
  ReportCommentSchema.extend({ type: z.literal("COMMENT") }).strict(),
  ReportUserSchema.extend({ type: z.literal("USER") }).strict(),
]);
