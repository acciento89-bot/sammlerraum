import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createItemService } from "../items/item-service";
import { createBlockReportService } from "../moderation/block-report-service";
import { createNotificationService } from "./notification-service";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual channel-independent notifications and preferences",
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
          name: "Own notification fixture",
          email: `${id}@example.invalid`,
          emailVerified: true,
          profile: {
            create: {
              handle: `u_${id.replaceAll("-", "").slice(0, 20)}`,
              displayName: "Public notification name",
            },
          },
        },
      });
      return { userId: id };
    }
    async function fixture() {
      const owner = await user(),
        actor = await user();
      const collection = await db.collection.create({
        data: { ownerId: owner.userId, name: "Public notice collection", visibility: "PUBLIC" },
      });
      const item = await createItemService(db, owner.userId).createItem({
        collectionId: collection.id,
        title: "Public notice title",
        visibility: "PUBLIC",
        privateNotes: "never-notification-private-notes",
      });
      return { owner, actor, collection, item, service: createNotificationService(db) };
    }
    it("creates exactly one notification for concurrent duplicate events and rejects reuse with different content", async () => {
      const f = await fixture(),
        event = {
          recipientId: f.owner.userId,
          actorId: f.actor.userId,
          eventKey: "favorite:" + randomUUID(),
          type: "FAVORITE_RECEIVED",
          target: { type: "ITEM", id: f.item.id },
        };
      const [a, b] = await Promise.all([
        f.service.createNotificationOnce(event),
        f.service.createNotificationOnce(event),
      ]);
      expect(a.id).toBe(b.id);
      expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
      expect(
        await db.notification.count({
          where: { recipientId: f.owner.userId, eventKey: event.eventKey },
        }),
      ).toBe(1);
      await expect(
        f.service.createNotificationOnce({ ...event, type: "COMMENT_RECEIVED" }),
      ).rejects.toMatchObject({ code: "NOTIFICATION_CONFLICT" });
      await expect(
        f.service.createNotificationOnce({
          ...event,
          eventKey: "other",
          body: "Never store arbitrary private content",
        }),
      ).rejects.toMatchObject({ code: "NOTIFICATION_INVALID" });
    });
    it("marks only the actual recipient's records and keeps stable read timestamps on retries", async () => {
      const f = await fixture(),
        own = await f.service.createNotificationOnce({
          recipientId: f.owner.userId,
          eventKey: randomUUID(),
          type: "SECURITY_ALERT",
          target: { type: "ACCOUNT", id: f.owner.userId },
        });
      if (!own.id) throw Error("Owned security fixture suppressed");
      await f.service.createNotificationOnce({
        recipientId: f.actor.userId,
        eventKey: randomUUID(),
        type: "SECURITY_ALERT",
        target: { type: "ACCOUNT", id: f.actor.userId },
      });
      await expect(f.service.markRead(f.actor, own.id)).rejects.toMatchObject({
        code: "NOTIFICATION_NOT_FOUND",
      });
      expect(await f.service.markRead(f.owner, own.id)).toEqual(
        await f.service.markRead(f.owner, own.id),
      );
      await f.service.markAllRead(f.owner);
      expect(
        await db.notification.count({ where: { recipientId: f.actor.userId, readAt: null } }),
      ).toBe(1);
    });
    it("keeps required security email enabled and applies category/channel opt-outs without replaying old events", async () => {
      const f = await fixture();
      const prefs = await f.service.updatePreferences(f.owner, {
        locale: "en",
        preferences: [
          { category: "SECURITY", channel: "EMAIL", enabled: false },
          { category: "COMMUNITY", channel: "IN_APP", enabled: false },
          { category: "COMMUNITY", channel: "EMAIL", enabled: false },
        ],
      });
      expect(prefs.locale).toBe("en");
      expect(prefs.preferences).toContainEqual({
        category: "SECURITY",
        channel: "EMAIL",
        enabled: true,
      });
      const event = {
        recipientId: f.owner.userId,
        actorId: f.actor.userId,
        eventKey: randomUUID(),
        type: "FAVORITE_RECEIVED",
        target: { type: "ITEM", id: f.item.id },
      };
      const saved = await f.service.createNotificationOnce(event);
      if (!saved.id) throw Error("Owned event fixture suppressed");
      expect(await db.notification.findUniqueOrThrow({ where: { id: saved.id } })).toMatchObject({
        inAppEnabled: false,
        emailWanted: false,
        locale: "en",
      });
      await f.service.updatePreferences(f.owner, {
        preferences: [{ category: "COMMUNITY", channel: "IN_APP", enabled: true }],
      });
      expect((await f.service.createNotificationOnce(event)).created).toBe(false);
      expect((await f.service.listNotifications(f.owner, {})).notifications).toEqual([]);
      const security = await f.service.createNotificationOnce({
        recipientId: f.owner.userId,
        eventKey: randomUUID(),
        type: "SECURITY_ALERT",
        target: { type: "ACCOUNT", id: f.owner.userId },
      });
      if (!security.id) throw Error("Owned security fixture suppressed");
      expect(
        (await db.notification.findUniqueOrThrow({ where: { id: security.id } })).emailWanted,
      ).toBe(true);
    });
    it("resolves only currently public target labels and never returns stored private notes or login email", async () => {
      const f = await fixture();
      await f.service.createNotificationOnce({
        recipientId: f.owner.userId,
        actorId: f.actor.userId,
        eventKey: randomUUID(),
        type: "COMMENT_RECEIVED",
        target: { type: "ITEM", id: f.item.id },
      });
      expect((await f.service.listNotifications(f.owner, {})).notifications[0]).toMatchObject({
        safeTargetLabel: "Public notice title",
        safeTarget: { type: "ITEM", id: f.item.id },
      });
      await createItemService(db, f.owner.userId).updateItem(f.item.id, { visibility: "PRIVATE" });
      const listing = await f.service.listNotifications(f.owner, {});
      expect(listing.notifications[0]).toMatchObject({ safeTargetLabel: null, safeTarget: null });
      expect(JSON.stringify(listing)).not.toMatch(
        /never-notification-private-notes|Public notice title|@example.invalid/,
      );
      expect((await f.service.listNotifications(f.actor, {})).notifications).toEqual([]);
    });
    it("suppresses self and blocked community notifications and hides stale public references after a block", async () => {
      const f = await fixture(),
        event = {
          recipientId: f.owner.userId,
          actorId: f.actor.userId,
          eventKey: randomUUID(),
          type: "FOLLOW_RECEIVED",
          target: { type: "USER", id: f.actor.userId },
        };
      await f.service.createNotificationOnce(event);
      await createBlockReportService(db).blockUser(f.owner, f.actor.userId);
      expect(
        await f.service.createNotificationOnce({ ...event, eventKey: randomUUID() }),
      ).toMatchObject({ id: null, suppressed: true });
      expect(
        await f.service.createNotificationOnce({
          ...event,
          recipientId: f.actor.userId,
          eventKey: randomUUID(),
        }),
      ).toMatchObject({ id: null, suppressed: true });
      const listing = await f.service.listNotifications(f.owner, {});
      expect(listing.notifications[0]).toMatchObject({ safeTarget: null, safeTargetLabel: null });
    });
    it("cascades recipient notifications/preferences on actual account erasure", async () => {
      const f = await fixture();
      await f.service.updatePreferences(f.actor, {
        locale: "en",
        preferences: [{ category: "ACCOUNT", channel: "EMAIL", enabled: true }],
      });
      await f.service.createNotificationOnce({
        recipientId: f.actor.userId,
        eventKey: randomUUID(),
        type: "SECURITY_ALERT",
        target: { type: "ACCOUNT", id: f.actor.userId },
      });
      await db.user.delete({ where: { id: f.actor.userId } });
      expect(await db.notification.count({ where: { recipientId: f.actor.userId } })).toBe(0);
      expect(await db.notificationPreference.count({ where: { userId: f.actor.userId } })).toBe(0);
    });
  },
);
