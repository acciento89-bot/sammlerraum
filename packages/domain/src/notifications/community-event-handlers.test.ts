import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createItemService } from "../items/item-service";
import { createSocialService } from "../community/social-service";
import { createCommentService } from "../community/comment-service";
import { createNotificationService } from "./notification-service";
let db: ReturnType<typeof createTestDatabaseClient>;
let isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")("committed community events", () => {
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
        name: "Private login name",
        email: `${id}@example.invalid`,
        profile: {
          create: { handle: `e-${id}`, displayName: "Public collector" },
        },
      },
    });
    return { userId: id };
  }
  async function fixture() {
    const owner = await user(),
      actor = await user();
    const collection = await db.collection.create({
      data: { ownerId: owner.userId, name: "Event collection", visibility: "PUBLIC" },
    });
    const item = await createItemService(db, owner.userId).createItem({
      collectionId: collection.id,
      title: "Public event item",
      visibility: "PUBLIC",
      privateNotes: "Secret event note",
    });
    return {
      owner,
      actor,
      collection,
      item,
      social: createSocialService(db),
      notifications: createNotificationService(db),
    };
  }
  it("emits one favorite notification on successful creation, deduplicates retries and redacts later private targets", async () => {
    const f = await fixture(),
      target = { type: "ITEM", id: f.item.id };
    const [a, b] = await Promise.all([
      f.social.favoriteTarget(f.actor, target),
      f.social.favoriteTarget(f.actor, target),
    ]);
    expect(a.favoriteId).toBe(b.favoriteId);
    const listing = await f.notifications.listNotifications(f.owner, {});
    expect(listing.notifications).toHaveLength(1);
    expect(listing.notifications[0]).toMatchObject({
      type: "FAVORITE_RECEIVED",
      safeTargetLabel: "Public event item",
      publicPath: expect.stringMatching(
        new RegExp(`/collection-${f.collection.id}/items/${f.item.id}$`),
      ),
    });
    await createItemService(db, f.owner.userId).updateItem(f.item.id, { visibility: "PRIVATE" });
    const hidden = await f.notifications.listNotifications(f.owner, {});
    expect(hidden.notifications[0]).toMatchObject({ safeTarget: null, safeTargetLabel: null });
    expect(JSON.stringify(hidden)).not.toMatch(
      /Secret event note|Private login name|@example.invalid/,
    );
  });
  it("notifies follows once and treats a real unfollow/refollow as a new occurrence", async () => {
    const f = await fixture();
    await f.social.followUser(f.actor, f.owner.userId);
    await f.social.followUser(f.actor, f.owner.userId);
    expect((await f.notifications.listNotifications(f.owner, {})).notifications).toHaveLength(1);
    await f.social.unfollowUser(f.actor, f.owner.userId);
    await f.social.followUser(f.actor, f.owner.userId);
    expect((await f.notifications.listNotifications(f.owner, {})).notifications).toHaveLength(2);
  });
  it("notifies the owner about a comment and the distinct parent author about a reply, without copying bodies", async () => {
    const f = await fixture(),
      third = await user(),
      comments = createCommentService(db);
    const target = { type: "ITEM", id: f.item.id };
    const parent = await comments.createComment(f.actor, {
      target,
      body: "Private-to-thread body",
    });
    await comments.createComment(third, {
      target,
      parentId: parent.id,
      body: "Second thread body",
    });
    expect(
      (await f.notifications.listNotifications(f.owner, {})).notifications.map((n) => n.type),
    ).toEqual(["COMMENT_RECEIVED", "COMMENT_RECEIVED"]);
    expect(
      (await f.notifications.listNotifications(f.actor, {})).notifications.map((n) => n.type),
    ).toEqual(["REPLY_RECEIVED"]);
    const stored = await db.notification.findMany();
    expect(JSON.stringify(stored)).not.toMatch(/Private-to-thread body|Second thread body/);
  });
  it("suppresses self notices and rolls back both the interaction and receipt on transaction failure", async () => {
    const f = await fixture();
    await f.social.favoriteTarget(f.owner, { type: "ITEM", id: f.item.id });
    expect((await f.notifications.listNotifications(f.owner, {})).notifications).toEqual([]);
    await expect(
      db.$transaction(async (tx) => {
        await createSocialService({ $transaction: async (work) => work(tx) }).followUser(
          f.actor,
          f.owner.userId,
        );
        throw new Error("Synthetic rollback");
      }),
    ).rejects.toThrow("Synthetic rollback");
    expect(await db.userFollow.count({ where: { followerId: f.actor.userId } })).toBe(0);
    expect((await f.notifications.listNotifications(f.owner, {})).notifications).toEqual([]);
  });
});
