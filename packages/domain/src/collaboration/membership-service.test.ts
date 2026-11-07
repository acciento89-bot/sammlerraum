import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LocalPersistentStorage } from "@sammlerraum/storage";
import { createRequire } from "node:module";
import sharp from "sharp";
import { createMediaService } from "../media/media-service";
import { createMediaReadService } from "../media/media-read";
import { createResourceQuery } from "../api/resource-query";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { authorize } from "../authz/policy";
import { createTrustedActorFacts } from "../authz/types";
import { MemberMutationSchema } from "@sammlerraum/contracts/collaboration";
import { createTagService, type TagDatabase } from "../items/tag-service";
import { createIdentifierService } from "../items/identifier-service";
import { createValuationService } from "../valuations/valuation-service";
import { createInsuranceService } from "../insurance/insurance-service";
import { createGradingService } from "../grading/grading-service";
import { createLocationService } from "../locations/location-service";
import { createImportService } from "../imports/import-service";
import { createPersonalMoneyService } from "../money/personal-money-service";
import { createItemService } from "../items/item-service";
import { createCustomFieldService } from "../custom-fields/custom-field-service";
import { createImportWorkflowService } from "../imports/import-workflow-service";
import { createMediaAssetLocker } from "@sammlerraum/db/media-lock";
import { createImportSourceCleanup } from "../../../../apps/worker/src/jobs/import-source-cleanup";
import { createMembershipService } from "./membership-service";
import type { MembershipDatabase } from "./transfer-transaction";
import type { Prisma } from "@sammlerraum/db/search-sql";
let isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>,
  db: ReturnType<typeof createTestDatabaseClient>;
