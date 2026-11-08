import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createShareService } from "./share-service";
import { createShareReadAccessPort } from "./share-read-access";

describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "canonical reusable share read access",
  () => {
    let db: ReturnType<typeof createTestDatabaseClient>;
    let isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    async function fixture(pin?: string) {
      const owner = randomUUID(),
        viewer = randomUUID(),
        outsider = randomUUID();
      for (const id of [owner, viewer, outsider])
        await db.user.create({
          data: {
            id,
            name: "Scoped read fixture",
            email: `${id}@example.invalid`,
            emailVerified: true,
          },
        });
      const collection = await db.collection.create({
        data: { ownerId: owner, name: "Selected scope" },
      });
      const item = await db.collectibleItem.create({
        data: { ownerId: owner, collectionId: collection.id, title: "Selected item" },
      });
      const service = createShareService(db);
      const created = await service.createShare(
        { userId: owner },
        {
          target: { kind: "ITEM", id: item.id },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
          ...(pin ? { pin } : {}),
        },
      );
      return {
        owner,
        viewer,
        outsider,
        collection,
        item,
        service,
        created,
        port: createShareReadAccessPort(db),
      };
    }
    it("reuses actual token authorization and rejects unknown capabilities", async () => {
      const f = await fixture();
      const access = { token: f.created.token! };
      expect(await f.port.unlock(access, null)).toBeNull();
      const row = await f.port.within((tx) => f.port.authorized(tx, access, null));
      expect(row).toMatchObject({
        id: f.created.share.id,
        targetId: f.item.id,
        creatorUserId: f.owner,
      });
      await expect(
        f.port.within((tx) => f.port.authorized(tx, { token: "x".repeat(43) }, null)),
      ).rejects.toMatchObject({ code: "SHARE_NOT_FOUND" });
    });
    it("commits failed PIN attempts and accepts the existing source session", async () => {
      const f = await fixture("825193");
      await expect(
        f.port.unlock({ token: f.created.token!, pin: "000000" }, null),
      ).rejects.toMatchObject({ code: "SHARE_PIN_INVALID" });
      const budget = await db.sharePinBudget.findUnique({ where: { shareId: f.created.share.id } });
      expect(budget?.attempts).toBe(1);
      const resolved = await f.service.resolveShare(null, {
        token: f.created.token!,
        pin: "825193",
      });
      expect(resolved.accessToken).toBeTruthy();
      const access = { token: f.created.token!, accessToken: resolved.accessToken! };
      await expect(f.port.unlock(access, null)).resolves.toBeNull();
      await f.port.within(async (tx) =>
        f.port.checkPinAccess(tx, await f.port.authorized(tx, access, null), access, null),
      );
      expect(
        (await db.sharePinBudget.findUnique({ where: { shareId: f.created.share.id } }))?.attempts,
      ).toBe(2);
    });
    it("uses actual verified named recipients rather than supplied owner identities", async () => {
      const f = await fixture();
      const named = await f.service.createShare(
        { userId: f.owner },
        {
          target: { kind: "ITEM", id: f.item.id },
          recipient: { kind: "USER", userId: f.viewer },
          expectedRevision: 0,
        },
      );
      await expect(
        f.port.within((tx) => f.port.authorized(tx, { shareId: named.share.id }, f.viewer)),
      ).resolves.toMatchObject({ id: named.share.id });
      await expect(
        f.port.within((tx) => f.port.authorized(tx, { shareId: named.share.id }, f.outsider)),
      ).rejects.toMatchObject({ code: "SHARE_NOT_FOUND" });
      await db.user.update({ where: { id: f.viewer }, data: { emailVerified: false } });
      await expect(
        f.port.within((tx) => f.port.authorized(tx, { shareId: named.share.id }, f.viewer)),
      ).rejects.toMatchObject({ code: "SHARE_NOT_FOUND" });
    });
  },
);
