import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createItemService } from "../items/item-service";
import { createSocialService } from "../community/social-service";
import { createCommentService } from "../community/comment-service";
import { createBlockReportService } from "./block-report-service";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual personal blocks and private abuse reports",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    async function user() {
      const id = randomUUID();
      await db.user.create({
        data: {
          id,
          name: "Own block/report fixture",
          email: `${id}@example.invalid`,
          emailVerified: true,
          profile: {
            create: {
              handle: `u_${id.replaceAll("-", "").slice(0, 20)}`,
              displayName: "Block/report display",
            },
          },
        },
      });
      return { userId: id };
    }
    it("keeps own block/unblock retries idempotent and removes actual relationships without touching another person's block", async () => {
      const actor = await user(),
        target = await user(),
        service = createBlockReportService(db),
        social = createSocialService(db);
      await social.followUser(actor, target.userId);
      await service.blockUser(actor, target.userId);
      await service.blockUser(actor, target.userId);
      expect(
        await db.userBlock.count({ where: { blockerId: actor.userId, blockedId: target.userId } }),
      ).toBe(1);
      expect(await db.userFollow.count({ where: { followerId: actor.userId } })).toBe(0);
      await service.blockUser(target, actor.userId);
      await service.unblockUser(actor, target.userId);
      await service.unblockUser(actor, target.userId);
      expect(
        await db.userBlock.count({ where: { blockerId: target.userId, blockedId: actor.userId } }),
      ).toBe(1);
      await expect(service.blockUser(actor, actor.userId)).rejects.toMatchObject({
        code: "COMMUNITY_INVALID",
      });
    });
    it("deduplicates private pending reports, retains hidden reported comment bodies, and never grants moderation authority", async () => {
      const owner = await user(),
        author = await user(),
        reporter = await user(),
        c = await db.collection.create({
          data: { ownerId: owner.userId, name: "Reported public thread", visibility: "PUBLIC" },
        }),
        item = await createItemService(db, owner.userId).createItem({
          collectionId: c.id,
          title: "Reported public item",
          visibility: "PUBLIC",
        }),
        comments = createCommentService(db),
        service = createBlockReportService(db),
        comment = await comments.createComment(author, {
          target: { type: "ITEM", id: item.id },
          body: "A reported public statement",
        }),
        report = await service.reportComment(reporter, {
          commentId: comment.id,
          category: "HARASSMENT",
          reason: "Needs an authorized review",
        }),
        retry = await service.reportComment(reporter, {
          commentId: comment.id,
          category: "HARASSMENT",
          reason: "Needs an authorized review",
        });
      expect(retry.id).toBe(report.id);
      await comments.moderateOwnContentComment(owner, comment.id, { hidden: true });
      expect(
        await db.communityReport.findUniqueOrThrow({ where: { id: report.id } }),
      ).toMatchObject({ reporterId: reporter.userId, commentId: comment.id, status: "OPEN" });
      expect(
        (await db.communityComment.findUniqueOrThrow({ where: { id: comment.id } })).body,
      ).toBe("A reported public statement");
      expect(
        (await comments.listComments(reporter, { target: { type: "ITEM", id: item.id } })).comments,
      ).toEqual([]);
      expect(
        await db.applicationRoleGrant.findUnique({ where: { userId: reporter.userId } }),
      ).toBeNull();
    });

    it("normalizes equivalent UUID spellings into one actual pending report", async () => {
      const owner = await user(),
        author = await user(),
        reporter = await user(),
        c = await db.collection.create({
          data: { ownerId: owner.userId, name: "Canonical report target", visibility: "PUBLIC" },
        }),
        item = await createItemService(db, owner.userId).createItem({
          collectionId: c.id,
          title: "Canonical reported item",
          visibility: "PUBLIC",
        }),
        id = "abcdefab-0000-4000-8000-000000000123";
      await db.communityComment.create({
        data: {
          id,
          authorId: author.userId,
          collectionId: c.id,
          itemId: item.id,
          body: "A real canonical comment",
        },
      });
      const service = createBlockReportService(db),
        first = await service.reportComment(reporter, {
          commentId: id.toUpperCase(),
          category: "SPAM",
          reason: "One actual target",
        }),
        second = await service.reportComment(reporter, {
          commentId: id,
          category: "SPAM",
          reason: "One actual target",
        });
      expect(first.id).toBe(second.id);
      expect(
        await db.communityReport.count({
          where: { reporterId: reporter.userId, commentId: id, status: "OPEN" },
        }),
      ).toBe(1);
    });

    it("retains an open reported body on soft deletion but erases it on actual account deletion", async () => {
      const owner = await user(),
        author = await user(),
        reporter = await user(),
        c = await db.collection.create({
          data: { ownerId: owner.userId, name: "Reported erasure lifecycle", visibility: "PUBLIC" },
        }),
        item = await createItemService(db, owner.userId).createItem({
          collectionId: c.id,
          title: "Lifecycle item",
          visibility: "PUBLIC",
        }),
        comments = createCommentService(db),
        reports = createBlockReportService(db),
        target = { type: "ITEM" as const, id: item.id },
        comment = await comments.createComment(author, {
          target,
          body: "Reported body retained only while needed",
        }),
        reply = await comments.createComment(owner, {
          target,
          parentId: comment.id,
          body: "Another person's separate reply",
        }),
        report = await reports.reportComment(reporter, {
          commentId: comment.id,
          category: "SPAM",
          reason: "Review before cleanup",
        });
      await comments.deleteOwnComment(author, comment.id);
      expect(
        (await db.communityComment.findUniqueOrThrow({ where: { id: comment.id } })).body,
      ).toBe("Reported body retained only while needed");
      await db.user.delete({ where: { id: author.userId } });
      expect(await db.communityComment.findUnique({ where: { id: comment.id } })).toBeNull();
      expect(
        await db.communityComment.findUniqueOrThrow({ where: { id: reply.id } }),
      ).toMatchObject({ parentId: null, body: "Another person's separate reply" });
      expect(
        await db.communityReport.findUniqueOrThrow({ where: { id: report.id } }),
      ).toMatchObject({ commentId: null, status: "OPEN" });
    });
  },
);
