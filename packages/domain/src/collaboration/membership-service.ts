import { BillingError } from "@sammlerraum/contracts/billing";
import {
  quotaIsBounded,
  lockBillingQuotaSubject,
  assertQuotaInTransaction,
} from "../billing/admission";
import { loadCollectionReadAccess as load, type Parent, type Role } from "./collection-read-access";
import { createTrustedAuditContext } from "../audit/audit-context";
import { recordAuditEventInTransaction } from "../audit/audit-service";
import { runTransferTransaction, type MembershipDatabase } from "./transfer-transaction";
import { transferPrivateTags } from "./transfer-tags";
import { transferPrivateLocations } from "./transfer-locations";
import { retirePrivateImports } from "./transfer-imports";
import { requireClosedMoneyTransferScope } from "./transfer-money";
import { lockPrivateTransferMedia, transferPrivateMedia } from "./transfer-media";
import { createTrustedResourceFacts } from "../authz/types";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@sammlerraum/db/search-sql";
import {
  MembershipError,
  MembershipActorIdSchema,
  MembershipCollectionIdSchema,
  MemberMutationSchema,
  MemberRemovalSchema,
  OwnershipTransferSchema,
  MEMBERSHIP_MAX_MEMBERS,
} from "@sammlerraum/contracts/collaboration";
import { runSearchTransaction, type BoundedSearchReadTransaction } from "../search/search-read";
type Actor = { userId: string };
type Member = { userId: string; role: Role };
function fail(code: MembershipError["code"]): never {
  throw new MembershipError(code);
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) return fail("MEMBERSHIP_INVALID");
  return result.data;
}
function actor(who: Actor) {
  return parse(MembershipActorIdSchema, who?.userId);
}
/** Server-side private memberships. No supplied role is authorization. */
export function createMembershipService(database: MembershipDatabase) {
  async function auditIdentity(tx: BoundedSearchReadTransaction, userId: string) {
    const [identity] = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM "user" WHERE id=${userId} FOR NO KEY UPDATE`,
    );
    if (!identity) return fail("MEMBERSHIP_NOT_FOUND");
    return createTrustedAuditContext({ source: "USER", actorId: userId });
  }
  function revision(parent: Parent, expected: number) {
    if (parent.collaborationRevision !== expected || parent.collaborationRevision >= 2147483647)
      return fail("MEMBERSHIP_CONFLICT");
  }
  function manage(role: Role) {
    if (role !== "OWNER" && role !== "ADMIN") return fail("MEMBERSHIP_FORBIDDEN");
  }
  async function state(tx: BoundedSearchReadTransaction, parent: Parent) {
    const rows = await tx.$queryRaw<Member[]>(
      Prisma.sql`SELECT "userId",role FROM "CollectionMember" WHERE "collectionId"=${parent.id}::uuid ORDER BY "userId" COLLATE "C" LIMIT ${MEMBERSHIP_MAX_MEMBERS}`,
    );
    if (rows.length >= MEMBERSHIP_MAX_MEMBERS) return fail("MEMBERSHIP_LIMIT_EXCEEDED");
    return {
      collectionId: parent.id,
      ownerId: parent.ownerId,
      revision: parent.collaborationRevision,
      members: [{ userId: parent.ownerId, role: "OWNER" as Role }, ...rows],
    };
  }
  async function advance(tx: BoundedSearchReadTransaction, parent: Parent) {
    const [next] = await tx.$queryRaw<Parent[]>(
      Prisma.sql`UPDATE "Collection" SET "collaborationRevision"="collaborationRevision"+1,"updatedAt"=timezone('UTC',clock_timestamp()) WHERE id=${parent.id}::uuid AND "collaborationRevision"=${parent.collaborationRevision} RETURNING id,"ownerId",visibility,"collaborationRevision"`,
    );
    if (!next) return fail("MEMBERSHIP_CONFLICT");
    return next;
  }
  async function member(tx: BoundedSearchReadTransaction, collectionId: string, userId: string) {
    const [row] = await tx.$queryRaw<Member[]>(
      Prisma.sql`SELECT "userId",role FROM "CollectionMember" WHERE "collectionId"=${collectionId}::uuid AND "userId"=${userId}`,
    );
    return row;
  }
  async function verifiedUser(tx: BoundedSearchReadTransaction, userId: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM "user" WHERE id=${userId} AND "emailVerified" FOR KEY SHARE`,
    );
    if (rows.length !== 1) return fail("MEMBERSHIP_NOT_FOUND");
  }
  return {
    async getCollectionAuthorizationFacts(who: Actor, input: unknown) {
      const userId = actor(who),
        collectionId = parse(MembershipCollectionIdSchema, input);
      return runSearchTransaction(database, async (tx) => {
        const { parent, role } = await load(tx, collectionId, userId);
        return createTrustedResourceFacts({
          type: "COLLECTION",
          ownerId: parent.ownerId,
          visibility: parent.visibility,
          ancestorVisibility: [],
          role: { userId, role },
          moderation: "VISIBLE",
          interactionBlocked: false,
        });
      });
    },
    async getMembershipState(who: Actor, input: unknown) {
      const userId = actor(who),
        collectionId = parse(MembershipCollectionIdSchema, input);
      return runSearchTransaction(database, async (tx) => {
        const { parent } = await load(tx, collectionId, userId);
        return state(tx, parent);
      });
    },
    async addMember(who: Actor, input: unknown) {
      const userId = actor(who),
        value = parse(MemberMutationSchema, input);
      return runTransferTransaction(database, async (tx) => {
        const audit = await auditIdentity(tx, userId);
        const { parent, role } = await load(tx, value.collectionId, userId, true);
        manage(role);
        revision(parent, value.expectedRevision);
        if (value.userId === parent.ownerId) return fail("MEMBERSHIP_OWNER_REQUIRED");
        if (role !== "OWNER" && value.role === "ADMIN") return fail("MEMBERSHIP_FORBIDDEN");
        await verifiedUser(tx, value.userId);
        if (await member(tx, parent.id, value.userId)) return fail("MEMBERSHIP_CONFLICT");
        const before = await state(tx, parent);
        if (before.members.length >= MEMBERSHIP_MAX_MEMBERS)
          return fail("MEMBERSHIP_LIMIT_EXCEEDED");
        await tx.$queryRaw(
          Prisma.sql`INSERT INTO "CollectionMember" ("collectionId","userId",role) VALUES (${parent.id}::uuid,${value.userId},${value.role}::"CollectionMemberRole") RETURNING "userId"`,
        );
        await recordAuditEventInTransaction(tx, audit, {
          resourceType: "COLLECTION",
          resourceId: parent.id,
          action: "MEMBERSHIP_ADDED",
          subjectUserId: value.userId,
          before: { role: null },
          after: { role: value.role },
        });
        return state(tx, await advance(tx, parent));
      });
    },
    async changeRole(who: Actor, input: unknown) {
      const userId = actor(who),
        value = parse(MemberMutationSchema, input);
      return runTransferTransaction(database, async (tx) => {
        const audit = await auditIdentity(tx, userId);
        const { parent, role } = await load(tx, value.collectionId, userId, true);
        manage(role);
        revision(parent, value.expectedRevision);
        if (value.userId === parent.ownerId) return fail("MEMBERSHIP_OWNER_REQUIRED");
        const target = await member(tx, parent.id, value.userId);
        if (!target) return fail("MEMBERSHIP_NOT_FOUND");
        if (role !== "OWNER" && (value.role === "ADMIN" || target.role === "ADMIN"))
          return fail("MEMBERSHIP_FORBIDDEN");
        if (target.role === value.role) return state(tx, parent);
        await recordAuditEventInTransaction(tx, audit, {
          resourceType: "COLLECTION",
          resourceId: parent.id,
          action: "MEMBERSHIP_ROLE_CHANGED",
          subjectUserId: value.userId,
          before: { role: target.role },
          after: { role: value.role },
        });
        await tx.$queryRaw(
          Prisma.sql`UPDATE "CollectionMember" SET role=${value.role}::"CollectionMemberRole","updatedAt"=timezone('UTC',clock_timestamp()) WHERE "collectionId"=${parent.id}::uuid AND "userId"=${value.userId} RETURNING "userId"`,
        );
        return state(tx, await advance(tx, parent));
      });
    },
    async removeMember(who: Actor, input: unknown) {
      const userId = actor(who),
        value = parse(MemberRemovalSchema, input);
      return runTransferTransaction(database, async (tx) => {
        const audit = await auditIdentity(tx, userId);
        const { parent, role } = await load(tx, value.collectionId, userId, true);
        revision(parent, value.expectedRevision);
        if (value.userId === parent.ownerId) return fail("MEMBERSHIP_OWNER_REQUIRED");
        const target = await member(tx, parent.id, value.userId);
        if (!target) return fail("MEMBERSHIP_NOT_FOUND");
        if (value.userId !== userId) {
          manage(role);
          if (role !== "OWNER" && target.role === "ADMIN") return fail("MEMBERSHIP_FORBIDDEN");
        }
        await recordAuditEventInTransaction(tx, audit, {
          resourceType: "COLLECTION",
          resourceId: parent.id,
          action: "MEMBERSHIP_REMOVED",
          subjectUserId: value.userId,
          before: { role: target.role },
          after: { role: null },
        });
        await tx.$queryRaw(
          Prisma.sql`DELETE FROM "CollectionMember" WHERE "collectionId"=${parent.id}::uuid AND "userId"=${value.userId} RETURNING "userId"`,
        );
        return state(tx, await advance(tx, parent));
      });
    },
    async transferOwnership(who: Actor, input: unknown) {
      const userId = actor(who),
        value = parse(OwnershipTransferSchema, input);
      return runTransferTransaction(database, async (tx) => {
        if (value.newOwnerId === userId) return fail("MEMBERSHIP_INVALID");
        // Stable user locks precede parent/items, matching account erasure and hierarchy edits.
        const users = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM "user" WHERE id IN (${userId},${value.newOwnerId}) ORDER BY id COLLATE "C" FOR NO KEY UPDATE`,
        );
        if (users.length !== 2) return fail("MEMBERSHIP_NOT_FOUND");
        if (
          ["ITEM_CREATE", "MEDIA_COUNT", "MEDIA_BYTES"].some((feature) =>
            quotaIsBounded(feature as "ITEM_CREATE" | "MEDIA_COUNT" | "MEDIA_BYTES"),
          )
        ) {
          for (const id of [userId, value.newOwnerId].sort()) await lockBillingQuotaSubject(tx, id);
        }
        const { parent, role } = await load(tx, value.collectionId, userId, true);
        if (role !== "OWNER") return fail("MEMBERSHIP_FORBIDDEN");
        revision(parent, value.expectedRevision);
        if (value.newOwnerId === parent.ownerId) return fail("MEMBERSHIP_INVALID");
        const recipient = await member(tx, parent.id, value.newOwnerId);
        if (!recipient) return fail("MEMBERSHIP_NOT_FOUND");
        await verifiedUser(tx, value.newOwnerId);
        // Parent first, then every item in stable order. This fences existing/new child writers.
        const lockedItems = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM "CollectibleItem" WHERE "collectionId"=${parent.id}::uuid AND "ownerId"=${parent.ownerId} ORDER BY id LIMIT 1001 FOR UPDATE`,
        );
        if (lockedItems.length > 1000) return fail("MEMBERSHIP_LIMIT_EXCEEDED");
        await requireClosedMoneyTransferScope(tx, parent.id);
        const [certificateConflict] = await tx.$queryRaw<{ conflict: boolean }[]>(
          Prisma.sql`SELECT EXISTS(SELECT 1 FROM "Grading" source JOIN "CollectibleItem" item ON item.id=source."itemId" JOIN "Grading" target ON target."ownerId"=${value.newOwnerId} AND target."providerKey"=source."providerKey" AND target."certificateKey"=source."certificateKey" WHERE item."collectionId"=${parent.id}::uuid) AS conflict`,
        );
        if (certificateConflict?.conflict) return fail("MEMBERSHIP_CONFLICT");
        const assetIds = await lockPrivateTransferMedia(tx, parent.id, parent.ownerId);
        if (quotaIsBounded("ITEM_CREATE")) {
          const [count] = await tx.$queryRaw<{ amount: string }[]>(
            Prisma.sql`SELECT count(*)::text AS amount FROM "CollectibleItem" WHERE "collectionId"=${parent.id}::uuid AND "ownerId"=${parent.ownerId} AND "deletedAt" IS NULL`,
          );
          const amount = Number(count?.amount);
          if (!Number.isSafeInteger(amount) || amount < 0)
            throw new BillingError("PLAN_LIMIT_REACHED");
          if (amount) await assertQuotaInTransaction(tx, value.newOwnerId, "ITEM_CREATE", amount);
        }
        if (assetIds.length) {
          await assertQuotaInTransaction(tx, value.newOwnerId, "MEDIA_COUNT", assetIds.length);
          if (quotaIsBounded("MEDIA_BYTES")) {
            const [size] = await tx.$queryRaw<{ bytes: string }[]>(
              Prisma.sql`SELECT COALESCE(sum("byteSize"),0)::text AS bytes FROM "MediaAsset" WHERE id=ANY(${assetIds}::uuid[])`,
            );
            const bytes = Number(size?.bytes);
            if (!Number.isSafeInteger(bytes) || bytes < 0)
              throw new BillingError("PLAN_LIMIT_REACHED");
            if (bytes) await assertQuotaInTransaction(tx, value.newOwnerId, "MEDIA_BYTES", bytes);
          }
        }
        await retirePrivateImports(tx, parent.id, parent.ownerId);
        await transferPrivateTags(tx, parent.id, parent.ownerId, value.newOwnerId);
        await tx.$queryRaw(
          Prisma.sql`SET CONSTRAINTS "InsuranceRecord_collectionId_ownerId_fkey", "InsuranceRecord_itemId_ownerId_fkey", "Valuation_itemId_ownerId_fkey", "Grading_itemId_ownerId_itemQuantity_fkey", "MediaLink_itemId_ownerId_fkey", "DocumentLink_itemId_ownerId_fkey" DEFERRED`,
        );
        await tx.$queryRaw(
          Prisma.sql`INSERT INTO "CollectionOwnershipTransfer" (id,"collectionId","fromOwnerId","toOwnerId","actorId","fromRevision","toRevision","transactionId") VALUES (${randomUUID()}::uuid,${parent.id}::uuid,${parent.ownerId},${value.newOwnerId},${userId},${parent.collaborationRevision},${parent.collaborationRevision + 1},pg_current_xact_id()::text) RETURNING id`,
        );
        await recordAuditEventInTransaction(
          tx,
          createTrustedAuditContext({ source: "USER", actorId: userId }),
          {
            resourceType: "COLLECTION",
            resourceId: parent.id,
            action: "COLLECTION_OWNERSHIP_TRANSFERRED",
            subjectUserId: value.newOwnerId,
            before: { role: recipient.role, previousOwnerRole: "OWNER" },
            after: { role: "OWNER", previousOwnerRole: "ADMIN" },
          },
        );
        await transferPrivateLocations(tx, parent.id, parent.ownerId, value.newOwnerId);
        await transferPrivateMedia(tx, assetIds, value.newOwnerId);
        await tx.$queryRaw(
          Prisma.sql`UPDATE "Grading" SET "ownerId"=${value.newOwnerId} WHERE "ownerId"=${parent.ownerId} AND "itemId" IN(SELECT id FROM "CollectibleItem" WHERE "collectionId"=${parent.id}::uuid) RETURNING id`,
        );
        await tx.$queryRaw(
          Prisma.sql`UPDATE "Valuation" SET "ownerId"=${value.newOwnerId},"ownershipTransferred"=true WHERE "ownerId"=${parent.ownerId} AND "itemId" IN(SELECT id FROM "CollectibleItem" WHERE "collectionId"=${parent.id}::uuid) RETURNING id`,
        );
        await tx.$queryRaw(
          Prisma.sql`UPDATE "InsuranceRecord" SET "ownerId"=${value.newOwnerId},revision=revision+1,"updatedAt"=GREATEST("updatedAt",timezone('UTC',clock_timestamp())) WHERE "ownerId"=${parent.ownerId} AND ("collectionId"=${parent.id}::uuid OR "itemId" IN(SELECT id FROM "CollectibleItem" WHERE "collectionId"=${parent.id}::uuid)) RETURNING id`,
        );
        await tx.$queryRaw(
          Prisma.sql`DELETE FROM "CollectionMember" WHERE "collectionId"=${parent.id}::uuid AND "userId"=${value.newOwnerId} RETURNING "userId"`,
        );
        const [next] = await tx.$queryRaw<Parent[]>(
          Prisma.sql`UPDATE "Collection" SET "ownerId"=${value.newOwnerId},"collaborationRevision"="collaborationRevision"+1,"updatedAt"=timezone('UTC',clock_timestamp()) WHERE id=${parent.id}::uuid AND "collaborationRevision"=${parent.collaborationRevision} RETURNING id,"ownerId",visibility,"collaborationRevision"`,
        );
        if (!next) return fail("MEMBERSHIP_CONFLICT");
        await tx.$queryRaw(
          Prisma.sql`INSERT INTO "CollectionMember" ("collectionId","userId",role) VALUES (${parent.id}::uuid,${parent.ownerId},'ADMIN') RETURNING "userId"`,
        );
        return state(tx, next);
      });
    },
  };
}
