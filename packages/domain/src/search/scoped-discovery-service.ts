import { createHash } from "node:crypto";
import { Prisma } from "@sammlerraum/db/search-sql";
import { MembershipActorIdSchema } from "@sammlerraum/contracts/collaboration";
import {
  ScopedDiscoveryInputSchema,
  ScopedDiscoveryPageSchema,
} from "@sammlerraum/contracts/scoped-search";
import { SEARCH_MAX_RESPONSE_BYTES, searchFail } from "@sammlerraum/contracts/item-search";
import type { MembershipDatabase } from "../collaboration/transfer-transaction";
import { runSearchRead } from "./search-read";
import { decodeReferenceCursor, encodeReferenceCursor } from "./search-reference-cursor";
/** Discovery is not a capability: every selected target is reauthorized on its actual read. */
export function createScopedDiscoveryService(database: MembershipDatabase) {
  return {
    async list(actor: { userId: string }, input: unknown) {
      const who = MembershipActorIdSchema.safeParse(actor?.userId),
        parsed = ScopedDiscoveryInputSchema.safeParse(input);
      if (!who.success || !parsed.success) return searchFail("SEARCH_INVALID");
      const owner = who.data,
        query = parsed.data;
      const hash = createHash("sha256")
        .update(JSON.stringify(["scoped-discovery", 1, owner, query.family, query.limit, "ID_ASC"]))
        .digest("hex");
      const after = query.cursor ? decodeReferenceCursor(query.cursor, hash) : null;
      return runSearchRead(database, async (tx) => {
        const rows =
          query.family === "MEMBER_COLLECTION"
            ? await tx.$queryRaw<
                { kind: "MEMBER_COLLECTION"; collectionId: string; name: string }[]
              >(
                Prisma.sql`SELECT 'MEMBER_COLLECTION' AS kind,c.id AS "collectionId",c.name FROM "Collection" c WHERE c."deletedAt" IS NULL AND (c."ownerId"=${owner} OR EXISTS(SELECT 1 FROM "CollectionMember" m WHERE m."collectionId"=c.id AND m."userId"=${owner})) ${after ? Prisma.sql`AND c.id>${after}::uuid` : Prisma.empty} ORDER BY c.id LIMIT ${query.limit + 1}`,
              )
            : await tx.$queryRaw<{ kind: "SHARE"; shareId: string; pinRequired: boolean }[]>(
                Prisma.sql`SELECT 'SHARE' AS kind,s.id AS "shareId",s."pinHash" IS NOT NULL AS "pinRequired" FROM "CollectionShare" s JOIN "Collection" c ON c.id=s."collectionId" AND c."ownerId"=s."creatorUserId" AND c."deletedAt" IS NULL JOIN "user" u ON u.id=s."recipientUserId" AND u."emailVerified" WHERE s."recipientUserId"=${owner} AND s."revokedAt" IS NULL AND NOT EXISTS(SELECT 1 FROM "ShareRevocation" r WHERE r."shareId"=s.id) AND (s."expiresAt" IS NULL OR s."expiresAt">timezone('UTC',clock_timestamp())) ${after ? Prisma.sql`AND s.id>${after}::uuid` : Prisma.empty} ORDER BY s.id LIMIT ${query.limit + 1}`,
              );
        const items = rows.slice(0, query.limit),
          last = items.at(-1);
        const result = ScopedDiscoveryPageSchema.safeParse({
          items,
          nextCursor:
            rows.length > query.limit && last
              ? encodeReferenceCursor({
                  v: 1,
                  contextHash: hash,
                  after: last.kind === "SHARE" ? last.shareId : last.collectionId,
                })
              : null,
        });
        if (
          !result.success ||
          Buffer.byteLength(JSON.stringify(result.data)) > SEARCH_MAX_RESPONSE_BYTES
        )
          return searchFail("SEARCH_INVARIANT");
        return result.data;
      });
    },
  };
}
