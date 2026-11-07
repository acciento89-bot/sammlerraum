import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@sammlerraum/db/search-sql";
import {
  ModerationError,
  ModerationReasonSchema,
  ResolveCommunityReportSchema,
  ModerationReportQuerySchema,
  ModerationIdSchema,
} from "@sammlerraum/contracts/moderation";
import { CommunityError } from "@sammlerraum/contracts/community";
import { ApplicationRoleError, requireApplicationModerator } from "../authz/application-role";
import {
  communityActor,
  communityTransaction,
  type CommunityActor,
} from "../community/community-transaction";
import type { CommunityDatabase } from "../community/social-service";
import { lockCommunityParticipants } from "../community/social-scope";
import { loadCommentMeta } from "../community/comment-service";
import type { SearchReadTransaction } from "../search/search-read";
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const value = schema.safeParse(input);
  if (!value.success) throw new ModerationError("MODERATION_INVALID");
  return value.data;
}
function absent(): never {
  throw new ModerationError("MODERATION_NOT_FOUND");
}
type ReportRow = {
  id: string;
  commentId: string | null;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  resolvedById: string | null;
  resolutionReason: string | null;
  resolvedAt: Date | null;
};
export function createModerationService(db: CommunityDatabase) {
  async function run<T>(
    who: CommunityActor,
    work: (tx: SearchReadTransaction, actor: string) => Promise<T>,
  ) {
    const actor = communityActor(who);
    try {
      return await communityTransaction(db, async (tx) => {
        await requireApplicationModerator(
          {
            $queryRaw<T>(strings: TemplateStringsArray, ...values: unknown[]) {
              return tx.$queryRaw<T>(Prisma.sql(strings, ...values));
            },
          },
          actor,
        );
        return work(tx, actor);
      });
    } catch (error) {
      if (error instanceof ApplicationRoleError) throw new ModerationError("MODERATION_FORBIDDEN");
      if (error instanceof CommunityError && error.code === "NOT_FOUND") return absent();
      throw error;
    }
  }
  async function commentLock(tx: SearchReadTransaction, actor: string, id: string) {
    const initial = await loadCommentMeta(tx, id);
    await lockCommunityParticipants(tx, [actor, initial.ownerId, initial.authorId]);
    const [parent] = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM "Collection" WHERE id=${initial.collectionId}::uuid AND "ownerId"=${initial.ownerId} FOR SHARE`,
    );
    if (!parent) throw new ModerationError("MODERATION_CONFLICT");
    const [locked] = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM "CommunityComment" WHERE id=${id}::uuid FOR UPDATE`,
    );
    if (!locked) return absent();
    return loadCommentMeta(tx, id);
  }
  async function append(
    tx: SearchReadTransaction,
    actor: string,
    input: {
      reportId?: string | null;
      commentId?: string | null;
      target: string;
      action: string;
      reason: string;
      before: unknown;
      after: unknown;
    },
  ) {
    await tx.$queryRaw(
      Prisma.sql`INSERT INTO "CommunityModerationEvent"(id,"actorId","reportId","commentId","targetSnapshotId",source,action,reason,before,after) VALUES(${randomUUID()}::uuid,${actor},${input.reportId ?? null}::uuid,${input.commentId ?? null}::uuid,${input.target},'MODERATION',${input.action},${input.reason},${JSON.stringify(input.before)}::jsonb,${JSON.stringify(input.after)}::jsonb)`,
    );
  }
  async function setHidden(who: CommunityActor, idInput: string, input: unknown, hidden: boolean) {
    const id = parse(ModerationIdSchema, idInput),
      value = parse(ModerationReasonSchema, input);
    return run(who, async (tx, actor) => {
      const meta = await commentLock(tx, actor, id);
      const [reported] = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM "CommunityReport" WHERE "commentId"=${id}::uuid LIMIT 1`,
      );
      if (!reported) return absent();
      const before = meta.moderationHiddenAt !== null;
      if (before !== hidden) {
        await tx.$queryRaw(
          Prisma.sql`UPDATE "CommunityComment" SET "moderationHiddenAt"=${hidden ? Prisma.sql`timezone('UTC',clock_timestamp())` : Prisma.sql`NULL`} WHERE id=${id}::uuid`,
        );
        await append(tx, actor, {
          commentId: id,
          target: id,
          action: hidden ? "COMMENT_HIDDEN" : "COMMENT_RESTORED",
          reason: value.reason,
          before: { hidden: before },
          after: { hidden },
        });
      }
      return { id, moderationHidden: hidden };
    });
  }
  return {
    async listReports(who: CommunityActor, input: unknown = {}) {
      const value = parse(ModerationReportQuerySchema, input);
      return run(who, async (tx) => {
        const rows = await tx.$queryRaw<
          (ReportRow & {
            targetType: string;
            targetSnapshotId: string;
            category: string;
            reason: string;
            createdAt: Date;
          })[]
        >(
          Prisma.sql`SELECT id,"commentId",status,"targetType","targetSnapshotId",category,reason,"createdAt","resolvedAt","resolvedById","resolutionReason" FROM "CommunityReport" WHERE status=${value.status}::"CommunityReportStatus" ${value.afterId ? Prisma.sql`AND id>${value.afterId}::uuid` : Prisma.empty} ORDER BY id LIMIT ${value.limit + 1}`,
        );
        return {
          reports: rows.slice(0, value.limit),
          next: rows.length > value.limit ? rows[value.limit - 1]!.id : null,
        };
      });
    },
    async getCommentForReview(who: CommunityActor, idInput: string) {
      const id = parse(ModerationIdSchema, idInput);
      return run(who, async (tx) => {
        const [row] = await tx.$queryRaw<
          {
            id: string;
            body: string;
            authorId: string;
            parentId: string | null;
            ownerHidden: boolean;
            moderationHidden: boolean;
            deleted: boolean;
            createdAt: Date;
          }[]
        >(
          Prisma.sql`SELECT cm.id,cm.body,cm."authorId",cm."parentId",cm."ownerHiddenAt" IS NOT NULL AS "ownerHidden",cm."moderationHiddenAt" IS NOT NULL AS "moderationHidden",cm."deletedAt" IS NOT NULL AS deleted,cm."createdAt" FROM "CommunityComment" cm WHERE cm.id=${id}::uuid AND EXISTS(SELECT 1 FROM "CommunityReport" r WHERE r."commentId"=cm.id)`,
        );
        return row ?? absent();
      });
    },
    hideContent: (who: CommunityActor, id: string, input: unknown) =>
      setHidden(who, id, input, true),
    restoreContent: (who: CommunityActor, id: string, input: unknown) =>
      setHidden(who, id, input, false),
    async resolveReport(who: CommunityActor, idInput: string, input: unknown) {
      const id = parse(ModerationIdSchema, idInput),
        value = parse(ResolveCommunityReportSchema, input);
      return run(who, async (tx, actor) => {
        const [initial] = await tx.$queryRaw<{ commentId: string | null }[]>(
          Prisma.sql`SELECT "commentId" FROM "CommunityReport" WHERE id=${id}::uuid`,
        );
        if (!initial) return absent();
        if (initial.commentId) await commentLock(tx, actor, initial.commentId);
        else await lockCommunityParticipants(tx, [actor]);
        const [row] = await tx.$queryRaw<ReportRow[]>(
          Prisma.sql`SELECT id,"commentId",status,"resolvedById","resolutionReason","resolvedAt" FROM "CommunityReport" WHERE id=${id}::uuid FOR UPDATE`,
        );
        if (!row) return absent();
        const receipt = (r: ReportRow) => ({
          id: r.id,
          status: r.status,
          resolvedAt: r.resolvedAt?.toISOString() ?? null,
        });
        if (row.status !== "OPEN") {
          if (
            row.status === value.outcome &&
            row.resolvedById === actor &&
            row.resolutionReason === value.reason
          )
            return receipt(row);
          throw new ModerationError("MODERATION_CONFLICT");
        }
        const [saved] = await tx.$queryRaw<ReportRow[]>(
          Prisma.sql`UPDATE "CommunityReport" SET status=${value.outcome}::"CommunityReportStatus","resolvedById"=${actor},"resolutionReason"=${value.reason},"resolvedAt"=timezone('UTC',clock_timestamp()) WHERE id=${id}::uuid RETURNING id,"commentId",status,"resolvedById","resolutionReason","resolvedAt"`,
        );
        if (!saved) return absent();
        await append(tx, actor, {
          reportId: id,
          commentId: row.commentId,
          target: id,
          action: value.outcome === "RESOLVED" ? "REPORT_RESOLVED" : "REPORT_DISMISSED",
          reason: value.reason,
          before: { status: "OPEN" },
          after: { status: value.outcome },
        });
        if (row.commentId)
          await tx.$queryRaw(
            Prisma.sql`UPDATE "CommunityComment" cm SET body='' WHERE cm.id=${row.commentId}::uuid AND cm."deletedAt" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CommunityReport" r WHERE r."commentId"=cm.id AND r.status='OPEN')`,
          );
        return receipt(saved);
      });
    },
  };
}
