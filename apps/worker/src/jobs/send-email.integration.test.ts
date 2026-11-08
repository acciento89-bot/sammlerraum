import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createNotificationService } from "@sammlerraum/domain/notifications/notification-service";
import { createNotificationEmailRepository } from "./notification-email-repository";
import { createSendEmailJob } from "./send-email";
import { EmailSendError } from "@sammlerraum/email/types";
let db: ReturnType<typeof createTestDatabaseClient>,
  isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual durable notification email delivery",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    async function fixture() {
      const id = randomUUID();
      await db.user.create({
        data: {
          id,
          name: "Own email delivery fixture",
          email: `${id}@example.invalid`,
          emailVerified: true,
        },
      });
      const saved = await createNotificationService(db).createNotificationOnce({
        recipientId: id,
        eventKey: randomUUID(),
        type: "SECURITY_ALERT",
        target: { type: "ACCOUNT", id },
      });
      if (!saved.id) throw Error("Owned notice missing");
      let now = new Date();
      const repo = createNotificationEmailRepository(db, { now: () => now });
      await repo.dispatchCandidates(32);
      const delivery = await db.notificationEmailDelivery.findUniqueOrThrow({
        where: { notificationId: saved.id },
      });
      return {
        id,
        repo,
        delivery,
        advance: () => {
          now = new Date(now.getTime() + 180000);
        },
      };
    }
    it("deduplicates concurrent workers and stores the provider acknowledgement before successful replay", async () => {
      const f = await fixture(),
        provider = {
          send: vi.fn(async () => ({ providerMessageId: "owned-accepted-provider-id" })),
        };
      const handle = createSendEmailJob(f.repo, provider, { appOrigin: "https://example.invalid" });
      await Promise.all([
        handle({ deliveryId: f.delivery.id }),
        handle({ deliveryId: f.delivery.id }),
      ]);
      await handle({ deliveryId: f.delivery.id });
      expect(provider.send).toHaveBeenCalledOnce();
      expect(
        await db.notificationEmailDelivery.findUniqueOrThrow({ where: { id: f.delivery.id } }),
      ).toMatchObject({
        status: "SENT",
        providerMessageId: "owned-accepted-provider-id",
        attempts: 1,
      });
    });
    it("retries acknowledgement writes without another SMTP submission", async () => {
      const f = await fixture(),
        provider = { send: vi.fn(async () => ({ providerMessageId: "owned-provider-id" })) };
      const markSent = vi.fn(f.repo.markSent).mockRejectedValueOnce(Error("Owned ack failure"));
      await createSendEmailJob({ ...f.repo, markSent }, provider, {
        appOrigin: "https://example.invalid",
      })({ deliveryId: f.delivery.id });
      expect(markSent).toHaveBeenCalledTimes(2);
      expect(provider.send).toHaveBeenCalledOnce();
      expect(
        (await db.notificationEmailDelivery.findUniqueOrThrow({ where: { id: f.delivery.id } }))
          .status,
      ).toBe("SENT");
    });
    it("reclaims a pre-send crash but never resends an expired ambiguous SENDING lease", async () => {
      const f = await fixture(),
        first = await f.repo.claim(f.delivery.id);
      expect(first.state).toBe("CLAIMED");
      f.advance();
      const second = await f.repo.claim(f.delivery.id);
      expect(second.state).toBe("CLAIMED");
      expect(second.token).not.toBe(first.token);
      expect((await f.repo.beginSend(f.delivery.id, second.token!)).state).toBe("SENDING");
      f.advance();
      expect(await f.repo.claim(f.delivery.id)).toMatchObject({ state: "UNKNOWN" });
      expect(
        (await db.notificationEmailDelivery.findUniqueOrThrow({ where: { id: f.delivery.id } }))
          .attempts,
      ).toBe(1);
    });
    it("retries only proven nonacceptance and persists an uncertain outcome without automatic replay", async () => {
      const f = await fixture(),
        provider = {
          send: vi
            .fn()
            .mockRejectedValueOnce(new EmailSendError("NOT_ACCEPTED"))
            .mockRejectedValueOnce(new EmailSendError("UNKNOWN")),
        };
      const handle = createSendEmailJob(f.repo, provider, { appOrigin: "https://example.invalid" });
      await handle({ deliveryId: f.delivery.id });
      expect(
        (await db.notificationEmailDelivery.findUniqueOrThrow({ where: { id: f.delivery.id } }))
          .status,
      ).toBe("PENDING");
      f.advance();
      await handle({ deliveryId: f.delivery.id });
      f.advance();
      await handle({ deliveryId: f.delivery.id });
      expect(provider.send).toHaveBeenCalledTimes(2);
      expect(
        (await db.notificationEmailDelivery.findUniqueOrThrow({ where: { id: f.delivery.id } }))
          .status,
      ).toBe("UNKNOWN");
    });
    it("rechecks an optional-channel opt-out immediately before send", async () => {
      const owner = randomUUID(),
        actor = randomUUID();
      for (const id of [owner, actor])
        await db.user.create({
          data: {
            id,
            name: "Own channel fixture",
            email: `${id}@example.invalid`,
            emailVerified: true,
          },
        });
      const notices = createNotificationService(db);
      await notices.updatePreferences(
        { userId: owner },
        { preferences: [{ category: "COMMUNITY", channel: "EMAIL", enabled: true }] },
      );
      const notice = await notices.createNotificationOnce({
        recipientId: owner,
        actorId: actor,
        eventKey: randomUUID(),
        type: "FOLLOW_RECEIVED",
        target: { type: "USER", id: actor },
      });
      if (!notice.id) throw Error("Owned notice missing");
      const repo = createNotificationEmailRepository(db);
      await repo.dispatchCandidates(32);
      const delivery = await db.notificationEmailDelivery.findUniqueOrThrow({
        where: { notificationId: notice.id },
      });
      const claim = await repo.claim(delivery.id);
      expect(claim.state).toBe("CLAIMED");
      await notices.updatePreferences(
        { userId: owner },
        { preferences: [{ category: "COMMUNITY", channel: "EMAIL", enabled: false }] },
      );
      expect((await repo.beginSend(delivery.id, claim.token!)).state).toBe("SUPPRESSED");
    });
    it("holds no database transaction during transport and persists cancellation without another send", async () => {
      const f = await fixture(),
        control = new AbortController();
      let ready!: () => void;
      const started = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const provider = {
        send: vi.fn(async (_message: unknown, options?: { signal?: AbortSignal }) => {
          ready();
          return new Promise<{ providerMessageId: string }>((_resolve, reject) => {
            options?.signal?.addEventListener(
              "abort",
              () => reject(new EmailSendError("UNKNOWN")),
              { once: true },
            );
          });
        }),
      };
      const handle = createSendEmailJob(f.repo, provider, { appOrigin: "https://example.invalid" });
      const running = handle({ deliveryId: f.delivery.id }, control.signal);
      await started;
      await createNotificationService(db).updatePreferences(
        { userId: f.id },
        { locale: "en", preferences: [] },
      );
      control.abort();
      await running;
      expect(
        (await db.notificationEmailDelivery.findUniqueOrThrow({ where: { id: f.delivery.id } }))
          .status,
      ).toBe("UNKNOWN");
      await handle({ deliveryId: f.delivery.id });
      expect(provider.send).toHaveBeenCalledOnce();
    });
    it("does not deliver to an erased or unverified recipient", async () => {
      const f = await fixture(),
        provider = { send: vi.fn(async () => ({ providerMessageId: "must-not-send" })) };
      await db.user.update({ where: { id: f.id }, data: { emailVerified: false } });
      await createSendEmailJob(f.repo, provider, { appOrigin: "https://example.invalid" })({
        deliveryId: f.delivery.id,
      });
      expect(provider.send).not.toHaveBeenCalled();
      expect(
        (await db.notificationEmailDelivery.findUniqueOrThrow({ where: { id: f.delivery.id } }))
          .status,
      ).toBe("SUPPRESSED");
      await db.user.delete({ where: { id: f.id } });
      expect(
        await db.notificationEmailDelivery.findUnique({ where: { id: f.delivery.id } }),
      ).toBeNull();
    });
  },
);
