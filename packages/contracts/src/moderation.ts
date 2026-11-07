import { z } from "zod";
import { validUnicode } from "./search-parser";
import { CommunityListQuerySchema } from "./community";
export class ModerationError extends Error {
  constructor(
    readonly code:
      | "MODERATION_INVALID"
      | "MODERATION_FORBIDDEN"
      | "MODERATION_NOT_FOUND"
      | "MODERATION_CONFLICT",
  ) {
    super(code);
    this.name = "ModerationError";
  }
}
export const ModerationReasonSchema = z
  .object({ reason: z.string().trim().min(1).max(2000).refine(validUnicode) })
  .strict();
export const ResolveCommunityReportSchema = ModerationReasonSchema.extend({
  outcome: z.enum(["RESOLVED", "DISMISSED"]),
}).strict();
export const ModerationReportQuerySchema = CommunityListQuerySchema.extend({
  status: z.enum(["OPEN", "RESOLVED", "DISMISSED"]).default("OPEN"),
}).strict();
export const ModerationIdSchema = z.uuid().transform((v) => v.toLowerCase());
export const ModerationContentActionSchema = ModerationReasonSchema.extend({
  action: z.enum(["HIDE", "RESTORE"]),
}).strict();
