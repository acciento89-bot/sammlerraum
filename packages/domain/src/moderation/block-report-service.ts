import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@sammlerraum/db/search-sql";
import {
  CommunityError,
  FollowTargetSchema,
  CommunityListQuerySchema,
} from "@sammlerraum/contracts/community";
import { ReportCommentSchema, ReportUserSchema } from "@sammlerraum/contracts/comments";
import type { CommunityDatabase } from "../community/social-service";
import {
  communityActor,
  communityTransaction,
  type CommunityActor,
} from "../community/community-transaction";
import { lockCommunityParticipants, loadPublicCommunityTarget } from "../community/social-scope";
import { loadCommentMeta, commentTarget } from "../community/comment-service";
import type { SearchReadTransaction } from "../search/search-read";
function fail(code: CommunityError["code"]): never {
  throw new CommunityError(code);
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) return fail("COMMUNITY_INVALID");
  return result.data;
}
export function createBlockReportService(db: CommunityDatabase) {
  async function ownReport(
    tx: SearchReadTransaction,
    actor: string,
    type: "USER" | "COMMENT",
    target: string,
  ) {
    const [row] = await tx.$queryRaw<{ id: string; status: "OPEN" }[]>(
      Prisma.sql`SELECT id,status FROM "CommunityReport" WHERE "reporterId"=${actor} AND "targetType"=${type}::"CommunityReportTarget" AND "targetSnapshotId"=${target} AND status='OPEN'`,
    );
    return row;
  }
  async function report(
    tx: SearchReadTransaction,
    actor: string,
    type: "USER" | "COMMENT",
    target: string,
    value: { category: string; reason: string },
  ) {
    const existing = await ownReport(tx, actor, type, target);
    if (existing) return { ...existing, created: false };
    const [quota] = await tx.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`SELECT count(*) FROM "CommunityReport" WHERE "reporterId"=${actor} AND status='OPEN'`,
    );
    if (!quota || quota.count >= 1000n) return fail("COMMUNITY_LIMIT");
    const id = randomUUID();
    await tx.$queryRaw(
      Prisma.sql`INSERT INTO "CommunityReport"(id,"reporterId","targetType","targetSnapshotId","userId","commentId",category,reason)VALUES(${id}::uuid,${actor},${type}::"CommunityReportTarget",${target},${type === "USER" ? target : null},${type === "COMMENT" ? target : null}::uuid,${value.category},${value.reason})`,
    );
    return { id, status: "OPEN" as const, created: true };
  }
  return {
    async blockUser(who: CommunityActor, targetInput: string) {
      const actor = communityActor(who),
        target = parse(FollowTargetSchema, { userId: targetInput }).userId;
      if (actor === target) return fail("COMMUNITY_INVALID");
      return communityTransaction(db, async (tx) => {
        await lockCommunityParticipants(tx, [actor, target]);
        const [existing] = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM "UserBlock" WHERE "blockerId"=${actor} AND "blockedId"=${target}`,
        );
        if (existing) return { id: existing.id, userId: target, blocked: true };
        const [quota] = await tx.$queryRaw<{ count: bigint }[]>(
          Prisma.sql`SELECT count(*) FROM "UserBlock" WHERE "blockerId"=${actor}`,
        );
        if (!quota || quota.count >= 5000n) return fail("COMMUNITY_LIMIT");
        const id = randomUUID();
        await tx.$queryRaw(
          Prisma.sql`INSERT INTO "UserBlock"(id,"blockerId","blockedId")VALUES(${id}::uuid,${actor},${target})`,
        );
        return { id, userId: target, blocked: true };
      });
    },
    async unblockUser(who: CommunityActor, targetInput: string) {
      const actor = communityActor(who),
        target = parse(FollowTargetSchema, { userId: targetInput }).userId;
      return communityTransaction(db, async (tx) => {
        await lockCommunityParticipants(tx, [actor]);
        await tx.$queryRaw(
          Prisma.sql`DELETE FROM "UserBlock" WHERE "blockerId"=${actor} AND "blockedId"=${target}`,
        );
        return { userId: target, blocked: false };
      });
    },
    async listOwnBlocks(who: CommunityActor, input: unknown = {}) {
      const actor = communityActor(who),
        value = parse(CommunityListQuerySchema, input);
      return communityTransaction(db, async (tx) => {
        await lockCommunityParticipants(tx, [actor], "READ");
        const rows = await tx.$queryRaw<
          { id: string; userId: string; handle: string | null; displayName: string | null }[]
        >(
          Prisma.sql`SELECT b.id,b."blockedId" AS "userId",p.handle,p."displayName" FROM "UserBlock" b LEFT JOIN "UserProfile" p ON p."userId"=b."blockedId" WHERE b."blockerId"=${actor} ${value.afterId ? Prisma.sql`AND b.id>${value.afterId}::uuid` : Prisma.empty} ORDER BY b.id LIMIT ${value.limit + 1}`,
        );
        return {
          blocks: rows.slice(0, value.limit),
          next: rows.length > value.limit ? rows[value.limit - 1]!.id : null,
        };
      });
    },
    async reportUser(who: CommunityActor, input: unknown) {
      const actor = communityActor(who),
        value = parse(ReportUserSchema, input);
      if (actor === value.userId) return fail("COMMUNITY_INVALID");
      return communityTransaction(db, async (tx) => {
        await lockCommunityParticipants(tx, [actor, value.userId]);
        return report(tx, actor, "USER", value.userId, value);
      });
    },
    async reportComment(who: CommunityActor, input: unknown) {
      const actor = communityActor(who),
        value = parse(ReportCommentSchema, input);
      return communityTransaction(db, async (tx) => {
        const initial = await loadCommentMeta(tx, value.commentId);
        await lockCommunityParticipants(tx, [actor, initial.ownerId, initial.authorId]);
        const existing = await ownReport(tx, actor, "COMMENT", value.commentId);
        if (existing) return { ...existing, created: false };
        const [parent] = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM "Collection" WHERE id=${initial.collectionId}::uuid AND "ownerId"=${initial.ownerId} FOR SHARE`,
        );
        if (!parent) return fail("COMMUNITY_CONFLICT");
        const fresh = await loadCommentMeta(tx, value.commentId);
        if (fresh.ownerId !== initial.ownerId) return fail("COMMUNITY_CONFLICT");
        if (fresh.deletedAt !== null) return fail("NOT_FOUND");
        await loadPublicCommunityTarget(tx, commentTarget(fresh));
        // Reporting is a private moderation action across blocks; never notify the blocked target.
        return report(tx, actor, "COMMENT", value.commentId, value);
      });
    },
    async listOwnReports(who: CommunityActor, input: unknown = {}) {
      const actor = communityActor(who),
        value = parse(CommunityListQuerySchema, input);
      return communityTransaction(db, async (tx) => {
        await lockCommunityParticipants(tx, [actor], "READ");
        const rows = await tx.$queryRaw<
          {
            id: string;
            targetType: "USER" | "COMMENT";
            targetSnapshotId: string;
            category: string;
            status: string;
            createdAt: Date;
            resolvedAt: Date | null;
          }[]
        >(
          Prisma.sql`SELECT id,"targetType","targetSnapshotId",category,status,"createdAt","resolvedAt" FROM "CommunityReport" WHERE "reporterId"=${actor} ${value.afterId ? Prisma.sql`AND id>${value.afterId}::uuid` : Prisma.empty} ORDER BY id LIMIT ${value.limit + 1}`,
        );
        return {
          reports: rows.slice(0, value.limit).map((row) => ({
            ...row,
            createdAt: row.createdAt.toISOString(),
            resolvedAt: row.resolvedAt?.toISOString() ?? null,
          })),
          next: rows.length > value.limit ? rows[value.limit - 1]!.id : null,
        };
      });
    },
  };
}
