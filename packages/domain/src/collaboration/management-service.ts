import { CollaborativeWorkspaceItemSchema } from "@sammlerraum/contracts/items";
import {
  AuditEventSchema,
  AuditResourceQuerySchema,
  AuditError,
} from "@sammlerraum/contracts/audit";
import { z } from "zod";
import { Prisma } from "@sammlerraum/db/search-sql";
import {
  MembershipActorIdSchema,
  MembershipCollectionIdSchema,
  MembershipError,
} from "@sammlerraum/contracts/collaboration";
import { SharePermissionsSchema } from "@sammlerraum/contracts/sharing";
import { runSearchTransaction } from "../search/search-read";
import type { MembershipDatabase } from "./transfer-transaction";
const inputSchema = z
  .object({ collectionId: MembershipCollectionIdSchema, afterShareId: z.uuid().optional() })
  .strict();
type ShareRow = {
  id: string;
  revision: number;
  targetKind: "COLLECTION" | "NODE" | "ITEM";
  targetId: string;
  recipientUserId: string | null;
  permissions: unknown;
  expiresAt: Date | null;
  revoked: boolean;
  pinRequired: boolean;
};
/** Owner-only editor metadata: bounded named targets, never bearer tokens, PIN hashes or asset keys. */
export function createCollaborationManagementService(database: MembershipDatabase) {
  return {
    async getSharedCollections(who: { userId: string }, input: unknown) {
      const actor = MembershipActorIdSchema.safeParse(who?.userId),
        query = z.object({ afterCollectionId: z.uuid().optional() }).strict().safeParse(input);
      if (!actor.success || !query.success) throw new MembershipError("MEMBERSHIP_INVALID");
      return runSearchTransaction(database, async (tx) => {
        const rows = await tx.$queryRaw<
          { id: string; name: string; role: "ADMIN" | "EDITOR" | "VIEWER" }[]
        >(
          Prisma.sql`SELECT c.id,c.name,m.role FROM "CollectionMember" m JOIN "Collection" c ON c.id=m."collectionId" WHERE m."userId"=${actor.data} AND c."deletedAt" IS NULL ${query.data.afterCollectionId ? Prisma.sql`AND c.id>${query.data.afterCollectionId}::uuid` : Prisma.empty} ORDER BY c.id LIMIT 51`,
        );
        return { collections: rows.slice(0, 50), next: rows.length > 50 ? rows[49]!.id : null };
      });
    },
    async getWorkspace(who: { userId: string }, input: unknown) {
      const actor = MembershipActorIdSchema.safeParse(who?.userId),
        query = z
          .object({ collectionId: MembershipCollectionIdSchema, afterItemId: z.uuid().optional() })
          .strict()
          .safeParse(input);
      if (!actor.success || !query.success) throw new MembershipError("MEMBERSHIP_INVALID");
      return runSearchTransaction(database, async (tx) => {
        const [parent] = await tx.$queryRaw<
          {
            id: string;
            name: string;
            ownerId: string;
            visibility: "PRIVATE" | "UNLISTED" | "PUBLIC";
            updatedAt: string;
            latestSequence: string | null;
            actorRole: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
          }[]
        >(
          Prisma.sql`SELECT c.id,c.name,c.visibility,to_char(c."updatedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt",(SELECT max(e.sequence)::text FROM "AuditEvent" e WHERE e."collectionId"=c.id) AS "latestSequence",c."ownerId",CASE WHEN c."ownerId"=${actor.data} THEN 'OWNER' ELSE m.role::text END AS "actorRole" FROM "Collection" c LEFT JOIN "CollectionMember" m ON m."collectionId"=c.id AND m."userId"=${actor.data} WHERE c.id=${query.data.collectionId}::uuid AND c."deletedAt" IS NULL AND (c."ownerId"=${actor.data} OR m."userId" IS NOT NULL)`,
        );
        if (!parent) throw new MembershipError("MEMBERSHIP_NOT_FOUND");
        const rows = await tx.$queryRaw<unknown[]>(
            Prisma.sql`SELECT to_char(i."updatedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt",(SELECT max(e.sequence)::text FROM "AuditEvent" e WHERE e."resourceType"='ITEM' AND e."resourceId"=i.id) AS "latestSequence",i.id,i."collectionId",i."nodeId",i.title,i."publicDescription",i.quantity,i."acquisitionType",to_char(i."acquisitionDate",'YYYY-MM-DD') AS "acquisitionDate",i.visibility,i."tradeStatus",to_char(i."archivedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "archivedAt",to_char(i."disposedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "disposedAt" FROM "CollectibleItem" i WHERE i."collectionId"=${parent.id}::uuid AND i."ownerId"=${parent.ownerId} AND i."deletedAt" IS NULL ${query.data.afterItemId ? Prisma.sql`AND i.id>${query.data.afterItemId}::uuid` : Prisma.empty} ORDER BY i.id LIMIT 51`,
          ),
          nodes = await tx.$queryRaw<
            {
              id: string;
              name: string;
              parentId: string | null;
              visibility: "PRIVATE" | "UNLISTED" | "PUBLIC";
            }[]
          >(
            Prisma.sql`SELECT id,name,"parentId",visibility FROM "CollectionNode" WHERE "collectionId"=${parent.id}::uuid ORDER BY id LIMIT 101`,
          );
        const items = rows.slice(0, 50).map((row) => CollaborativeWorkspaceItemSchema.parse(row));
        return {
          collection: {
            id: parent.id,
            name: parent.name,
            visibility: parent.visibility,
            updatedAt: parent.updatedAt,
            latestSequence: parent.latestSequence,
          },
          actorRole: parent.actorRole,
          items,
          nodes: nodes.slice(0, 100),
          moreNodes: nodes.length > 100,
          next: rows.length > 50 ? items.at(-1)!.id : null,
        };
      });
    },
    async getAuditOverview(who: { userId: string }, input: unknown) {
      const user = MembershipActorIdSchema.safeParse(who?.userId),
        query = AuditResourceQuerySchema.pick({ limit: true, beforeSequence: true }).safeParse(
          input,
        );
      if (!user.success || !query.success) throw new AuditError("AUDIT_INVALID");
      return runSearchTransaction(database, async (tx) => {
        const rows = await tx.$queryRaw<
          (Record<string, unknown> & { resourceName: string | null })[]
        >(
          Prisma.sql`SELECT e.id,e.sequence::text,e."resourceType",e."resourceId",e.action,e.source,e."actorId",e."subjectUserId",e.before,e.after,to_char(e."createdAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",coalesce(i.title,c.name,l.name) AS "resourceName" FROM "AuditEvent" e LEFT JOIN "CollectibleItem" i ON i.id=e."itemId" LEFT JOIN "Collection" c ON c.id=coalesce(e."collectionId",i."collectionId") LEFT JOIN "StorageLocation" l ON e."resourceType"='LOCATION' AND l.id=e."resourceId" WHERE (c."ownerId"=${user.data} OR e."locationOwnerUserId"=${user.data}) ${query.data.beforeSequence ? Prisma.sql`AND e.sequence<${query.data.beforeSequence}::bigint` : Prisma.empty} ORDER BY e.sequence DESC LIMIT ${query.data.limit + 1}`,
        );
        const events = rows.slice(0, query.data.limit).map(({ resourceName, ...event }) => ({
          ...AuditEventSchema.parse(event),
          resourceName,
        }));
        return { events, next: rows.length > query.data.limit ? events.at(-1)!.sequence : null };
      });
    },
    async getMemberDirectory(who: { userId: string }, collectionIdInput: unknown) {
      const userId = MembershipActorIdSchema.safeParse(who?.userId),
        id = MembershipCollectionIdSchema.safeParse(collectionIdInput);
      if (!userId.success || !id.success) throw new MembershipError("MEMBERSHIP_INVALID");
      return runSearchTransaction(database, async (tx) => {
        const [parent] = await tx.$queryRaw<
          {
            id: string;
            name: string;
            ownerId: string;
            revision: number;
            actorRole: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
          }[]
        >(
          Prisma.sql`SELECT c.id,c.name,c."ownerId",c."collaborationRevision" AS revision,CASE WHEN c."ownerId"=${userId.data} THEN 'OWNER' ELSE m.role::text END AS "actorRole" FROM "Collection" c LEFT JOIN "CollectionMember" m ON m."collectionId"=c.id AND m."userId"=${userId.data} WHERE c.id=${id.data}::uuid AND c."deletedAt" IS NULL AND (c."ownerId"=${userId.data} OR m."userId" IS NOT NULL)`,
        );
        if (!parent) throw new MembershipError("MEMBERSHIP_NOT_FOUND");
        const members = await tx.$queryRaw<
          { userId: string; name: string; role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER" }[]
        >(
          Prisma.sql`SELECT u.id AS "userId",u.name,CASE WHEN u.id=${parent.ownerId} THEN 'OWNER' ELSE m.role::text END AS role FROM "user" u LEFT JOIN "CollectionMember" m ON m."userId"=u.id AND m."collectionId"=${parent.id}::uuid WHERE u.id=${parent.ownerId} OR m."userId" IS NOT NULL ORDER BY CASE WHEN u.id=${parent.ownerId} THEN 0 ELSE 1 END,u.id COLLATE "C" LIMIT 201`,
        );
        return {
          collectionId: parent.id,
          name: parent.name,
          ownerId: parent.ownerId,
          revision: parent.revision,
          actorRole: parent.actorRole,
          members,
        };
      });
    },
    async getSharingSetup(who: { userId: string }, input: unknown) {
      const actor = MembershipActorIdSchema.safeParse(who?.userId),
        parsed = inputSchema.safeParse(input);
      if (!actor.success || !parsed.success) throw new MembershipError("MEMBERSHIP_INVALID");
      const value = parsed.data;
      return runSearchTransaction(database, async (tx) => {
        const [collection] = await tx.$queryRaw<{ id: string; name: string; revision: number }[]>(
          Prisma.sql`SELECT id,name,"collaborationRevision" AS revision FROM "Collection" WHERE id=${value.collectionId}::uuid AND "ownerId"=${actor.data} AND "deletedAt" IS NULL FOR SHARE`,
        );
        if (!collection) throw new MembershipError("MEMBERSHIP_NOT_FOUND");
        const items = await tx.$queryRaw<{ id: string; name: string }[]>(
            Prisma.sql`SELECT id,title AS name FROM "CollectibleItem" WHERE "collectionId"=${collection.id}::uuid AND "ownerId"=${actor.data} AND "deletedAt" IS NULL ORDER BY id LIMIT 101`,
          ),
          nodes = await tx.$queryRaw<{ id: string; name: string }[]>(
            Prisma.sql`SELECT id,name FROM "CollectionNode" WHERE "collectionId"=${collection.id}::uuid ORDER BY id LIMIT 101`,
          ),
          documents = await tx.$queryRaw<{ id: string; itemId: string; name: string }[]>(
            Prisma.sql`SELECT d.id,d."itemId",coalesce(d.title,a."originalFileName") AS name FROM "DocumentLink" d JOIN "CollectibleItem" i ON i.id=d."itemId" JOIN "MediaAsset" a ON a.id=d."assetId" AND a."ownerId"=d."ownerId" WHERE i."collectionId"=${collection.id}::uuid AND i."ownerId"=${actor.data} AND i."deletedAt" IS NULL AND a.status='READY' AND a."cleanupStartedAt" IS NULL ORDER BY d.id LIMIT 101`,
          );
        const rows = await tx.$queryRaw<ShareRow[]>(
          Prisma.sql`SELECT s.id,s.revision,s."targetKind",s."targetId",s."recipientUserId",s.permissions,s."expiresAt",(s."revokedAt" IS NOT NULL OR r."shareId" IS NOT NULL) AS revoked,(s."pinHash" IS NOT NULL) AS "pinRequired" FROM "CollectionShare" s LEFT JOIN "ShareRevocation" r ON r."shareId"=s.id WHERE s."collectionId"=${collection.id}::uuid ${value.afterShareId ? Prisma.sql`AND s.id>${value.afterShareId}::uuid` : Prisma.empty} ORDER BY s.id LIMIT 51`,
        );
        return {
          collection,
          targets: {
            items: items.slice(0, 100),
            nodes: nodes.slice(0, 100),
            documents: documents.slice(0, 100),
            moreItems: items.length > 100,
            moreNodes: nodes.length > 100,
            moreDocuments: documents.length > 100,
          },
          shares: rows.slice(0, 50).map((row) => ({
            id: row.id,
            revision: row.revision,
            target: { kind: row.targetKind, id: row.targetId },
            recipient: row.recipientUserId
              ? { kind: "USER" as const, userId: row.recipientUserId }
              : { kind: "TOKEN" as const },
            permissions: SharePermissionsSchema.parse(row.permissions),
            expiresAt: row.expiresAt?.toISOString() ?? null,
            revoked: row.revoked,
            pinRequired: row.pinRequired,
          })),
          nextAfterShareId: rows.length > 50 ? rows[49]!.id : null,
        };
      });
    },
  };
}
