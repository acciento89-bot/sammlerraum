import { Prisma } from "@sammlerraum/db/search-sql";
import { communityTransaction } from "../community/community-transaction";
import type { CommunityDatabase } from "../community/social-service";
import { publicItemPredicate } from "../community/social-scope";
import { getPublicIndexability, type IndexabilityDecision } from "./indexability";
export type PublicSeoPage = {
  kind: "profile" | "collection" | "item";
  title: string;
  description: string | null;
  profile: { handle: string; displayName: string; bio: string | null };
  publicLocale: "de" | "en";
  paths: { de: string; en: string };
  updatedAt: Date;
  indexability: IndexabilityDecision;
};
type Profile = {
  userId: string;
  handle: string;
  displayName: string;
  bio: string | null;
  searchEngineIndexingEnabled: boolean;
  publicLocale: "de" | "en";
  updatedAt: Date;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
/** Fresh bounded transactions. Internal identities never enter the returned public projection. */
export function createPublicPageQuery(db: CommunityDatabase) {
  async function read(
    handle: string,
    slug?: string,
    itemId?: string,
  ): Promise<PublicSeoPage | null> {
    try {
      handle = decodeURIComponent(handle);
    } catch {
      return null;
    }
    if (!/^@[a-z0-9][a-z0-9-]{2,63}$/u.test(handle)) return null;
    const collectionId = slug?.startsWith("collection-") ? slug.slice(11) : null;
    if (slug !== undefined && (!collectionId || !uuid.test(collectionId))) return null;
    if (itemId !== undefined && !uuid.test(itemId)) return null;
    return communityTransaction(db, async (tx) => {
      const [p] = await tx.$queryRaw<Profile[]>(
        Prisma.sql`SELECT "userId",handle,"displayName",bio,"searchEngineIndexingEnabled","publicLocale","updatedAt" FROM "UserProfile" WHERE handle=${handle.slice(1)} FOR SHARE`,
      );
      if (!p) return null;
      let title = p.displayName,
        description = p.bio,
        updatedAt = p.updatedAt;
      let kind: PublicSeoPage["kind"] = "profile",
        suffix = `/@${p.handle}`;
      if (collectionId) {
        const [c] = await tx.$queryRaw<{ name: string; updatedAt: Date }[]>(
          Prisma.sql`SELECT name,"updatedAt" FROM "Collection" WHERE id=${collectionId}::uuid AND "ownerId"=${p.userId} AND visibility='PUBLIC' AND "deletedAt" IS NULL FOR SHARE`,
        );
        if (!c) return null;
        title = c.name;
        description = null;
        kind = "collection";
        suffix += `/collection-${collectionId}`;
        updatedAt = new Date(Math.max(updatedAt.getTime(), c.updatedAt.getTime()));
      }
      if (itemId && collectionId) {
        const [item] = await tx.$queryRaw<
          { title: string; publicDescription: string | null; updatedAt: Date }[]
        >(
          Prisma.sql`SELECT i.title,i."publicDescription",i."updatedAt" FROM "CollectibleItem" i JOIN "Collection" c ON c.id=i."collectionId" WHERE i.id=${itemId}::uuid AND c.id=${collectionId}::uuid AND c."ownerId"=${p.userId} AND ${publicItemPredicate}`,
        );
        if (!item) return null;
        title = item.title;
        description = item.publicDescription;
        kind = "item";
        suffix += `/items/${itemId}`;
        updatedAt = new Date(Math.max(updatedAt.getTime(), item.updatedAt.getTime()));
      }
      return {
        kind,
        title,
        description,
        profile: { handle: p.handle, displayName: p.displayName, bio: p.bio },
        publicLocale: p.publicLocale,
        paths: { de: `/de${suffix}`, en: `/en${suffix}` },
        updatedAt,
        indexability: getPublicIndexability({ visibility: "PUBLIC" }, [], p),
      };
    });
  }
  return {
    getPublicProfileSeoPage: (handle: string) => read(handle),
    getPublicCollectionSeoPage: (handle: string, slug: string) => read(handle, slug),
    getPublicItemSeoPage: (handle: string, slug: string, itemId: string) =>
      read(handle, slug, itemId),
  };
}
