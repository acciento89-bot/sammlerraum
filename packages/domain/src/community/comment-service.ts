import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@sammlerraum/db/search-sql";
import { CommunityError, type FavoriteTarget } from "@sammlerraum/contracts/community";
import {
  CreateCommentSchema,
  CommentListSchema,
  CommentPolicySchema,
  CommentHideSchema,
} from "@sammlerraum/contracts/comments";
import type { SearchReadTransaction } from "../search/search-read";
import type { CommunityDatabase } from "./social-service";
import { communityActor, communityTransaction, type CommunityActor } from "./community-transaction";
import {
  loadPublicCommunityTarget,
  lockCommunityParticipants,
  assertCommunityInteraction,
  notBlocked,
} from "./social-scope";
function fail(code: CommunityError["code"]): never {
  throw new CommunityError(code);
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) return fail("COMMUNITY_INVALID");
  return result.data;
}
export type CommentMeta = {
  id: string;
  authorId: string;
  collectionId: string;
  itemId: string | null;
  parentId: string | null;
  ownerId: string;
  deletedAt: Date | null;
  ownerHiddenAt: Date | null;
  moderationHiddenAt: Date | null;
};
export async function loadCommentMeta(tx: SearchReadTransaction, id: string): Promise<CommentMeta> {
  const [row] = await tx.$queryRaw<CommentMeta[]>(
    Prisma.sql`SELECT cm.id,cm."authorId",cm."collectionId",cm."itemId",cm."parentId",cm."deletedAt",cm."ownerHiddenAt",cm."moderationHiddenAt",c."ownerId" FROM "CommunityComment" cm JOIN "Collection" c ON c.id=cm."collectionId" WHERE cm.id=${id}::uuid`,
  );
  if (!row) return fail("NOT_FOUND");
  return row;
}
export function commentTarget(meta: Pick<CommentMeta, "itemId" | "collectionId">): FavoriteTarget {
  return meta.itemId
    ? { type: "ITEM", id: meta.itemId }
    : { type: "COLLECTION", id: meta.collectionId };
}
/** cm is a trusted fixed alias; hidden/deleted/blocked ancestry cannot reappear as visible replies. */
export function visibleCommentTree(actor: string | null) {
  return Prisma.sql`coalesce((WITH RECURSIVE chain AS (
 SELECT x.id,x."parentId",x."authorId",x."ownerHiddenAt",x."moderationHiddenAt",x."deletedAt",ARRAY[x.id] AS path,false AS cycle,0 AS depth FROM "CommunityComment" x WHERE x.id=cm.id
 UNION ALL SELECT p.id,p."parentId",p."authorId",p."ownerHiddenAt",p."moderationHiddenAt",p."deletedAt",a.path||p.id,p.id=ANY(a.path),a.depth+1 FROM "CommunityComment" p JOIN chain a ON p.id=a."parentId" WHERE NOT a.cycle AND a.depth<32
 ) SELECT bool_and("ownerHiddenAt" IS NULL AND "moderationHiddenAt" IS NULL AND "deletedAt" IS NULL AND NOT cycle AND ${actor === null ? Prisma.sql`true` : notBlocked(actor, Prisma.sql`chain."authorId"`)}) AND bool_or("parentId" IS NULL) FROM chain),false)`;
}
type PublicCommentRow = {
  id: string;
  parentId: string | null;
  body: string;
  createdAt: Date;
  authorId: string;
  handle: string | null;
  displayName: string | null;
  avatarAssetId: string | null;
};
function dto(row: PublicCommentRow) {
  return {
    id: row.id,
    parentId: row.parentId,
    body: row.body,
    createdAt: new Date(row.createdAt).toISOString(),
    author: {
      userId: row.authorId,
      handle: row.handle,
      displayName: row.displayName,
      avatarAssetId: row.avatarAssetId,
    },
  };
}
async function postingPolicy(
  tx: SearchReadTransaction,
  ownerId: string,
  collectionId: string,
  itemId: string | null,
) {
  const [row] = await tx.$queryRaw<{ global: boolean; collection: boolean; item: boolean }[]>(
    Prisma.sql`SELECT coalesce(p."commentsEnabled",true) AS global,c."commentsEnabled" AS collection,coalesce(i."commentsEnabled",true) AS item FROM "Collection" c LEFT JOIN "CommunityPreference" p ON p."userId"=c."ownerId" LEFT JOIN "CollectibleItem" i ON i.id=${itemId}::uuid AND i."collectionId"=c.id WHERE c.id=${collectionId}::uuid AND c."ownerId"=${ownerId}`,
  );
  if (!row) return fail("NOT_FOUND");
  return { ...row, enabled: row.global && row.collection && row.item };
}
async function parentFence(tx: SearchReadTransaction, collectionId: string, ownerId: string) {
  const [row] = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id FROM "Collection" WHERE id=${collectionId}::uuid AND "ownerId"=${ownerId} FOR SHARE`,
  );
  if (!row) return fail("COMMUNITY_CONFLICT");
}
export function createCommentService(db: CommunityDatabase) {
  async function mutate<T>(
    who: CommunityActor,
    idInput: string,
    work: (tx: SearchReadTransaction, actor: string, meta: CommentMeta) => Promise<T>,
  ) {
    const actor = communityActor(who),
      id = parse(z.uuid(), idInput);
    return communityTransaction(db, async (tx) => {
      const initial = await loadCommentMeta(tx, id);
      await lockCommunityParticipants(tx, [actor, initial.authorId, initial.ownerId]);
      await parentFence(tx, initial.collectionId, initial.ownerId);
      const [locked] = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM "CommunityComment" WHERE id=${id}::uuid FOR UPDATE`,
      );
      if (!locked) return fail("NOT_FOUND");
      const meta = await loadCommentMeta(tx, id);
      if (meta.ownerId !== initial.ownerId) return fail("COMMUNITY_CONFLICT");
      return work(tx, actor, meta);
    });
  }
  return {
    async createComment(who: CommunityActor, input: unknown) {
      const actor = communityActor(who),
        value = parse(CreateCommentSchema, input);
      return communityTransaction(db, async (tx) => {
        const initial = await loadPublicCommunityTarget(tx, value.target),
          parent = value.parentId
            ? await loadCommentMeta(tx, value.parentId).catch((error) => {
                if (error instanceof CommunityError && error.code === "NOT_FOUND")
                  return fail("COMMENT_PARENT_INVALID");
                throw error;
              })
            : null;
        if (
          parent &&
          (parent.collectionId !== initial.collectionId ||
            parent.itemId !== (value.target.type === "ITEM" ? value.target.id : null))
        )
          return fail("COMMENT_PARENT_INVALID");
        await lockCommunityParticipants(tx, [
          actor,
          initial.ownerId,
          ...(parent ? [parent.authorId] : []),
        ]);
        await parentFence(tx, initial.collectionId, initial.ownerId);
        const fresh = await loadPublicCommunityTarget(tx, value.target);
        if (fresh.ownerId !== initial.ownerId) return fail("COMMUNITY_CONFLICT");
        await assertCommunityInteraction(tx, actor, fresh.ownerId);
        if (parent) await assertCommunityInteraction(tx, actor, parent.authorId);
        const itemId = value.target.type === "ITEM" ? value.target.id : null,
          policy = await postingPolicy(tx, fresh.ownerId, fresh.collectionId, itemId);
        if (!policy.enabled) return fail("COMMENTS_DISABLED");
        if (parent) {
          const [allowed] = await tx.$queryRaw<{ id: string }[]>(
            Prisma.sql`SELECT cm.id FROM "CommunityComment" cm WHERE cm.id=${parent.id}::uuid AND ${visibleCommentTree(actor)} FOR SHARE OF cm`,
          );
          if (!allowed) return fail("COMMENT_PARENT_INVALID");
        }
        const [quota] = await tx.$queryRaw<{ count: bigint }[]>(
          Prisma.sql`SELECT count(*) FROM "CommunityComment" WHERE "authorId"=${actor} AND "createdAt">=timezone('UTC',clock_timestamp())::date`,
        );
        if (!quota || quota.count >= 500n) return fail("COMMUNITY_LIMIT");
        const id = randomUUID();
        await tx.$queryRaw(
          Prisma.sql`INSERT INTO "CommunityComment"(id,"authorId","collectionId","itemId","parentId",body)VALUES(${id}::uuid,${actor},${fresh.collectionId}::uuid,${itemId}::uuid,${value.parentId}::uuid,${value.body})`,
        );
        const [row] = await tx.$queryRaw<PublicCommentRow[]>(
          Prisma.sql`SELECT cm.id,cm."parentId",cm.body,cm."createdAt",cm."authorId",p.handle,p."displayName",p."avatarAssetId" FROM "CommunityComment" cm LEFT JOIN "UserProfile" p ON p."userId"=cm."authorId" WHERE cm.id=${id}::uuid`,
        );
        if (!row) return fail("COMMUNITY_CONFLICT");
        return dto(row);
      });
    },
    async listComments(who: CommunityActor | null, input: unknown) {
      const value = parse(CommentListSchema, input),
        actor = who === null ? null : communityActor(who);
      return communityTransaction(db, async (tx) => {
        const initial = await loadPublicCommunityTarget(tx, value.target);
        await lockCommunityParticipants(tx, [...(actor ? [actor] : []), initial.ownerId], "READ");
        await parentFence(tx, initial.collectionId, initial.ownerId);
        const fresh = await loadPublicCommunityTarget(tx, value.target);
        if (fresh.ownerId !== initial.ownerId) return fail("COMMUNITY_CONFLICT");
        if (actor) await assertCommunityInteraction(tx, actor, fresh.ownerId);
        const itemId = value.target.type === "ITEM" ? value.target.id : null,
          rows = await tx.$queryRaw<PublicCommentRow[]>(
            Prisma.sql`SELECT cm.id,cm."parentId",cm.body,cm."createdAt",cm."authorId",p.handle,p."displayName",p."avatarAssetId" FROM "CommunityComment" cm LEFT JOIN "UserProfile" p ON p."userId"=cm."authorId" WHERE cm."collectionId"=${fresh.collectionId}::uuid AND cm."itemId" IS NOT DISTINCT FROM ${itemId}::uuid AND ${visibleCommentTree(actor)} ${value.afterId ? Prisma.sql`AND cm.id>${value.afterId}::uuid` : Prisma.empty} ORDER BY cm.id LIMIT ${value.limit + 1}`,
          );
        const policy = await postingPolicy(tx, fresh.ownerId, fresh.collectionId, itemId);
        return {
          comments: rows.slice(0, value.limit).map(dto),
          next: rows.length > value.limit ? rows[value.limit - 1]!.id : null,
          commentsEnabled: policy.enabled,
        };
      });
    },
    async deleteOwnComment(who: CommunityActor, id: string) {
      return mutate(who, id, async (tx, actor, meta) => {
        if (meta.authorId !== actor) return fail("NOT_FOUND");
        await tx.$queryRaw(
          Prisma.sql`UPDATE "CommunityComment" SET "deletedAt"=coalesce("deletedAt",timezone('UTC',clock_timestamp())),body=CASE WHEN EXISTS(SELECT 1 FROM "CommunityReport" r WHERE r."commentId"=${meta.id}::uuid AND r.status='OPEN') THEN body ELSE '' END WHERE id=${meta.id}::uuid`,
        );
        return { id: meta.id, deleted: true };
      });
    },
    async moderateOwnContentComment(who: CommunityActor, id: string, input: unknown) {
      const value = parse(CommentHideSchema, input);
      return mutate(who, id, async (tx, actor, meta) => {
        if (meta.ownerId !== actor) return fail("NOT_FOUND");
        await tx.$queryRaw(
          Prisma.sql`UPDATE "CommunityComment" SET "ownerHiddenAt"=${value.hidden ? Prisma.sql`timezone('UTC',clock_timestamp())` : Prisma.sql`NULL`} WHERE id=${meta.id}::uuid`,
        );
        return { id: meta.id, hidden: value.hidden };
      });
    },
    async setCommentPolicy(who: CommunityActor, input: unknown) {
      const actor = communityActor(who),
        value = parse(CommentPolicySchema, input);
      return communityTransaction(db, async (tx) => {
        await lockCommunityParticipants(tx, [actor]);
        if (value.scope === "GLOBAL") {
          await tx.$queryRaw(
            Prisma.sql`INSERT INTO "CommunityPreference"("userId","commentsEnabled")VALUES(${actor},${value.enabled}) ON CONFLICT("userId")DO UPDATE SET "commentsEnabled"=EXCLUDED."commentsEnabled"`,
          );
          return value;
        }
        if (value.scope === "COLLECTION") {
          const rows = await tx.$queryRaw<{ id: string }[]>(
            Prisma.sql`UPDATE "Collection" SET "commentsEnabled"=${value.enabled},"updatedAt"=timezone('UTC',clock_timestamp()) WHERE id=${value.targetId}::uuid AND "ownerId"=${actor} AND "deletedAt" IS NULL RETURNING id`,
          );
          if (!rows.length) return fail("NOT_FOUND");
          return value;
        }
        const [source] = await tx.$queryRaw<{ collectionId: string }[]>(
          Prisma.sql`SELECT i."collectionId" FROM "CollectibleItem" i JOIN "Collection" c ON c.id=i."collectionId" WHERE i.id=${value.targetId}::uuid AND i."ownerId"=${actor} AND c."ownerId"=${actor} AND i."deletedAt" IS NULL AND c."deletedAt" IS NULL`,
        );
        if (!source) return fail("NOT_FOUND");
        await parentFence(tx, source.collectionId, actor);
        await tx.$queryRaw(
          Prisma.sql`UPDATE "CollectibleItem" SET "commentsEnabled"=${value.enabled},"updatedAt"=timezone('UTC',clock_timestamp()) WHERE id=${value.targetId}::uuid AND "ownerId"=${actor}`,
        );
        return value;
      });
    },
    async getOwnCommentPolicy(who: CommunityActor, targetInput: unknown) {
      const actor = communityActor(who),
        target = parse(CreateCommentSchema.shape.target, targetInput);
      return communityTransaction(db, async (tx) => {
        await lockCommunityParticipants(tx, [actor], "READ");
        const [scope] =
          target.type === "COLLECTION"
            ? await tx.$queryRaw<{ id: string }[]>(
                Prisma.sql`SELECT id FROM "Collection" WHERE id=${target.id}::uuid AND "ownerId"=${actor} AND "deletedAt" IS NULL FOR SHARE`,
              )
            : await tx.$queryRaw<{ id: string }[]>(
                Prisma.sql`SELECT c.id FROM "Collection" c JOIN "CollectibleItem" i ON i."collectionId"=c.id WHERE i.id=${target.id}::uuid AND c."ownerId"=${actor} AND i."ownerId"=${actor} AND c."deletedAt" IS NULL AND i."deletedAt" IS NULL FOR SHARE OF c`,
              );
        if (!scope) return fail("NOT_FOUND");
        return postingPolicy(tx, actor, scope.id, target.type === "ITEM" ? target.id : null);
      });
    },
  };
}