async function fixture() {
  const owner = randomUUID(),
    second = randomUUID(),
    outsider = randomUUID();
  for (const id of [owner, second, outsider])
    await db.$executeRaw`INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (${id},'Membership test',${`${id}@example.invalid`},true,now(),now())`;
  const collection = await db.collection.create({
    data: { ownerId: owner, name: "Private shared collection" },
  });
  return {
    owner,
    second,
    outsider,
    collection: collection.id,
    service: createMembershipService(db),
    actor: { userId: owner },
  };
}
describe("strict membership inputs", () => {
  it("rejects malformed Unicode user IDs instead of normalizing into another identity", () => {
    expect(
      MemberMutationSchema.safeParse({
        collectionId: randomUUID(),
        userId: "user\ud800",
        role: "EDITOR",
        expectedRevision: 0,
      }).success,
    ).toBe(false);
  });
});
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual collection membership and atomic ownership",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    it("transfers ownership atomically and leaves exactly one derived owner", async () => {
      const f = await fixture();
      await f.service.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.second,
        role: "EDITOR",
        expectedRevision: 0,
      });
      const result = await f.service.transferOwnership(f.actor, {
        collectionId: f.collection,
        newOwnerId: f.second,
        expectedRevision: 1,
        confirmPrivateTransfer: true,
      });
      expect(result.ownerId).toBe(f.second);
      expect(result.revision).toBe(2);
      expect(result.members.filter((member) => member.role === "OWNER")).toEqual([
        { userId: f.second, role: "OWNER" },
      ]);
      expect(result.members).toContainEqual({ userId: f.owner, role: "ADMIN" });
      expect((await db.collection.findUniqueOrThrow({ where: { id: f.collection } })).ownerId).toBe(
        f.second,
      );
    });
    it("never accepts a second OWNER through membership creation or role editing", async () => {
      const f = await fixture();
      await expect(
        f.service.addMember(f.actor, {
          collectionId: f.collection,
          userId: f.second,
          role: "OWNER",
          expectedRevision: 0,
        }),
      ).rejects.toMatchObject({ code: "MEMBERSHIP_INVALID" });
      await f.service.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.second,
        role: "EDITOR",
        expectedRevision: 0,
      });
      await expect(
        f.service.changeRole(f.actor, {
          collectionId: f.collection,
          userId: f.second,
          role: "OWNER",
          expectedRevision: 1,
        }),
      ).rejects.toMatchObject({ code: "MEMBERSHIP_INVALID" });
      await expect(
        f.service.removeMember(f.actor, {
          collectionId: f.collection,
          userId: f.owner,
          expectedRevision: 1,
        }),
      ).rejects.toMatchObject({ code: "MEMBERSHIP_OWNER_REQUIRED" });
      expect(
        (await f.service.getMembershipState(f.actor, f.collection)).members.filter(
          (member) => member.role === "OWNER",
        ),
      ).toHaveLength(1);
    });
    it("checks real membership and limits an Admin below Owner authority", async () => {
      const f = await fixture();
      await f.service.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.second,
        role: "ADMIN",
        expectedRevision: 0,
      });
      await expect(
        f.service.transferOwnership(
          { userId: f.second },
          {
            collectionId: f.collection,
            newOwnerId: f.outsider,
            expectedRevision: 1,
            confirmPrivateTransfer: true,
          },
        ),
      ).rejects.toMatchObject({ code: "MEMBERSHIP_FORBIDDEN" });
      await expect(
        f.service.addMember(
          { userId: f.second },
          { collectionId: f.collection, userId: f.outsider, role: "ADMIN", expectedRevision: 1 },
        ),
      ).rejects.toMatchObject({ code: "MEMBERSHIP_FORBIDDEN" });
      await expect(
        f.service.getMembershipState({ userId: f.outsider }, f.collection),
      ).rejects.toMatchObject({ code: "MEMBERSHIP_NOT_FOUND" });
      await f.service.addMember(
        { userId: f.second },
        { collectionId: f.collection, userId: f.outsider, role: "VIEWER", expectedRevision: 1 },
      );
      await expect(
        f.service.changeRole(
          { userId: f.outsider },
          { collectionId: f.collection, userId: f.second, role: "EDITOR", expectedRevision: 2 },
        ),
      ).rejects.toMatchObject({ code: "MEMBERSHIP_FORBIDDEN" });
    });
    it("rejects stale role decisions and a transfer without explicit private-data confirmation", async () => {
      const f = await fixture();
      await f.service.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.second,
        role: "EDITOR",
        expectedRevision: 0,
      });
      await expect(
        f.service.changeRole(f.actor, {
          collectionId: f.collection,
          userId: f.second,
          role: "VIEWER",
          expectedRevision: 0,
        }),
      ).rejects.toMatchObject({ code: "MEMBERSHIP_CONFLICT" });
      await expect(
        f.service.transferOwnership(f.actor, {
          collectionId: f.collection,
          newOwnerId: f.second,
          expectedRevision: 1,
          confirmPrivateTransfer: false,
        }),
      ).rejects.toMatchObject({ code: "MEMBERSHIP_INVALID" });
      expect((await f.service.getMembershipState(f.actor, f.collection)).ownerId).toBe(f.owner);
    });
    it("allows member self-removal but never removes the sole owner", async () => {
      const f = await fixture();
      await f.service.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.second,
        role: "VIEWER",
        expectedRevision: 0,
      });
      await f.service.removeMember(
        { userId: f.second },
        { collectionId: f.collection, userId: f.second, expectedRevision: 1 },
      );
      await expect(
        f.service.getMembershipState({ userId: f.second }, f.collection),
      ).rejects.toMatchObject({ code: "MEMBERSHIP_NOT_FOUND" });
      expect((await f.service.getMembershipState(f.actor, f.collection)).members).toEqual([
        { userId: f.owner, role: "OWNER" },
      ]);
    });
    it("serializes simultaneous transfers so only one current owner decision wins", async () => {
      const f = await fixture();
      await f.service.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.second,
        role: "EDITOR",
        expectedRevision: 0,
      });
      await f.service.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.outsider,
        role: "EDITOR",
        expectedRevision: 1,
      });
      const outcomes = await Promise.allSettled(
        [f.second, f.outsider].map((newOwnerId) =>
          f.service.transferOwnership(f.actor, {
            collectionId: f.collection,
            newOwnerId,
            expectedRevision: 2,
            confirmPrivateTransfer: true,
          }),
        ),
      );
      expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const stored = await db.collection.findUniqueOrThrow({ where: { id: f.collection } });
      expect([f.second, f.outsider]).toContain(stored.ownerId);
      const state = await f.service.getMembershipState({ userId: stored.ownerId }, f.collection);
      expect(state.members.filter((member) => member.role === "OWNER")).toHaveLength(1);
    });
    it("transfers a populated collection without changing item IDs, quantities or raw price digits", async () => {
      const f = await fixture();
      const item = await db.collectibleItem.create({
        data: {
          ownerId: f.owner,
          collectionId: f.collection,
          title: "Transferred record",
          quantity: 3,
          purchaseAmountMinor: 1234n,
          purchaseCurrency: "EUR",
        },
      });
      await f.service.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.second,
        role: "EDITOR",
        expectedRevision: 0,
      });
      await f.service.transferOwnership(f.actor, {
        collectionId: f.collection,
        newOwnerId: f.second,
        expectedRevision: 1,
        confirmPrivateTransfer: true,
      });
      const after = await db.collectibleItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(after).toMatchObject({
        ownerId: f.second,
        title: "Transferred record",
        quantity: 3,
        purchaseAmountMinor: 1234n,
        purchaseCurrency: "EUR",
      });
    });
    it("preserves private collection and item insurance through an explicitly confirmed transfer", async () => {
      const f = await fixture(),
        item = await db.collectibleItem.create({
          data: { ownerId: f.owner, collectionId: f.collection, title: "Insured transferred item" },
        }),
        insurance = createInsuranceService(db);
      const beforeCollection = await insurance.setCollectionInsurance(f.actor, f.collection, {
        expectedRevision: 0,
        insurance: {
          amountMinor: "123456",
          currency: "EUR",
          valuationDate: "2026-01-01",
          policyReference: "Private old policy",
          notes: "Private insurance context",
        },
      });
      const beforeItem = await insurance.setItemInsurance(f.actor, item.id, {
        expectedRevision: 0,
        insurance: { amountMinor: "2345", currency: "EUR", valuationDate: "2026-01-01" },
      });
      await f.service.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.second,
        role: "EDITOR",
        expectedRevision: 0,
      });
      await f.service.transferOwnership(f.actor, {
        collectionId: f.collection,
        newOwnerId: f.second,
        expectedRevision: 1,
        confirmPrivateTransfer: true,
      });
      const afterCollection = await insurance.getInsuranceData(
        { userId: f.second },
        { kind: "COLLECTION", collectionId: f.collection },
      );
      const afterItem = await insurance.getInsuranceData(
        { userId: f.second },
        { kind: "ITEM", itemId: item.id },
      );
      expect(afterCollection.insurance).toEqual(beforeCollection.insurance);
      expect(afterItem.insurance).toEqual(beforeItem.insurance);
      expect(afterCollection.revision).toBe(beforeCollection.revision + 1);
      expect(afterItem.revision).toBe(beforeItem.revision + 1);
      await expect(
        insurance.getInsuranceData(f.actor, { kind: "COLLECTION", collectionId: f.collection }),
      ).rejects.toMatchObject({ code: "INSURANCE_NOT_FOUND" });
    });
    it("retains a completed transfer and collection when the previous owner erases their account", async () => {
      const f = await fixture();
      await f.service.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.second,
        role: "EDITOR",
        expectedRevision: 0,
      });
      await f.service.transferOwnership(f.actor, {
        collectionId: f.collection,
        newOwnerId: f.second,
        expectedRevision: 1,
        confirmPrivateTransfer: true,
      });
      await db.user.delete({ where: { id: f.owner } });
      expect((await f.service.getMembershipState({ userId: f.second }, f.collection)).ownerId).toBe(
        f.second,
      );
      const [receipt] = await db.$queryRaw<
        { fromOwnerId: string | null; toOwnerId: string; actorId: string | null }[]
      >`SELECT "fromOwnerId","toOwnerId","actorId" FROM "CollectionOwnershipTransfer" WHERE "collectionId"=${f.collection}::uuid`;
      expect(receipt).toMatchObject({ fromOwnerId: null, toOwnerId: f.second, actorId: null });
    });
    it("prevents arbitrary database owner changes and a duplicate owner membership", async () => {
      const f = await fixture();
      await expect(
        db.$executeRaw`UPDATE "Collection" SET "ownerId"=${f.second} WHERE id=${f.collection}::uuid`,
      ).rejects.toMatchObject({ meta: { driverAdapterError: { cause: { code: "23514" } } } });
      await expect(
        db.$executeRaw`INSERT INTO "CollectionMember" ("collectionId","userId",role) VALUES (${f.collection}::uuid,${f.owner},'ADMIN')`,
      ).rejects.toMatchObject({ meta: { driverAdapterError: { cause: { code: "23514" } } } });
      expect((await f.service.getMembershipState(f.actor, f.collection)).members).toEqual([
        { userId: f.owner, role: "OWNER" },
      ]);
    });

    it("cannot persist a claimed completed ownership transition without actually changing the owner", async () => {
      const f = await fixture();
      await f.service.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.second,
        role: "EDITOR",
        expectedRevision: 0,
      });
      await expect(
        db.$executeRaw`INSERT INTO "CollectionOwnershipTransfer" (id,"collectionId","fromOwnerId","toOwnerId","actorId","fromRevision","toRevision","transactionId") VALUES (${randomUUID()}::uuid,${f.collection}::uuid,${f.owner},${f.second},${f.owner},1,2,pg_current_xact_id()::text)`,
      ).rejects.toMatchObject({ meta: { driverAdapterError: { cause: { code: "23514" } } } });
      expect((await f.service.getMembershipState(f.actor, f.collection)).ownerId).toBe(f.owner);
    });
    it("feeds current database roles into the policy and withdraws access after member removal", async () => {
      const f = await fixture();
      await f.service.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.second,
        role: "VIEWER",
        expectedRevision: 0,
      });
      const viewer = createTrustedActorFacts({ type: "AUTHENTICATED", userId: f.second }),
        owner = createTrustedActorFacts({ type: "AUTHENTICATED", userId: f.owner });
      const facts = await f.service.getCollectionAuthorizationFacts(
        { userId: f.second },
        f.collection,
      );
      expect(authorize(viewer, "collection.view", facts).allowed).toBe(true);
      expect(authorize(viewer, "collection.edit", facts).allowed).toBe(false);
      expect(authorize(viewer, "ownership.transfer", facts).allowed).toBe(false);
      expect(authorize(owner, "ownership.transfer", facts).allowed).toBe(true);
      await f.service.removeMember(f.actor, {
        collectionId: f.collection,
        userId: f.second,
        expectedRevision: 1,
      });
      await expect(
        f.service.getCollectionAuthorizationFacts({ userId: f.second }, f.collection),
      ).rejects.toMatchObject({ code: "MEMBERSHIP_NOT_FOUND" });
    });
    it("preserves immutable manual valuation amounts and their real author through ownership transfer and author erasure", async () => {
      const f = await fixture(),
        item = await db.collectibleItem.create({
          data: { ownerId: f.owner, collectionId: f.collection, title: "Valued transferred item" },
        }),
        valuations = createValuationService(db, f.owner);
      const before = await valuations.addManualValuation(item.id, {
        amountMinor: 9007199254740993n,
        currency: "EUR",
        note: "Original owner's estimate",
      });
      await f.service.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.second,
        role: "EDITOR",
        expectedRevision: 0,
      });
      await f.service.transferOwnership(f.actor, {
        collectionId: f.collection,
        newOwnerId: f.second,
        expectedRevision: 1,
        confirmPrivateTransfer: true,
      });
      const transferred = await createValuationService(db, f.second).latestManualValuation(item.id);
      expect(transferred).toMatchObject({
        id: before.id,
        ownerId: f.second,
        actorUserId: f.owner,
        amountMinor: 9007199254740993n,
        currency: "EUR",
        minorUnitExponent: 2,
        note: before.note,
        observedAt: before.observedAt,
        createdAt: before.createdAt,
      });
      await expect(
        db.$executeRaw`UPDATE "Valuation" SET "amountMinor"=1 WHERE id=${before.id}::uuid`,
      ).rejects.toMatchObject({ meta: { driverAdapterError: { cause: { code: "23514" } } } });
      await db.user.delete({ where: { id: f.owner } });
      expect(
        await createValuationService(db, f.second).latestManualValuation(item.id),
      ).toMatchObject({
        id: before.id,
        ownerId: f.second,
        actorUserId: null,
        note: null,
        amountMinor: 9007199254740993n,
      });
    });
    it("does not leave a concurrent real tag writer's private tag attached under the wrong owner", async () => {
      const f = await fixture(),
        item = await db.collectibleItem.create({
          data: { ownerId: f.owner, collectionId: f.collection, title: "Concurrent tag transfer" },
        });
      await f.service.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.second,
        role: "EDITOR",
        expectedRevision: 0,
      });
      const name = `membership-race-${randomUUID()}`,
        url = new URL(isolated.databaseUrl);
      url.searchParams.set("application_name", name);
      const racing = createTestDatabaseClient({
        databaseUrl: url.toString(),
        schema: isolated.schema,
      });
      let entered!: () => void, release!: () => void;
      const ready = new Promise<void>((resolve) => (entered = resolve)),
        blocked = new Promise<void>((resolve) => (release = resolve));
      const hooked: TagDatabase = {
        $transaction: (work, options) =>
          db.$transaction(
            async (tx) =>
              work({
                tag: tx.tag,
                itemTag: tx.itemTag,
                $queryRaw: async <R>(strings: TemplateStringsArray, ...values: unknown[]) => {
                  const rows = await tx.$queryRaw<R>(strings, ...values);
                  if (strings.join("").includes("FOR UPDATE OF item")) {
                    entered();
                    await blocked;
                  }
                  return rows;
                },
              }),
            options,
          ),
      };
      const writer = createTagService(hooked, f.owner).setItemTags(item.id, [
        "Private concurrent label",
      ]);
      let transfer: Promise<unknown> | undefined;
      try {
        await ready;
        transfer = createMembershipService(racing).transferOwnership(f.actor, {
          collectionId: f.collection,
          newOwnerId: f.second,
          expectedRevision: 1,
          confirmPrivateTransfer: true,
        });
        const settled = transfer.then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error }),
        );
        await vi.waitFor(
          async () => {
            const [row] = await db.$queryRaw<
              { count: bigint }[]
            >`SELECT count(*) FROM pg_stat_activity WHERE application_name=${name} AND state='active' AND wait_event_type='Lock'`;
            expect(Number(row!.count)).toBeGreaterThan(0);
          },
          { timeout: 1000, interval: 10 },
        );
        release();
        await writer;
        const result = await settled;
        if (!result.ok) {
          expect(result.error).toMatchObject({ code: "MEMBERSHIP_TRANSFER_BLOCKED" });
          expect(
            (await db.collectibleItem.findUniqueOrThrow({ where: { id: item.id } })).ownerId,
          ).toBe(f.owner);
        } else {
          expect(
            (await db.collectibleItem.findUniqueOrThrow({ where: { id: item.id } })).ownerId,
          ).toBe(f.second);
          const links = await db.itemTag.findMany({
            where: { itemId: item.id },
            include: { tag: true },
          });
          expect(links).toHaveLength(1);
          expect(links[0]!.tag.ownerId).toBe(f.second);
          expect(links[0]!.tag.name).toBe("Private concurrent label");
        }
      } finally {
        release();
        await Promise.allSettled([writer, ...(transfer ? [transfer] : [])]);
        await racing.$disconnect();
      }
    });
    it.each(["tag", "identifier"] as const)(
      "rejects a former owner's %s write that waited behind the actual ownership transfer",
      async (kind) => {
        const f = await fixture();
        const item = await db.collectibleItem.create({
          data: {
            ownerId: f.owner,
            collectionId: f.collection,
            title: "Transfer first, tag writer second",
          },
        });
        await f.service.addMember(f.actor, {
          collectionId: f.collection,
          userId: f.second,
          role: "EDITOR",
          expectedRevision: 0,
        });
        const name = `membership-reverse-${randomUUID()}`;
        const url = new URL(isolated.databaseUrl);
        url.searchParams.set("application_name", name);
        const racing = createTestDatabaseClient({
          databaseUrl: url.toString(),
          schema: isolated.schema,
        });
        let entered!: () => void, release!: () => void;
        const ready = new Promise<void>((resolve) => (entered = resolve));
        const blocked = new Promise<void>((resolve) => (release = resolve));
        const hooked: MembershipDatabase = {
          $transaction: (work, options) =>
            db.$transaction(
              async (tx) =>
                work({
                  $queryRaw: async <R>(query: Prisma.Sql) => {
                    const rows = await tx.$queryRaw<R>(query);
                    if (query.sql.includes("ORDER BY id LIMIT 1001 FOR UPDATE")) {
                      entered();
                      await blocked;
                    }
                    return rows;
                  },
                }),
              options,
            ),
        };
        const transfer = createMembershipService(hooked).transferOwnership(f.actor, {
          collectionId: f.collection,
          newOwnerId: f.second,
          expectedRevision: 1,
          confirmPrivateTransfer: true,
        });
        let writer: Promise<unknown> | undefined;
        try {
          await ready;
          writer =
            kind === "tag"
              ? createTagService(racing, f.owner).setItemTags(item.id, ["Forbidden former owner"])
              : createIdentifierService(racing, f.owner).setItemIdentifiers(item.id, [
                  { type: "EAN", value: "Former-owner-identifier" },
                ]);
          const outcome = writer.then(
            (value) => ({ ok: true as const, value }),
            (error) => ({ ok: false as const, error }),
          );
          await vi.waitFor(
            async () => {
              const [row] = await db.$queryRaw<
                { count: bigint }[]
              >`SELECT count(*) FROM pg_stat_activity WHERE application_name=${name} AND state='active' AND wait_event_type='Lock'`;
              expect(Number(row!.count)).toBeGreaterThan(0);
            },
            { timeout: 1000, interval: 10 },
          );
          release();
          await transfer;
          const result = await outcome;
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.error).toMatchObject({ code: "ITEM_NOT_FOUND" });
          expect(await db.itemTag.count({ where: { itemId: item.id } })).toBe(0);
          expect(await db.itemIdentifier.count({ where: { itemId: item.id } })).toBe(0);
          expect(
            (await db.collectibleItem.findUniqueOrThrow({ where: { id: item.id } })).ownerId,
          ).toBe(f.second);
        } finally {
          release();
          await Promise.allSettled([transfer, ...(writer ? [writer] : [])]);
          await racing.$disconnect();
        }
      },
    );

    it("copies private tags to the recipient without changing either owner's other collections", async () => {
      const f = await fixture();
      const outside = await db.collection.create({
        data: { ownerId: f.owner, name: "Retained private collection" },
      });
      const recipientCollection = await db.collection.create({
        data: { ownerId: f.second, name: "Recipient private collection" },
      });
      const item = await db.collectibleItem.create({
        data: { ownerId: f.owner, collectionId: f.collection, title: "Tagged transfer" },
      });
      const retained = await db.collectibleItem.create({
        data: { ownerId: f.owner, collectionId: outside.id, title: "Retained item" },
      });
      const recipientItem = await db.collectibleItem.create({
        data: { ownerId: f.second, collectionId: recipientCollection.id, title: "Recipient item" },
      });
      const oldTags = await createTagService(db, f.owner).setItemTags(item.id, [
        "Rare cards",
        "Private label",
      ]);
      await createTagService(db, f.owner).setItemTags(retained.id, ["Rare cards", "Private label"]);
      const recipientTags = await createTagService(db, f.second).setItemTags(recipientItem.id, [
        "RARE CARDS",
      ]);
      await f.service.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.second,
        role: "EDITOR",
        expectedRevision: 0,
      });
      await f.service.transferOwnership(f.actor, {
        collectionId: f.collection,
        newOwnerId: f.second,
        expectedRevision: 1,
        confirmPrivateTransfer: true,
      });
      const links = await db.itemTag.findMany({
        where: { itemId: item.id },
        include: { tag: true },
      });
      expect(links.map((link) => link.tag.ownerId)).toEqual([f.second, f.second]);
      expect(links.map((link) => link.tag.normalizedName).sort()).toEqual([
        "private label",
        "rare cards",
      ]);
      expect(links.find((link) => link.tag.normalizedName === "rare cards")!.tagId).toBe(
        recipientTags[0]!.id,
      );
      expect(links.find((link) => link.tag.normalizedName === "rare cards")!.tag.name).toBe(
        "RARE CARDS",
      );
      expect(
        (await db.itemTag.findMany({ where: { itemId: retained.id } }))
          .map((link) => link.tagId)
          .sort(),
      ).toEqual(oldTags.map((tag) => tag.id).sort());
      expect(await db.itemTag.findMany({ where: { itemId: recipientItem.id } })).toEqual([
        { itemId: recipientItem.id, tagId: recipientTags[0]!.id },
      ]);
      // A round trip reuses the original owner's tags; no shared outside tag is reassigned or deleted.
      await f.service.transferOwnership(
        { userId: f.second },
        {
          collectionId: f.collection,
          newOwnerId: f.owner,
          expectedRevision: 2,
          confirmPrivateTransfer: true,
        },
      );
      expect(
        (await db.itemTag.findMany({ where: { itemId: item.id } }))
          .map((link) => link.tagId)
          .sort(),
      ).toEqual(oldTags.map((tag) => tag.id).sort());
      expect(await db.tag.count({ where: { ownerId: f.owner } })).toBe(2);
      expect(await db.tag.count({ where: { ownerId: f.second } })).toBe(2);
    });

    it("preserves exact grading certificates, quantity and timestamps during ownership transfer", async () => {
      const f = await fixture();
      const item = await db.collectibleItem.create({
        data: {
          ownerId: f.owner,
          collectionId: f.collection,
          title: "Graded transfer",
          quantity: 1,
        },
      });
      const grade = await createGradingService(db, f.owner).addGrading(item.id, {
        provider: "PSA",
        grade: "10 GEM MINT",
        certificateNo: "000123-A",
        comparableValue: "9.5001",
        comparableScale: "10",
        gradedAt: "2026-01-02",
        verificationUrl: "https://example.invalid/cert/000123-A",
        source: "Own certificate",
      });
      const before = await db.grading.findUniqueOrThrow({ where: { id: grade.id } });
      await f.service.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.second,
        role: "EDITOR",
        expectedRevision: 0,
      });
      await f.service.transferOwnership(f.actor, {
        collectionId: f.collection,
        newOwnerId: f.second,
        expectedRevision: 1,
        confirmPrivateTransfer: true,
      });
      const after = await db.grading.findUniqueOrThrow({ where: { id: grade.id } });
      expect(after).toEqual({ ...before, ownerId: f.second });
      expect(await createGradingService(db, f.second).listGradings(item.id)).toEqual([grade]);
      await expect(
        db.collectibleItem.update({ where: { id: item.id }, data: { quantity: 2 } }),
      ).rejects.toBeDefined();
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: item.id } })).quantity,
      ).toBe(1);
      await db.user.delete({ where: { id: f.owner } });
      expect((await db.grading.findUniqueOrThrow({ where: { id: grade.id } })).ownerId).toBe(
        f.second,
      );
    });
    it("rolls back the entire transfer on a recipient certificate conflict", async () => {
      const f = await fixture();
      const other = await db.collection.create({
        data: { ownerId: f.second, name: "Existing certificates" },
      });
      const source = await db.collectibleItem.create({
        data: { ownerId: f.owner, collectionId: f.collection, title: "Duplicate certificate" },
      });
      const target = await db.collectibleItem.create({
        data: { ownerId: f.second, collectionId: other.id, title: "Already owned certificate" },
      });
      for (const [owner, itemId] of [
        [f.owner, source.id],
        [f.second, target.id],
      ])
        await createGradingService(db, owner!).addGrading(itemId!, {
          provider: "PSA",
          grade: "10",
          certificateNo: "same-certificate",
        });
      await createTagService(db, f.owner).setItemTags(source.id, ["Do not partially copy"]);
      await f.service.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.second,
        role: "EDITOR",
        expectedRevision: 0,
      });
      await expect(
        f.service.transferOwnership(f.actor, {
          collectionId: f.collection,
          newOwnerId: f.second,
          expectedRevision: 1,
          confirmPrivateTransfer: true,
        }),
      ).rejects.toMatchObject({ code: "MEMBERSHIP_CONFLICT" });
      expect((await db.collection.findUniqueOrThrow({ where: { id: f.collection } })).ownerId).toBe(
        f.owner,
      );
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: source.id } })).ownerId,
      ).toBe(f.owner);
      expect(
        await db.collectionOwnershipTransfer.count({ where: { collectionId: f.collection } }),
      ).toBe(0);
      expect(
        await db.tag.count({
          where: { ownerId: f.second, normalizedName: "do not partially copy" },
        }),
      ).toBe(0);
      expect((await f.service.getMembershipState(f.actor, f.collection)).revision).toBe(1);
    });

    it("transfers an actual private PDF upload without changing its bytes, identity, links or access boundary", async () => {
      const f = await fixture();
      const root = await mkdtemp(join(tmpdir(), "sammlerraum-transfer-media-"));
      try {
        const storage = new LocalPersistentStorage(root);
        const media = createMediaService(db, storage);
        const { PDFDocument } = createRequire(
          new URL("../../../../apps/worker/package.json", import.meta.url),
        )("pdf-lib");
        const pdf = await PDFDocument.create();
        pdf.addPage().drawText("Own synthetic purchase receipt");
        const bytes = await pdf.save();
        const item = await db.collectibleItem.create({
          data: { ownerId: f.owner, collectionId: f.collection, title: "With purchase document" },
        });
        const asset = await media.createDocumentUpload(f.owner, bytes, {
          fileName: "receipt.pdf",
          claimedMime: "application/pdf",
        });
        const link = await media.linkAsset(f.owner, {
          target: "ITEM_DOCUMENT",
          itemId: item.id,
          assetId: asset.id,
          category: "PURCHASE_RECEIPT",
          title: "Own receipt",
        });
        const beforeAsset = await db.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
        const beforeLink = await db.documentLink.findUniqueOrThrow({ where: { id: link.id } });
        const reader = createMediaReadService(db, createResourceQuery(db).loadItem);
        expect(await reader.resolveRead(f.owner, asset.id, "original")).not.toBeNull();
        await f.service.addMember(f.actor, {
          collectionId: f.collection,
          userId: f.second,
          role: "EDITOR",
          expectedRevision: 0,
        });
        await f.service.transferOwnership(f.actor, {
          collectionId: f.collection,
          newOwnerId: f.second,
          expectedRevision: 1,
          confirmPrivateTransfer: true,
        });
        expect(await db.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } })).toEqual({
          ...beforeAsset,
          ownerId: f.second,
        });
        expect(await db.documentLink.findUniqueOrThrow({ where: { id: link.id } })).toEqual({
          ...beforeLink,
          ownerId: f.second,
        });
        const access = await reader.resolveRead(f.second, asset.id, "original");
        expect(access).toMatchObject({ storageKey: beforeAsset.storageKey, public: false });
        expect(Buffer.from(await storage.read(access!.storageKey))).toEqual(Buffer.from(bytes));
        expect(
          createHash("sha256")
            .update(await storage.read(access!.storageKey))
            .digest("hex"),
        ).toBe(beforeAsset.checksumSha256);
        expect(await reader.resolveRead(f.owner, asset.id, "original")).toBeNull();
        expect(await reader.resolveRead(f.outsider, asset.id, "original")).toBeNull();
        await db.user.delete({ where: { id: f.owner } });
        expect(await reader.resolveRead(f.second, asset.id, "original")).not.toBeNull();
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
    it("does not transfer an asset also referenced by another collection", async () => {
      const f = await fixture();
      const other = await db.collection.create({
        data: { ownerId: f.owner, name: "Keep private" },
      });
      const items = await Promise.all(
        [f.collection, other.id].map((collectionId) =>
          db.collectibleItem.create({
            data: { ownerId: f.owner, collectionId, title: "Shared document reference" },
          }),
        ),
      );
      const asset = await db.mediaAsset.create({
        data: {
          ownerId: f.owner,
          kind: "DOCUMENT",
          status: "READY",
          storageKey: `originals/${randomUUID()}`,
          mimeType: "application/pdf",
          byteSize: 32n,
          checksumSha256: "a".repeat(64),
          originalFileName: "shared.pdf",
        },
      });
      for (const item of items)
        await db.documentLink.create({
          data: { ownerId: f.owner, itemId: item.id, assetId: asset.id, position: 0 },
        });
      await f.service.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.second,
        role: "EDITOR",
        expectedRevision: 0,
      });
      await expect(
        f.service.transferOwnership(f.actor, {
          collectionId: f.collection,
          newOwnerId: f.second,
          expectedRevision: 1,
          confirmPrivateTransfer: true,
        }),
      ).rejects.toMatchObject({ code: "MEMBERSHIP_TRANSFER_BLOCKED" });
      expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } })).ownerId).toBe(
        f.owner,
      );
      expect(await db.documentLink.count({ where: { assetId: asset.id, ownerId: f.owner } })).toBe(
        2,
      );
      expect(
        (await db.collection.findUniqueOrThrow({ where: { id: f.collection } }))
          .collaborationRevision,
      ).toBe(1);
    });

    it("preserves real image originals and variants shared only inside the transferred collection", async () => {
      const f = await fixture();
      const root = await mkdtemp(join(tmpdir(), "sammlerraum-transfer-image-"));
      try {
        const storage = new LocalPersistentStorage(root);
        const bytes = await sharp({
          create: { width: 32, height: 24, channels: 3, background: "#2191ab" },
        })
          .png()
          .toBuffer();
        const assetId = randomUUID(),
          storageKey = `originals/${assetId}`;
        await storage.put(storageKey, bytes);
        const asset = await db.mediaAsset.create({
          data: {
            id: assetId,
            ownerId: f.owner,
            kind: "IMAGE",
            status: "READY",
            storageKey,
            mimeType: "image/png",
            byteSize: BigInt(bytes.length),
            checksumSha256: createHash("sha256").update(bytes).digest("hex"),
            width: 32,
            height: 24,
            originalFileName: "own-synthetic.png",
          },
        });
        const variants = [];
        for (const [name, size] of [
          ["THUMBNAIL", 8],
          ["MEDIUM", 16],
          ["LARGE", 32],
        ] as const) {
          const buffer = await sharp(bytes)
            .resize({ width: size })
            .webp()
            .toBuffer({ resolveWithObject: true });
          const key = `variants/${assetId}/${name.toLowerCase()}.webp`;
          await storage.put(key, buffer.data);
          variants.push(
            await db.mediaVariant.create({
              data: {
                assetId,
                name,
                storageKey: key,
                mimeType: "image/webp",
                byteSize: BigInt(buffer.data.length),
                checksumSha256: createHash("sha256").update(buffer.data).digest("hex"),
                width: buffer.info.width,
                height: buffer.info.height,
              },
            }),
          );
        }
        const items = [];
        for (let n = 0; n < 2; n++) {
          const item = await db.collectibleItem.create({
            data: { ownerId: f.owner, collectionId: f.collection, title: `Image reference ${n}` },
          });
          items.push(item);
          await db.mediaLink.create({
            data: { ownerId: f.owner, assetId, itemId: item.id, position: 0 },
          });
        }
        const links = await db.mediaLink.findMany({ where: { assetId }, orderBy: { id: "asc" } });
        const before = await db.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
        await f.service.addMember(f.actor, {
          collectionId: f.collection,
          userId: f.second,
          role: "EDITOR",
          expectedRevision: 0,
        });
        await f.service.transferOwnership(f.actor, {
          collectionId: f.collection,
          newOwnerId: f.second,
          expectedRevision: 1,
          confirmPrivateTransfer: true,
        });
        expect(await db.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } })).toEqual({
          ...before,
          ownerId: f.second,
        });
        expect(await db.mediaLink.findMany({ where: { assetId }, orderBy: { id: "asc" } })).toEqual(
          links.map((link) => ({ ...link, ownerId: f.second })),
        );
        expect(
          await db.mediaVariant.findMany({ where: { assetId }, orderBy: { name: "asc" } }),
        ).toEqual([...variants].sort((a, b) => a.name.localeCompare(b.name)));
        const reader = createMediaReadService(db, createResourceQuery(db).loadItem);
        expect(await reader.resolveRead(f.owner, asset.id, "medium")).toBeNull();
        for (const variant of variants) {
          const stored = await storage.read(variant.storageKey);
          expect(createHash("sha256").update(stored).digest("hex")).toBe(variant.checksumSha256);
          expect((await sharp(stored).metadata()).width).toBe(variant.width);
        }
        expect(await reader.resolveRead(f.second, asset.id, "medium")).toMatchObject({
          public: false,
          storageKey: variants[1]!.storageKey,
        });
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
    it("blocks the transfer while the actual shared media advisory lock is held", async () => {
      const f = await fixture();
      const item = await db.collectibleItem.create({
        data: { ownerId: f.owner, collectionId: f.collection, title: "Busy private asset" },
      });
      const asset = await db.mediaAsset.create({
        data: {
          ownerId: f.owner,
          kind: "DOCUMENT",
          status: "READY",
          storageKey: `originals/${randomUUID()}`,
          mimeType: "application/pdf",
          byteSize: 32n,
          checksumSha256: "b".repeat(64),
          originalFileName: "busy.pdf",
        },
      });
      await db.documentLink.create({
        data: { ownerId: f.owner, assetId: asset.id, itemId: item.id, position: 0 },
      });
      await f.service.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.second,
        role: "EDITOR",
        expectedRevision: 0,
      });
      let entered!: () => void, release!: () => void;
      const ready = new Promise<void>((resolve) => (entered = resolve)),
        blocked = new Promise<void>((resolve) => (release = resolve));
      const holding = db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`sammlerraum:media:${asset.id}`},0))::text`;
        entered();
        await blocked;
      });
      try {
        await ready;
        await expect(
          f.service.transferOwnership(f.actor, {
            collectionId: f.collection,
            newOwnerId: f.second,
            expectedRevision: 1,
            confirmPrivateTransfer: true,
          }),
        ).rejects.toMatchObject({ code: "MEMBERSHIP_TRANSFER_BLOCKED" });
        expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } })).ownerId).toBe(
          f.owner,
        );
        expect(
          (await db.collection.findUniqueOrThrow({ where: { id: f.collection } }))
            .collaborationRevision,
        ).toBe(1);
      } finally {
        release();
        await holding;
      }
      await expect(
        f.service.transferOwnership(f.actor, {
          collectionId: f.collection,
          newOwnerId: f.second,
          expectedRevision: 1,
          confirmPrivateTransfer: true,
        }),
      ).resolves.toMatchObject({ ownerId: f.second });
    });
    it("copies only the needed location hierarchy with fresh QR identities and preserves real move history", async () => {
      const f = await fixture(),
        locations = createLocationService(db, f.owner);
      const room = await locations.createLocation({ name: "Private room", type: "ROOM" });
      const shelf = await locations.createLocation({
        parentId: room.id,
        name: "Shelf",
        type: "SHELF",
      });
      const first = await locations.createLocation({
        parentId: shelf.id,
        name: "Box A",
        type: "BOX",
      });
      const second = await locations.createLocation({
        parentId: shelf.id,
        name: "Box B",
        type: "BOX",
      });
      await locations.createLocation({
        parentId: room.id,
        name: "Unrelated private drawer",
        type: "DRAWER",
      });
      const outside = await db.collection.create({
        data: { ownerId: f.owner, name: "Retained locations" },
      });
      const retained = await db.collectibleItem.create({
        data: {
          ownerId: f.owner,
          collectionId: outside.id,
          title: "Retained private location",
          storageLocationId: first.id,
        },
      });
      const item = await db.collectibleItem.create({
        data: { ownerId: f.owner, collectionId: f.collection, title: "Moving physical item" },
      });
      await locations.assignItemLocation(item.id, first.id);
      await locations.assignItemLocation(item.id, second.id);
      const oldLocations = await db.storageLocation.findMany({
        where: { ownerId: f.owner },
        orderBy: { id: "asc" },
      });
      const history = await db.itemLocationHistory.findMany({
        where: { itemId: item.id },
        orderBy: { id: "asc" },
      });
      await f.service.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.second,
        role: "EDITOR",
        expectedRevision: 0,
      });
      await f.service.transferOwnership(f.actor, {
        collectionId: f.collection,
        newOwnerId: f.second,
        expectedRevision: 1,
        confirmPrivateTransfer: true,
      });
      const copied = await db.storageLocation.findMany({ where: { ownerId: f.second } });
      expect(copied).toHaveLength(4);
      const byName = new Map(copied.map((location) => [location.name, location]));
      expect(byName.get("Shelf")!.parentId).toBe(byName.get("Private room")!.id);
      for (const name of ["Box A", "Box B"])
        expect(byName.get(name)!.parentId).toBe(byName.get("Shelf")!.id);
      const sourceMap = new Map(oldLocations.map((location) => [location.name, location]));
      for (const row of copied) {
        expect(row.id).not.toBe(sourceMap.get(row.name)!.id);
        expect(row.qrToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(row.qrToken).not.toBe(sourceMap.get(row.name)!.qrToken);
        expect(row.type).toBe(sourceMap.get(row.name)!.type);
        expect(row.visibility).toBe(sourceMap.get(row.name)!.visibility);
      }
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: item.id } })).storageLocationId,
      ).toBe(byName.get("Box B")!.id);
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: retained.id } }))
          .storageLocationId,
      ).toBe(first.id);
      expect(
        await db.storageLocation.findMany({ where: { ownerId: f.owner }, orderBy: { id: "asc" } }),
      ).toEqual(oldLocations);
      const mapping = new Map(
        copied.map((location) => [sourceMap.get(location.name)!.id, location.id]),
      );
      expect(
        await db.itemLocationHistory.findMany({
          where: { itemId: item.id },
          orderBy: { id: "asc" },
        }),
      ).toEqual(
        history.map((row) => ({
          ...row,
          ownerId: f.second,
          fromLocationId: row.fromLocationId ? mapping.get(row.fromLocationId)! : null,
          toLocationId: row.toLocationId ? mapping.get(row.toLocationId)! : null,
        })),
      );
      await db.user.delete({ where: { id: f.owner } });
      const redacted = await db.itemLocationHistory.findMany({ where: { itemId: item.id } });
      expect(redacted).toHaveLength(2);
      expect(redacted.every((row) => row.assignedById === null)).toBe(true);
      expect(await db.storageLocation.count({ where: { ownerId: f.second } })).toBe(4);
    });

    it("rejects cyclic source locations atomically rather than losing their path", async () => {
      const f = await fixture(),
        service = createLocationService(db, f.owner);
      const first = await service.createLocation({ name: "Cycle A" });
      const second = await service.createLocation({ parentId: first.id, name: "Cycle B" });
      await db.storageLocation.update({ where: { id: first.id }, data: { parentId: second.id } });
      const item = await db.collectibleItem.create({
        data: {
          ownerId: f.owner,
          collectionId: f.collection,
          title: "Corrupt legacy hierarchy",
          storageLocationId: first.id,
        },
      });
      await f.service.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.second,
        role: "EDITOR",
        expectedRevision: 0,
      });
      await expect(
        f.service.transferOwnership(f.actor, {
          collectionId: f.collection,
          newOwnerId: f.second,
          expectedRevision: 1,
          confirmPrivateTransfer: true,
        }),
      ).rejects.toMatchObject({ code: "MEMBERSHIP_INTEGRITY" });
      expect(await db.storageLocation.count({ where: { ownerId: f.second } })).toBe(0);
      expect(
        (await db.collectibleItem.findUniqueOrThrow({ where: { id: item.id } })).storageLocationId,
      ).toBe(first.id);
      expect(
        await db.collectionOwnershipTransfer.count({ where: { collectionId: f.collection } }),
      ).toBe(0);
    });
    it("does not invent a move author or mutate historical timestamps", async () => {
      const f = await fixture(),
        service = createLocationService(db, f.owner);
      const location = await service.createLocation({ name: "Guarded history" });
      const item = await db.collectibleItem.create({
        data: { ownerId: f.owner, collectionId: f.collection, title: "History author guard" },
      });
      const history = await service.assignItemLocation(item.id, location.id);
      for (const data of [
        { assignedById: null },
        { assignedById: f.second },
        { movedAt: new Date("2000-01-01") },
      ]) {
        await expect(
          db.itemLocationHistory.update({ where: { id: history.id }, data }),
        ).rejects.toMatchObject({ meta: { driverAdapterError: { cause: { code: "23514" } } } });
      }
    });
    it("retains the known source manifest and safely erases cancelled private imports across transfer", async () => {
      const f = await fixture();
      const root = await mkdtemp(join(tmpdir(), "sammlerraum-transfer-import-"));
      try {
        const lock = createMediaAssetLocker(isolated.databaseUrl);
        const storage = new LocalPersistentStorage(root, lock);
        const workflow = createImportWorkflowService(db, storage, lock),
          imports = createImportService(db);
        const uploaded = await workflow.uploadImport(
          f.actor,
          {
            collectionId: f.collection,
            locale: "de",
            fileName: "own.csv",
            format: "CSV",
            uploadRequestId: randomUUID(),
            parserOptions: { format: "CSV", hasHeader: true },
          },
          Buffer.from("Title\nOwn pending record\n"),
        );
        const key = `imports/${uploaded.job.id}/source`;
        await storage.put("unrelated/keep", Buffer.from("Keep outside transfer"));
        await f.service.addMember(f.actor, {
          collectionId: f.collection,
          userId: f.second,
          role: "EDITOR",
          expectedRevision: 0,
        });
        const transfer = {
          collectionId: f.collection,
          newOwnerId: f.second,
          expectedRevision: 1,
          confirmPrivateTransfer: true,
        };
        await expect(f.service.transferOwnership(f.actor, transfer)).rejects.toMatchObject({
          code: "MEMBERSHIP_TRANSFER_BLOCKED",
        });
        await imports.cancelImport(f.actor, {
          jobId: uploaded.job.id,
          expectedRevision: uploaded.job.revision,
        });
        const before = await db.importSourceObject.findUniqueOrThrow({
          where: { id: uploaded.job.id },
        });
        await f.service.transferOwnership(f.actor, transfer);
        expect(await db.importJob.count({ where: { id: uploaded.job.id } })).toBe(0);
        expect(
          await db.importSourceObject.findUniqueOrThrow({ where: { id: uploaded.job.id } }),
        ).toEqual({ ...before, jobId: null });
        for (const actor of [f.actor, { userId: f.second }])
          await expect(imports.getImportJob(actor, uploaded.job.id)).rejects.toMatchObject({
            code: "IMPORT_NOT_FOUND",
          });
        expect(await storage.exists(key)).toBe(true);
        const logger = { error: vi.fn() };
        await createImportSourceCleanup(db, storage, lock, logger).run();
        expect(logger.error).not.toHaveBeenCalled();
        expect(await storage.exists(key)).toBe(false);
        expect(await storage.exists("unrelated/keep")).toBe(true);
        expect(
          (await db.importSourceObject.findUniqueOrThrow({ where: { id: uploaded.job.id } }))
            .deletedAt,
        ).not.toBeNull();
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });

    it("preserves exact purchase and custom-money COPY meaning and real authors within a whole transferred scope", async () => {
      const f = await fixture(),
        money = createPersonalMoneyService(db, f.owner);
      const authored = (decimal: string) => ({
        kind: "DECIMAL",
        profileId: "legacy-money-iso-2026-09-17-v1",
        currency: "EUR",
        decimal,
      });
      const created = await money.createItemV2({
        schemaVersion: 1,
        item: { collectionId: f.collection, title: "Ten physical copies", quantity: 10 },
        purchase: { op: "NEW", authoring: authored("4.25") },
      });
      const definition = await createCustomFieldService(db, f.owner).createFieldDefinition({
        collectionId: f.collection,
        name: "Insured per-unit cost",
        type: "MONEY",
      });
      const subject = {
        family: "CUSTOM" as const,
        itemId: created.item.id,
        fieldDefinitionId: definition.id,
      };
      const missing = await money.getMoney(subject);
      await money.setCustomMoneyV2(created.item.id, definition.id, {
        schemaVersion: 1,
        intent: {
          op: "REPLACE",
          expectedFactToken: missing.factToken,
          authoring: authored("1.25"),
        },
      });
      const split = await createItemService(db, f.owner).splitQuantityItem(created.item.id, 3);
      const ids = [split.source.id, split.created.id];
      const purchaseEvents = await db.purchaseMoneyInterpretationEvent.findMany({
        where: { itemId: { in: ids } },
        orderBy: { id: "asc" },
      });
      const customEvents = await db.customMoneyInterpretationEvent.findMany({
        where: { itemId: { in: ids } },
        orderBy: { id: "asc" },
      });
      expect(purchaseEvents.some((event) => event.operation === "COPY")).toBe(true);
      expect(customEvents.some((event) => event.operation === "COPY")).toBe(true);
      await f.service.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.second,
        role: "EDITOR",
        expectedRevision: 0,
      });
      await f.service.transferOwnership(f.actor, {
        collectionId: f.collection,
        newOwnerId: f.second,
        expectedRevision: 1,
        confirmPrivateTransfer: true,
      });
      expect(
        await db.purchaseMoneyInterpretationEvent.findMany({
          where: { itemId: { in: ids } },
          orderBy: { id: "asc" },
        }),
      ).toEqual(purchaseEvents);
      expect(
        await db.customMoneyInterpretationEvent.findMany({
          where: { itemId: { in: ids } },
          orderBy: { id: "asc" },
        }),
      ).toEqual(customEvents);
      const recipient = createPersonalMoneyService(db, f.second);
      for (const itemId of ids) {
        expect(
          (await recipient.getMoney({ family: "PURCHASE", itemId })).interpretation,
        ).toMatchObject({ kind: "INTERPRETED", decimal: "4.25" });
        expect((await recipient.getMoney({ ...subject, itemId })).interpretation).toMatchObject({
          kind: "INTERPRETED",
          decimal: "1.25",
        });
        await expect(money.getMoney({ family: "PURCHASE", itemId })).rejects.toMatchObject({
          code: "MONEY_NOT_FOUND",
        });
      }
      expect(
        (await db.collectibleItem.findMany({ where: { id: { in: ids } } })).reduce(
          (sum, item) => sum + item.purchaseAmountMinor! * BigInt(item.quantity),
          0n,
        ),
      ).toBe(4250n);
      await db.user.delete({ where: { id: f.owner } });
      for (const itemId of ids) {
        expect(
          (await recipient.getMoney({ family: "PURCHASE", itemId })).interpretation,
        ).toMatchObject({ kind: "INTERPRETED", decimal: "4.25" });
        expect((await recipient.getMoney({ ...subject, itemId })).interpretation).toMatchObject({
          kind: "INTERPRETED",
          decimal: "1.25",
        });
      }
    });
    it.each(["origin", "copy"] as const)(
      "blocks a cross-collection money lineage when transferring its %s",
      async (kind) => {
        const f = await fixture(),
          money = createPersonalMoneyService(db, f.owner);
        const created = await money.createItemV2({
          schemaVersion: 1,
          item: { collectionId: f.collection, title: "Cross-collection origin", quantity: 10 },
          purchase: {
            op: "NEW",
            authoring: {
              kind: "DECIMAL",
              profileId: "legacy-money-iso-2026-09-17-v1",
              currency: "EUR",
              decimal: "4.25",
            },
          },
        });
        const split = await createItemService(db, f.owner).splitQuantityItem(created.item.id, 3);
        const outside = await db.collection.create({
          data: { ownerId: f.owner, name: "Outside money copy" },
        });
        await db.collectibleItem.update({
          where: { id: split.created.id },
          data: { collectionId: outside.id },
        });
        const collectionId = kind === "origin" ? f.collection : outside.id;
        expect(
          (await money.getMoney({ family: "PURCHASE", itemId: split.created.id })).interpretation,
        ).toMatchObject({ kind: "INTERPRETED" });
        await f.service.addMember(f.actor, {
          collectionId,
          userId: f.second,
          role: "EDITOR",
          expectedRevision: 0,
        });
        await expect(
          f.service.transferOwnership(f.actor, {
            collectionId,
            newOwnerId: f.second,
            expectedRevision: 1,
            confirmPrivateTransfer: true,
          }),
        ).rejects.toMatchObject({ code: "MEMBERSHIP_TRANSFER_BLOCKED" });
        expect(
          (await db.collection.findUniqueOrThrow({ where: { id: collectionId } })).ownerId,
        ).toBe(f.owner);
        expect(
          (await money.getMoney({ family: "PURCHASE", itemId: split.created.id })).interpretation,
        ).toMatchObject({ kind: "INTERPRETED", decimal: "4.25" });
      },
    );

    it("fences a real raw COPY insert racing after the transfer's closed-scope check", async () => {
      const f = await fixture(),
        money = createPersonalMoneyService(db, f.owner);
      const created = await money.createItemV2({
        schemaVersion: 1,
        item: { collectionId: f.collection, title: "Concurrent origin" },
        purchase: {
          op: "NEW",
          authoring: {
            kind: "DECIMAL",
            profileId: "legacy-money-iso-2026-09-17-v1",
            currency: "EUR",
            decimal: "4.25",
          },
        },
      });
      const origin = await db.purchaseMoneyInterpretationEvent.findFirstOrThrow({
        where: { itemId: created.item.id, operation: "AUTHOR" },
      });
      const outside = await db.collection.create({
        data: { ownerId: f.owner, name: "Concurrent outside target" },
      });
      const target = await db.collectibleItem.create({
        data: {
          ownerId: f.owner,
          collectionId: outside.id,
          title: "Raw COPY destination",
          purchaseAmountMinor: 425n,
          purchaseCurrency: "EUR",
        },
      });
      await f.service.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.second,
        role: "EDITOR",
        expectedRevision: 0,
      });
      const name = `membership-copy-${randomUUID()}`,
        url = new URL(isolated.databaseUrl);
      url.searchParams.set("application_name", name);
      const racing = createTestDatabaseClient({
        databaseUrl: url.toString(),
        schema: isolated.schema,
      });
      let entered!: () => void, release!: () => void;
      const ready = new Promise<void>((resolve) => (entered = resolve)),
        blocked = new Promise<void>((resolve) => (release = resolve));
      const hooked: MembershipDatabase = {
        $transaction: (work, options) =>
          db.$transaction(
            async (tx) =>
              work({
                $queryRaw: async <R>(query: Prisma.Sql) => {
                  const rows = await tx.$queryRaw<R>(query);
                  if (query.sql.includes('SELECT EXISTS(SELECT 1 FROM "Grading" source')) {
                    entered();
                    await blocked;
                  }
                  return rows;
                },
              }),
            options,
          ),
      };
      const transfer = createMembershipService(hooked).transferOwnership(f.actor, {
        collectionId: f.collection,
        newOwnerId: f.second,
        expectedRevision: 1,
        confirmPrivateTransfer: true,
      });
      let copy: Promise<unknown> | undefined;
      try {
        await ready;
        copy = racing.$executeRaw`INSERT INTO "PurchaseMoneyInterpretationEvent" (id,"itemId",generation,sequence,operation,"rawAmountMinor","rawCurrency",exponent,"unitKey","unitLabel","basisId","sourceEventId","originEventId","actorId")
          SELECT ${randomUUID()}::uuid,${target.id}::uuid,${target.purchaseMoneyGeneration}::uuid,2,'COPY',"rawAmountMinor","rawCurrency",exponent,"unitKey","unitLabel","basisId",id,id,${f.owner}
          FROM "PurchaseMoneyInterpretationEvent" WHERE id=${origin.id}::uuid`;
        let finished = false;
        const outcome = copy.then(
          (value) => {
            finished = true;
            return { ok: true as const, value };
          },
          (error) => {
            finished = true;
            return { ok: false as const, error };
          },
        );
        await vi.waitFor(
          async () => {
            if (finished) return;
            const [row] = await db.$queryRaw<
              { count: bigint }[]
            >`SELECT count(*) FROM pg_stat_activity WHERE application_name=${name} AND state='active' AND wait_event_type='Lock'`;
            expect(Number(row!.count)).toBeGreaterThan(0);
          },
          { timeout: 1000, interval: 10 },
        );
        release();
        await transfer;
        const result = await outcome;
        expect(result.ok).toBe(false);
        if (!result.ok)
          expect(result.error).toMatchObject({
            meta: { driverAdapterError: { cause: { originalCode: "40001" } } },
          });
        expect(
          await db.purchaseMoneyInterpretationEvent.count({
            where: { itemId: target.id, operation: "COPY" },
          }),
        ).toBe(0);
        expect(
          (await db.collectibleItem.findUniqueOrThrow({ where: { id: created.item.id } })).ownerId,
        ).toBe(f.second);
      } finally {
        release();
        await Promise.allSettled([transfer, ...(copy ? [copy] : [])]);
        await racing.$disconnect();
      }
    });
    it("reports a controlled conflict when a recipient adds the same certificate after preflight", async () => {
      const f = await fixture();
      const item = await db.collectibleItem.create({
        data: { ownerId: f.owner, collectionId: f.collection, title: "Certificate race source" },
      });
      await createGradingService(db, f.owner).addGrading(item.id, {
        provider: "PSA",
        grade: "10",
        certificateNo: "race-001",
      });
      const outside = await db.collection.create({
        data: { ownerId: f.second, name: "Certificate race recipient" },
      });
      const target = await db.collectibleItem.create({
        data: { ownerId: f.second, collectionId: outside.id, title: "Certificate race target" },
      });
      await f.service.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.second,
        role: "EDITOR",
        expectedRevision: 0,
      });
      let entered!: () => void, release!: () => void;
      const ready = new Promise<void>((resolve) => (entered = resolve)),
        blocked = new Promise<void>((resolve) => (release = resolve));
      const hooked: MembershipDatabase = {
        $transaction: (work, options) =>
          db.$transaction(
            async (tx) =>
              work({
                $queryRaw: async <R>(query: Prisma.Sql) => {
                  const rows = await tx.$queryRaw<R>(query);
                  if (query.sql.includes('SELECT EXISTS(SELECT 1 FROM "Grading" source')) {
                    entered();
                    await blocked;
                  }
                  return rows;
                },
              }),
            options,
          ),
      };
      const transfer = createMembershipService(hooked).transferOwnership(f.actor, {
        collectionId: f.collection,
        newOwnerId: f.second,
        expectedRevision: 1,
        confirmPrivateTransfer: true,
      });
      const result = transfer.then(
        (value) => ({ ok: true as const, value }),
        (error) => ({ ok: false as const, error }),
      );
      try {
        await ready;
        await createGradingService(db, f.second).addGrading(target.id, {
          provider: "PSA",
          grade: "9",
          certificateNo: "race-001",
        });
        release();
        const outcome = await result;
        expect(outcome.ok).toBe(false);
        if (!outcome.ok) expect(outcome.error).toMatchObject({ code: "MEMBERSHIP_CONFLICT" });
        expect(
          (await db.collectibleItem.findUniqueOrThrow({ where: { id: item.id } })).ownerId,
        ).toBe(f.owner);
        expect(
          await db.collectionOwnershipTransfer.count({ where: { collectionId: f.collection } }),
        ).toBe(0);
      } finally {
        release();
        await result;
      }
    });

    it("enforces final money ownership coherence even when raw SQL bypasses service preflight", async () => {
      const f = await fixture(),
        money = createPersonalMoneyService(db, f.owner);
      const created = await money.createItemV2({
        schemaVersion: 1,
        item: { collectionId: f.collection, title: "Database coherence origin", quantity: 2 },
        purchase: {
          op: "NEW",
          authoring: {
            kind: "DECIMAL",
            profileId: "legacy-money-iso-2026-09-17-v1",
            currency: "EUR",
            decimal: "1",
          },
        },
      });
      const split = await createItemService(db, f.owner).splitQuantityItem(created.item.id, 1);
      const outside = await db.collection.create({
        data: { ownerId: f.owner, name: "Database coherence outside" },
      });
      await db.collectibleItem.update({
        where: { id: split.created.id },
        data: { collectionId: outside.id },
      });
      await f.service.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.second,
        role: "EDITOR",
        expectedRevision: 0,
      });
      await expect(
        db.$transaction(async (tx) => {
          await tx.$executeRaw`INSERT INTO "CollectionOwnershipTransfer" (id,"collectionId","fromOwnerId","toOwnerId","actorId","fromRevision","toRevision","transactionId") VALUES (${randomUUID()}::uuid,${f.collection}::uuid,${f.owner},${f.second},${f.owner},1,2,pg_current_xact_id()::text)`;
          await tx.collectionMember.delete({
            where: { collectionId_userId: { collectionId: f.collection, userId: f.second } },
          });
          await tx.collection.update({
            where: { id: f.collection },
            data: { ownerId: f.second, collaborationRevision: 2 },
          });
          await tx.collectionMember.create({
            data: { collectionId: f.collection, userId: f.owner, role: "ADMIN" },
          });
        }),
      ).rejects.toMatchObject({
        cause: { code: "23514" },
        message: "Ownership transfer must preserve private money provenance",
      });
      expect((await db.collection.findUniqueOrThrow({ where: { id: f.collection } })).ownerId).toBe(
        f.owner,
      );
      expect(
        (await money.getMoney({ family: "PURCHASE", itemId: split.created.id })).interpretation,
      ).toMatchObject({ kind: "INTERPRETED", decimal: "1.00" });
    });
  },
);
