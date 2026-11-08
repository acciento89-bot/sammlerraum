import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createItemService } from "../items/item-service";
import { createCommentService } from "./comment-service";
import { createBlockReportService } from "../moderation/block-report-service";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual public comment creation and owner controls",
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
          name: "Own comment fixture",
          email: `${id}@example.invalid`,
          emailVerified: true,
          profile: {
            create: {
              handle: `u_${id.replaceAll("-", "").slice(0, 20)}`,
              displayName: "Public comment display",
            },
          },
        },
      });
      return { userId: id };
    }
    async function fixture() {
      const owner = await user(),
        peer = await user(),
        outsider = await user(),
        collection = await db.collection.create({
          data: { ownerId: owner.userId, name: "Public comment collection", visibility: "PUBLIC" },
        }),
        item = await createItemService(db, owner.userId).createItem({
          collectionId: collection.id,
          title: "Public comment item",
          visibility: "PUBLIC",
          privateNotes: "never-comment-private-note",
        });
      return { owner, peer, outsider, collection, item, service: createCommentService(db) };
    }
    it("keeps the deepest accepted reply readable and rejects the next without rows or notices", async () => {
      const f = await fixture(),
        target = { type: "ITEM" as const, id: f.item.id };
      let last = await f.service.createComment(f.peer, { target, body: "Depth0" });
      for (let depth = 1; depth <= 32; depth++)
        last = await f.service.createComment(f.peer, {
          target,
          parentId: last.id,
          body: `Depth${depth}`,
        });
      expect(last.canReply).toBe(false);
      expect(
        (await f.service.listComments(f.outsider, { target, limit: 50 })).comments.some(
          (c) => c.id === last.id,
        ),
      ).toBe(true);
      const before = await db.communityComment.count({ where: { collectionId: f.collection.id } }),
        notices = await db.notification.count({ where: { recipientId: f.owner.userId } });
      await expect(
        f.service.createComment(f.peer, {
          target,
          parentId: last.id,
          body: "Never invisible success",
        }),
      ).rejects.toMatchObject({ code: "COMMENT_PARENT_INVALID" });
      expect(await db.communityComment.count({ where: { collectionId: f.collection.id } })).toBe(
        before,
      );
      expect(await db.notification.count({ where: { recipientId: f.owner.userId } })).toBe(notices);
    });
    it("lets only the actual owner inspect and restore owner-hidden content while preserving platform/deletion boundaries", async () => {
      const f = await fixture(),
        target = { type: "ITEM" as const, id: f.item.id };
      const comment = await f.service.createComment(f.peer, {
        target,
        body: "Owner can recover this comment",
      });
      await f.service.moderateOwnContentComment(f.owner, comment.id, { hidden: true });
      expect((await f.service.listComments(null, { target })).comments).toEqual([]);
      expect((await f.service.listComments(f.owner, { target })).comments).toEqual([]);
      await expect(
        f.service.listComments(f.peer, { target, includeOwnerHidden: true }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      const managed = await f.service.listComments(f.owner, { target, includeOwnerHidden: true });
      expect(managed.comments[0]).toMatchObject({
        id: comment.id,
        ownerHidden: true,
        canReply: false,
      });
      await f.service.moderateOwnContentComment(f.owner, comment.id, { hidden: false });
      expect((await f.service.listComments(null, { target })).comments[0]).toMatchObject({
        id: comment.id,
      });
      await db.communityComment.update({
        where: { id: comment.id },
        data: { moderationHiddenAt: new Date() },
      });
      expect(
        (await f.service.listComments(f.owner, { target, includeOwnerHidden: true })).comments,
      ).toEqual([]);
      await db.communityComment.update({
        where: { id: comment.id },
        data: { moderationHiddenAt: null },
      });
      await f.service.deleteOwnComment(f.peer, comment.id);
      expect(
        (await f.service.listComments(f.owner, { target, includeOwnerHidden: true })).comments,
      ).toEqual([]);
    });
    it("creates bounded public replies with actual author identity and no private projection fields", async () => {
      const f = await fixture(),
        target = { type: "ITEM" as const, id: f.item.id },
        comment = await f.service.createComment(f.peer, {
          target,
          body: "A useful collector observation",
        }),
        reply = await f.service.createComment(f.owner, {
          target,
          parentId: comment.id,
          body: "Thank you",
        });
      const view = await f.service.listComments(f.outsider, { target });
      expect(view.comments.map((row) => row.id).sort()).toEqual([comment.id, reply.id].sort());
      expect(JSON.stringify(view)).not.toMatch(
        /never-comment-private-note|privateNotes|purchaseAmountMinor|@example.invalid/,
      );
      expect(
        await db.communityComment.findUniqueOrThrow({ where: { id: comment.id } }),
      ).toMatchObject({ authorId: f.peer.userId, body: "A useful collector observation" });
    });
    it("requires all actual owner comment switches at global, collection and item levels", async () => {
      const f = await fixture(),
        target = { type: "ITEM" as const, id: f.item.id };
      for (const policy of [
        { scope: "GLOBAL", enabled: false },
        { scope: "COLLECTION", targetId: f.collection.id, enabled: false },
        { scope: "ITEM", targetId: f.item.id, enabled: false },
      ]) {
        await f.service.setCommentPolicy(f.owner, policy);
        await expect(
          f.service.createComment(f.peer, { target, body: "Denied while disabled" }),
        ).rejects.toMatchObject({ code: "COMMENTS_DISABLED" });
        await f.service.setCommentPolicy(f.owner, { ...policy, enabled: true });
      }
      await expect(
        f.service.setCommentPolicy(f.peer, { scope: "ITEM", targetId: f.item.id, enabled: false }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        f.service.createComment(f.peer, { target, body: "Enabled again" }),
      ).resolves.toBeDefined();
    });
    it("rejects cross-target replies and private targets even for the Owner", async () => {
      const f = await fixture(),
        target = { type: "ITEM" as const, id: f.item.id },
        first = await f.service.createComment(f.peer, { target, body: "Original thread" }),
        other = await createItemService(db, f.owner.userId).createItem({
          collectionId: f.collection.id,
          title: "Another public item",
          visibility: "PUBLIC",
        });
      await expect(
        f.service.createComment(f.peer, {
          target: { type: "ITEM", id: other.id },
          parentId: first.id,
          body: "Forged thread",
        }),
      ).rejects.toMatchObject({ code: "COMMENT_PARENT_INVALID" });
      await createItemService(db, f.owner.userId).updateItem(f.item.id, { visibility: "PRIVATE" });
      await expect(
        f.service.createComment(f.owner, { target, body: "Not a public thread" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(f.service.listComments(f.owner, { target })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
    it("permits only original-author deletion or actual content-owner hiding and retains reported bodies privately", async () => {
      const f = await fixture(),
        target = { type: "ITEM" as const, id: f.item.id },
        comment = await f.service.createComment(f.peer, {
          target,
          body: "Retained for authorized report review",
        });
      await expect(f.service.deleteOwnComment(f.outsider, comment.id)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(
        f.service.moderateOwnContentComment(f.outsider, comment.id, { hidden: true }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await f.service.moderateOwnContentComment(f.owner, comment.id, { hidden: true });
      expect((await f.service.listComments(f.outsider, { target })).comments).toEqual([]);
      expect(
        (await db.communityComment.findUniqueOrThrow({ where: { id: comment.id } })).body,
      ).toBe("Retained for authorized report review");
      await f.service.moderateOwnContentComment(f.owner, comment.id, { hidden: false });
      await f.service.deleteOwnComment(f.peer, comment.id);
      expect(
        (await db.communityComment.findUniqueOrThrow({ where: { id: comment.id } })).deletedAt,
      ).not.toBeNull();
      expect((await f.service.listComments(f.outsider, { target })).comments).toEqual([]);
    });
    it("blocks direct comments and replies in either direction using actual persisted block state", async () => {
      const f = await fixture(),
        target = { type: "ITEM" as const, id: f.item.id },
        blocks = createBlockReportService(db);
      await blocks.blockUser(f.owner, f.peer.userId);
      await expect(
        f.service.createComment(f.peer, { target, body: "Blocked" }),
      ).rejects.toMatchObject({ code: "BLOCKED_INTERACTION" });
      await blocks.unblockUser(f.owner, f.peer.userId);
      await blocks.blockUser(f.peer, f.owner.userId);
      await expect(
        f.service.createComment(f.peer, { target, body: "Other direction" }),
      ).rejects.toMatchObject({ code: "BLOCKED_INTERACTION" });
    });

    it("observes an owner switch disabled after discovery but before actual participant locks", async () => {
      const f = await fixture();
      let signal!: () => void,
        release!: () => void,
        paused = false;
      const reached = new Promise<void>((r) => {
          signal = r;
        }),
        held = new Promise<void>((r) => {
          release = r;
        });
      const wrapped: Parameters<typeof createCommentService>[0] = {
        $transaction: (work, options) =>
          db.$transaction(
            (tx) =>
              work({
                $queryRaw: async <T>(
                  query: import("@sammlerraum/db/search-sql").Prisma.Sql,
                ): Promise<T> => {
                  if (
                    !paused &&
                    query.strings.join("?").includes('ORDER BY id COLLATE "C" FOR NO KEY UPDATE')
                  ) {
                    paused = true;
                    signal();
                    await held;
                  }
                  return tx.$queryRaw<T>(query);
                },
              }),
            options,
          ),
      };
      const pending = createCommentService(wrapped)
        .createComment(f.peer, {
          target: { type: "ITEM", id: f.item.id },
          body: "Late disabled write",
        })
        .then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
      try {
        await reached;
        await f.service.setCommentPolicy(f.owner, { scope: "GLOBAL", enabled: false });
        release();
        expect(await pending).toMatchObject({ error: { code: "COMMENTS_DISABLED" } });
        expect(await db.communityComment.count({ where: { authorId: f.peer.userId } })).toBe(0);
      } finally {
        release();
        await pending;
      }
    });
    it("hides descendants of an owner-hidden parent and clears unreported deleted bodies", async () => {
      const f = await fixture(),
        target = { type: "ITEM" as const, id: f.item.id },
        parent = await f.service.createComment(f.peer, { target, body: "Visible parent" }),
        child = await f.service.createComment(f.outsider, {
          target,
          parentId: parent.id,
          body: "Reply within this thread",
        });
      await f.service.moderateOwnContentComment(f.owner, parent.id, { hidden: true });
      expect((await f.service.listComments(f.owner, { target })).comments).toEqual([]);
      await expect(
        f.service.createComment(f.owner, {
          target,
          parentId: child.id,
          body: "No invisible parent",
        }),
      ).rejects.toMatchObject({ code: "COMMENT_PARENT_INVALID" });
      await f.service.moderateOwnContentComment(f.owner, parent.id, { hidden: false });
      await f.service.deleteOwnComment(f.peer, parent.id);
      expect((await db.communityComment.findUniqueOrThrow({ where: { id: parent.id } })).body).toBe(
        "",
      );
    });
  },
);
