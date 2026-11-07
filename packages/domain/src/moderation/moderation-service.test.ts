import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createCommentService } from "../community/comment-service";
import { createBlockReportService } from "./block-report-service";
import { createModerationService } from "./moderation-service";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual application moderation authority and private review",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    async function user(moderator = false) {
      const id = randomUUID();
      await db.user.create({
        data: {
          id,
          name: "Own moderation fixture",
          email: `${id}@example.invalid`,
          emailVerified: true,
        },
      });
      if (moderator)
        await db.applicationRoleGrant.create({
          data: {
            userId: id,
            role: "MODERATOR",
            grantedBy: "owned-test-operator",
            reason: "Synthetic role fixture",
          },
        });
      return { userId: id };
    }
    async function fixture() {
      const owner = await user(),
        author = await user(),
        moderator = await user(true);
      const collection = await db.collection.create({
        data: { ownerId: owner.userId, name: "Public moderation target", visibility: "PUBLIC" },
      });
      const target = { type: "COLLECTION" as const, id: collection.id };
      const comment = await createCommentService(db).createComment(author, {
        target,
        body: "Own reported comment body",
      });
      const report = await createBlockReportService(db).reportComment(owner, {
        commentId: comment.id,
        category: "HARASSMENT",
        reason: "Private original reporter reason",
      });
      return {
        owner,
        author,
        moderator,
        collection,
        target,
        comment,
        report,
        service: createModerationService(db),
      };
    }
    it("rejects ordinary users and collection admins, even with forged platform role claims", async () => {
      const f = await fixture();
      const admin = await user();
      await db.collectionMember.create({
        data: { collectionId: f.collection.id, userId: admin.userId, role: "ADMIN" },
      });
      for (const actor of [f.owner, f.author, { ...admin, role: "ADMIN", isModerator: true }]) {
        await expect(f.service.listReports(actor, {})).rejects.toMatchObject({
          code: "MODERATION_FORBIDDEN",
        });
        await expect(f.service.getCommentForReview(actor, f.comment.id)).rejects.toMatchObject({
          code: "MODERATION_FORBIDDEN",
        });
        await expect(
          f.service.hideContent(actor, f.comment.id, { reason: "Unauthorized" }),
        ).rejects.toMatchObject({ code: "MODERATION_FORBIDDEN" });
      }
      expect(await db.communityModerationEvent.count()).toBe(0);
    });
    it("keeps hidden reported comments privately reviewable and records reasoned MODERATION events", async () => {
      const f = await fixture();
      await f.service.hideContent(f.moderator, f.comment.id, {
        reason: "Investigating the report",
      });
      expect(
        (await createCommentService(db).listComments(null, { target: f.target })).comments,
      ).toEqual([]);
      expect(await f.service.getCommentForReview(f.moderator, f.comment.id)).toMatchObject({
        id: f.comment.id,
        body: "Own reported comment body",
        moderationHidden: true,
      });
      const own = await createBlockReportService(db).listOwnReports(f.owner);
      expect(JSON.stringify(own)).not.toMatch(
        /Investigating|Private original reporter reason|Own reported comment body/,
      );
      const listing = await f.service.listReports(f.moderator, {});
      expect(listing.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: f.report.id, reason: "Private original reporter reason" }),
        ]),
      );
      const event = await db.communityModerationEvent.findFirstOrThrow({
        where: { commentId: f.comment.id },
      });
      expect(event).toMatchObject({
        actorId: f.moderator.userId,
        source: "MODERATION",
        action: "COMMENT_HIDDEN",
        reason: "Investigating the report",
      });
      await expect(
        db.communityModerationEvent.update({
          where: { id: event.id },
          data: { reason: "Overwrite history" },
        }),
      ).rejects.toThrow();
      await expect(
        db.communityModerationEvent.delete({ where: { id: event.id } }),
      ).rejects.toThrow();
    });
    it("restoring a platform hide never reverses owner hides or author deletion", async () => {
      const f = await fixture(),
        comments = createCommentService(db);
      await comments.moderateOwnContentComment(f.owner, f.comment.id, { hidden: true });
      await f.service.hideContent(f.moderator, f.comment.id, { reason: "Check" });
      await f.service.restoreContent(f.moderator, f.comment.id, {
        reason: "Platform restriction lifted",
      });
      expect((await comments.listComments(null, { target: f.target })).comments).toEqual([]);
      await comments.moderateOwnContentComment(f.owner, f.comment.id, { hidden: false });
      expect((await comments.listComments(null, { target: f.target })).comments).toHaveLength(1);
      await comments.deleteOwnComment(f.author, f.comment.id);
      await f.service.hideContent(f.moderator, f.comment.id, { reason: "Preserve pending review" });
      await f.service.restoreContent(f.moderator, f.comment.id, { reason: "Review restored only" });
      expect((await comments.listComments(null, { target: f.target })).comments).toEqual([]);
      expect((await f.service.getCommentForReview(f.moderator, f.comment.id)).deleted).toBe(true);
    });
    it("resolves a report exactly once, keeps a stable receipt and rejects conflicting or reasonless actions", async () => {
      const f = await fixture();
      await expect(
        f.service.resolveReport(f.moderator, f.report.id, { outcome: "RESOLVED", reason: " " }),
      ).rejects.toMatchObject({ code: "MODERATION_INVALID" });
      await expect(
        f.service.hideContent(f.moderator, f.comment.id, { reason: "", source: "USER" }),
      ).rejects.toMatchObject({ code: "MODERATION_INVALID" });
      const value = { outcome: "RESOLVED", reason: "Reviewed the available evidence" };
      const [a, b] = await Promise.all([
        f.service.resolveReport(f.moderator, f.report.id, value),
        f.service.resolveReport(f.moderator, f.report.id, value),
      ]);
      expect(a).toEqual(b);
      expect(
        await db.communityModerationEvent.count({
          where: { reportId: f.report.id, action: "REPORT_RESOLVED" },
        }),
      ).toBe(1);
      await expect(
        f.service.resolveReport(f.moderator, f.report.id, {
          outcome: "DISMISSED",
          reason: "Conflicting retry",
        }),
      ).rejects.toMatchObject({ code: "MODERATION_CONFLICT" });
      expect(
        await db.communityReport.findUniqueOrThrow({ where: { id: f.report.id } }),
      ).toMatchObject({
        status: "RESOLVED",
        resolvedById: f.moderator.userId,
        resolutionReason: value.reason,
      });
    });
    it("releases deleted comment text only after the last pending report and retains immutable decisions after author erasure", async () => {
      const f = await fixture(),
        second = await user();
      const other = await createBlockReportService(db).reportComment(second, {
        commentId: f.comment.id,
        category: "SPAM",
        reason: "Separate pending report",
      });
      await f.service.hideContent(f.moderator, f.comment.id, {
        reason: "Preserve pending investigation",
      });
      await createCommentService(db).deleteOwnComment(f.author, f.comment.id);
      await f.service.resolveReport(f.moderator, f.report.id, {
        outcome: "RESOLVED",
        reason: "First investigation finished",
      });
      expect((await f.service.getCommentForReview(f.moderator, f.comment.id)).body).toBe(
        "Own reported comment body",
      );
      await f.service.resolveReport(f.moderator, other.id, {
        outcome: "DISMISSED",
        reason: "Second investigation finished",
      });
      expect((await f.service.getCommentForReview(f.moderator, f.comment.id)).body).toBe("");
      await db.user.delete({ where: { id: f.author.userId } });
      expect(await db.communityComment.findUnique({ where: { id: f.comment.id } })).toBeNull();
      expect(
        await db.communityModerationEvent.findMany({ where: { targetSnapshotId: f.comment.id } }),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            commentId: null,
            source: "MODERATION",
            action: "COMMENT_HIDDEN",
          }),
        ]),
      );
      await db.applicationRoleGrant.delete({ where: { userId: f.moderator.userId } });
      await db.user.delete({ where: { id: f.moderator.userId } });
      expect(
        await db.communityModerationEvent.findMany({ where: { targetSnapshotId: f.comment.id } }),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ actorId: null, commentId: null, source: "MODERATION" }),
        ]),
      );
    });
    it("rereads the actual role after revocation and never trusts a stale actor object", async () => {
      const f = await fixture();
      await f.service.listReports(f.moderator, {});
      await db.applicationRoleGrant.delete({ where: { userId: f.moderator.userId } });
      await expect(f.service.listReports(f.moderator, {})).rejects.toMatchObject({
        code: "MODERATION_FORBIDDEN",
      });
      await expect(
        f.service.resolveReport(f.moderator, f.report.id, {
          outcome: "DISMISSED",
          reason: "Stale moderator",
        }),
      ).rejects.toMatchObject({ code: "MODERATION_FORBIDDEN" });
      expect(
        (await db.communityReport.findUniqueOrThrow({ where: { id: f.report.id } })).status,
      ).toBe("OPEN");
    });
  },
);
