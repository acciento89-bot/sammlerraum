import { errorCode } from "../api/read-dependency-errors";
import type { MembershipDatabase } from "../collaboration/transfer-transaction";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@sammlerraum/db/search-sql";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createShareService } from "../sharing/share-service";
import { createMembershipService } from "../collaboration/membership-service";
import { withScopedReadContext, scopedReadState } from "./scoped-read-context";

describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "callback-scoped bulk read authority",
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
    async function fixture() {
      const owner = randomUUID(),
        viewer = randomUUID();
      for (const id of [owner, viewer])
        await db.user.create({
          data: { id, name: "Bulk fixture", email: `${id}@example.invalid`, emailVerified: true },
        });
      const collection = await db.collection.create({
        data: { ownerId: owner, name: "Selected private collection" },
      });
      const other = await db.collection.create({
        data: { ownerId: owner, name: "Unshared collection" },
      });
      const item = await db.collectibleItem.create({
        data: { ownerId: owner, collectionId: collection.id, title: "Selected" },
      });
      await db.collectibleItem.create({
        data: { ownerId: owner, collectionId: other.id, title: "Hidden" },
      });
      const service = createShareService(db);
      const share = await service.createShare(
        { userId: owner },
        {
          target: { kind: "ITEM", id: item.id },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
        },
      );
      return { owner, viewer, collection, other, item, service, share };
    }
    async function ids(context: Parameters<typeof scopedReadState>[0]) {
      const s = scopedReadState(context);
      return s.tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`${s.prefix} SELECT i.id FROM "CollectibleItem" i WHERE ${s.predicate} ORDER BY i.id`,
      );
    }
    it("limits the complete bulk relation to an actual item grant and hides credentials", async () => {
      const f = await fixture();
      await withScopedReadContext(
        db,
        null,
        { kind: "SHARE", access: { token: f.share.token! } },
        async (context) => {
          expect(await ids(context)).toEqual([{ id: f.item.id }]);
          expect(JSON.stringify(context)).not.toMatch(/token|creator|owner|permissions|pinHash/i);
          expect(scopedReadState(context).mode).toBe("SHARE");
        },
      );
    });
    it("rejects a valid capability supplied for a different stored share reference", async () => {
      const f = await fixture();
      let called = false;
      await expect(
        withScopedReadContext(
          db,
          null,
          { kind: "SHARE", expectedShareId: randomUUID(), access: { token: f.share.token! } },
          async () => {
            called = true;
          },
        ),
      ).rejects.toMatchObject({ code: "SHARE_NOT_FOUND" });
      expect(called).toBe(false);
    });
    it("loads actual membership and excludes every other owner collection", async () => {
      const f = await fixture();
      const membership = createMembershipService(db);
      await membership.addMember(
        { userId: f.owner },
        { collectionId: f.collection.id, userId: f.viewer, role: "VIEWER", expectedRevision: 0 },
      );
      const target = { kind: "MEMBER_COLLECTION" as const, collectionId: f.collection.id };
      await withScopedReadContext(db, { userId: f.viewer }, target, async (context) => {
        expect(await ids(context)).toEqual([{ id: f.item.id }]);
        expect(scopedReadState(context).mode).toBe("MEMBER_COLLECTION");
      });
      await membership.removeMember(
        { userId: f.owner },
        { collectionId: f.collection.id, userId: f.viewer, expectedRevision: 1 },
      );
      await expect(
        withScopedReadContext(db, { userId: f.viewer }, target, ids),
      ).rejects.toMatchObject({ code: "MEMBERSHIP_NOT_FOUND" });
    });
    it("expires callback handles and rejects forged context objects", async () => {
      const f = await fixture();
      const context = await withScopedReadContext(
        db,
        null,
        { kind: "SHARE", access: { token: f.share.token! } },
        async (value) => value,
      );
      expect(() => scopedReadState(context)).toThrow();
      expect(() => scopedReadState({} as typeof context)).toThrow();
    });
    it("rechecks wall-clock expiry after asynchronous consumption", async () => {
      const f = await fixture();
      // Immutable grant identity cannot be edited. Insert a bounded native clock fixture
      // through the real guarded table, as the canonical sharing expiry test does.
      const token = randomBytes(32).toString("base64url"),
        id = randomUUID();
      await db.$executeRaw`INSERT INTO "CollectionShare" (id,"collectionId","creatorUserId","targetKind","targetId","tokenHash",permissions,"createdAt","expiresAt") VALUES (${id}::uuid,${f.collection.id}::uuid,${f.owner},'ITEM',${f.item.id}::uuid,${createHash("sha256").update(token).digest("hex")},'{"readOnly":true}'::jsonb,timezone('UTC',clock_timestamp()),timezone('UTC',clock_timestamp())+interval '250 milliseconds')`;
      await expect(
        withScopedReadContext(db, null, { kind: "SHARE", access: { token } }, async (context) => {
          expect(await ids(context)).toHaveLength(1);
          await new Promise((resolve) => setTimeout(resolve, 300));
        }),
      ).rejects.toMatchObject({ code: "SHARE_EXPIRED" });
    });
    it("rejects deleted item targets before an empty query can hide loss of access", async () => {
      const f = await fixture();
      await db.collectibleItem.update({
        where: { id: f.item.id },
        data: { deletedAt: new Date() },
      });
      let called = false;
      await expect(
        withScopedReadContext(
          db,
          null,
          { kind: "SHARE", access: { token: f.share.token! } },
          async () => {
            called = true;
          },
        ),
      ).rejects.toMatchObject({ code: "SHARE_REVOKED" });
      expect(called).toBe(false);
    });
    it("uses the actual recursive node boundary without widening to its parent collection", async () => {
      const f = await fixture();
      const node = await db.collectionNode.create({
        data: { collectionId: f.collection.id, name: "Shared branch" },
      });
      const child = await db.collectionNode.create({
        data: { collectionId: f.collection.id, parentId: node.id, name: "Child" },
      });
      await db.collectibleItem.update({ where: { id: f.item.id }, data: { nodeId: child.id } });
      await db.collectibleItem.create({
        data: { ownerId: f.owner, collectionId: f.collection.id, title: "Unshared sibling" },
      });
      const grant = await f.service.createShare(
        { userId: f.owner },
        {
          target: { kind: "NODE", id: node.id },
          recipient: { kind: "TOKEN" },
          expectedRevision: 0,
        },
      );
      await withScopedReadContext(
        db,
        null,
        { kind: "SHARE", access: { token: grant.token! } },
        async (context) => {
          expect(await ids(context)).toEqual([{ id: f.item.id }]);
        },
      );
    });
    it("holds canonical parent locks through consumption and denies a subsequently removed member", async () => {
      const f = await fixture(),
        service = createMembershipService(db);
      await service.addMember(
        { userId: f.owner },
        { collectionId: f.collection.id, userId: f.viewer, role: "VIEWER", expectedRevision: 0 },
      );
      const target = { kind: "MEMBER_COLLECTION" as const, collectionId: f.collection.id };
      let removal: Promise<unknown> | undefined,
        settled = false;
      try {
        await withScopedReadContext(db, { userId: f.viewer }, target, async (context) => {
          removal = service
            .removeMember(
              { userId: f.owner },
              { collectionId: f.collection.id, userId: f.viewer, expectedRevision: 1 },
            )
            .finally(() => {
              settled = true;
            });
          await new Promise((resolve) => setTimeout(resolve, 50));
          expect(settled).toBe(false);
          expect(await ids(context)).toEqual([{ id: f.item.id }]);
        });
      } finally {
        await removal;
      }
      await expect(
        withScopedReadContext(db, { userId: f.viewer }, target, ids),
      ).rejects.toMatchObject({ code: "MEMBERSHIP_NOT_FOUND" });
    });
    it("does not retarget after caller mutation or retain a usable transaction handle", async () => {
      const f = await fixture();
      const target = { kind: "SHARE" as const, access: { token: f.share.token! } };
      let retained: ReturnType<typeof scopedReadState> | undefined;
      await withScopedReadContext(db, null, target, async (context) => {
        retained = scopedReadState(context);
        target.access.token = "x".repeat(43);
        expect(await ids(context)).toEqual([{ id: f.item.id }]);
      });
      await expect(retained!.tx.$queryRaw(Prisma.sql`SELECT 1`)).rejects.toMatchObject({
        code: "SHARE_INTEGRITY",
      });
    });
    it.each(["MEMBER", "SHARE"])(
      "retries a genuine PostgreSQL serialization conflict with fresh %s access",
      async (kind) => {
        const f = await fixture(),
          members = createMembershipService(db);
        await members.addMember(
          { userId: f.owner },
          { collectionId: f.collection.id, userId: f.viewer, role: "VIEWER", expectedRevision: 0 },
        );
        const grant =
          kind === "SHARE"
            ? await f.service.createShare(
                { userId: f.owner },
                {
                  target: { kind: "ITEM", id: f.item.id },
                  recipient: { kind: "TOKEN" },
                  expectedRevision: 1,
                  pin: "813529",
                },
              )
            : null;
        let changed = false;
        const codes: string[] = [];
        const measured: MembershipDatabase = {
          $transaction: async (work, options) => {
            try {
              return await db.$transaction(
                (tx) =>
                  work({
                    $queryRaw: async <T>(sql: Prisma.Sql) => {
                      if (
                        !changed &&
                        options.isolationLevel === "RepeatableRead" &&
                        sql.text.includes('FROM "Collection" WHERE id=') &&
                        sql.text.includes("FOR SHARE")
                      ) {
                        changed = true;
                        // The read snapshot exists, but it has not yet locked its parent.
                        // This independent real mutation commits before the locking read.
                        if (grant)
                          await f.service.revokeShare(
                            { userId: f.owner },
                            { shareId: grant.share.id, expectedRevision: 0 },
                          );
                        else
                          await members.removeMember(
                            { userId: f.owner },
                            {
                              collectionId: f.collection.id,
                              userId: f.viewer,
                              expectedRevision: 1,
                            },
                          );
                      }
                      return tx.$queryRaw<T>(sql);
                    },
                  }),
                options,
              );
            } catch (error) {
              const code = errorCode(error);
              if (code) codes.push(code);
              throw error;
            }
          },
        };
        const target = grant
          ? { kind: "SHARE", access: { token: grant.token, pin: "813529" } }
          : { kind: "MEMBER_COLLECTION", collectionId: f.collection.id };
        await expect(
          withScopedReadContext(measured, grant ? null : { userId: f.viewer }, target, ids),
        ).rejects.toMatchObject({ code: grant ? "SHARE_REVOKED" : "MEMBERSHIP_NOT_FOUND" });
        expect(changed).toBe(true);
        expect(codes).toContain("40001");
        if (grant)
          expect(
            (await db.sharePinBudget.findUnique({ where: { shareId: grant.share.id } }))?.attempts,
          ).toBe(1);
      },
    );
  },
);
