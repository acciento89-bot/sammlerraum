import { Prisma } from "@sammlerraum/db/search-sql";
import { communityTransaction } from "./community-transaction";
import { publicItemPredicate } from "./social-scope";
import type { CommunityDatabase } from "./social-service";
import type { SearchReadTransaction } from "../search/search-read";

/** Immutable ID-based slug: collision-free across renames, duplicate names and owner transfers. */
export function publicCollectionSlug(id: string) {
  return `collection-${id.toLowerCase()}`;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Profile = { handle: string; displayName: string; bio: string | null };
type Collection = { id: string; name: string };
type Item = {
  id: string;
  title: string;
  publicDescription: string | null;
  imageAssetId: string | null;
};
async function profile(tx: SearchReadTransaction, segment: string) {
  try {
    segment = decodeURIComponent(segment);
  } catch {
    return null;
  }
  if (!/^@[a-z0-9][a-z0-9-]{2,63}$/.test(segment)) return null;
  const [row] = await tx.$queryRaw<(Profile & { userId: string })[]>(
    Prisma.sql`SELECT "userId",handle,"displayName",bio FROM "UserProfile" WHERE handle=${segment.slice(1)} FOR SHARE`,
  );
  return row ?? null;
}
function publicFields(p: Profile): Profile {
  return { handle: p.handle, displayName: p.displayName, bio: p.bio };
}
async function collection(tx: SearchReadTransaction, userId: string, slug: string) {
  const id = slug.startsWith("collection-") ? slug.slice(11) : "";
  if (!uuid.test(id)) return null;
  const [row] = await tx.$queryRaw<Collection[]>(
    Prisma.sql`SELECT id,name FROM "Collection" WHERE id=${id}::uuid AND "ownerId"=${userId} AND visibility='PUBLIC' AND "deletedAt" IS NULL FOR SHARE`,
  );
  return row ?? null;
}
const itemFields = Prisma.sql`i.id,i.title,i."publicDescription",(SELECT a.id FROM "MediaLink" im JOIN "MediaAsset" a ON a.id=im."assetId" AND a."ownerId"=i."ownerId" WHERE im."itemId"=i.id AND a.kind='IMAGE' AND a.status='READY' AND a."cleanupStartedAt" IS NULL AND im.purpose='GALLERY' ORDER BY im.position,im.id LIMIT 1) AS "imageAssetId"`;
export function createPublicProfileService(db: CommunityDatabase) {
  return {
    getProfile: (segment: string, afterId?: string) =>
      communityTransaction(db, async (tx) => {
        if (afterId && !uuid.test(afterId)) return null;
        const p = await profile(tx, segment);
        if (!p) return null;
        const rows = await tx.$queryRaw<Collection[]>(
          Prisma.sql`SELECT id,name FROM "Collection" WHERE "ownerId"=${p.userId} AND visibility='PUBLIC' AND "deletedAt" IS NULL ${afterId ? Prisma.sql`AND id>${afterId}::uuid` : Prisma.empty} ORDER BY id LIMIT 51`,
        );
        return {
          profile: publicFields(p),
          collections: rows.slice(0, 50).map((c) => ({ ...c, slug: publicCollectionSlug(c.id) })),
          next: rows.length > 50 ? rows[49]!.id : null,
        };
      }),
    getCollection: (segment: string, slug: string, afterId?: string) =>
      communityTransaction(db, async (tx) => {
        if (afterId && !uuid.test(afterId)) return null;
        const p = await profile(tx, segment);
        if (!p) return null;
        const c = await collection(tx, p.userId, slug);
        if (!c) return null;
        const rows = await tx.$queryRaw<Item[]>(
          Prisma.sql`SELECT ${itemFields} FROM "CollectibleItem" i JOIN "Collection" c ON c.id=i."collectionId" WHERE c.id=${c.id}::uuid AND ${publicItemPredicate} ${afterId ? Prisma.sql`AND i.id>${afterId}::uuid` : Prisma.empty} ORDER BY i.id LIMIT 51`,
        );
        return {
          profile: publicFields(p),
          collection: { ...c, slug },
          items: rows.slice(0, 50),
          next: rows.length > 50 ? rows[49]!.id : null,
        };
      }),
    getItem: (segment: string, slug: string, itemId: string) =>
      communityTransaction(db, async (tx) => {
        if (!uuid.test(itemId)) return null;
        const p = await profile(tx, segment);
        if (!p) return null;
        const c = await collection(tx, p.userId, slug);
        if (!c) return null;
        const [item] = await tx.$queryRaw<Item[]>(
          Prisma.sql`SELECT ${itemFields} FROM "CollectibleItem" i JOIN "Collection" c ON c.id=i."collectionId" WHERE c.id=${c.id}::uuid AND i.id=${itemId}::uuid AND ${publicItemPredicate}`,
        );
        return item ? { profile: publicFields(p), collection: { ...c, slug }, item } : null;
      }),
  };
}
