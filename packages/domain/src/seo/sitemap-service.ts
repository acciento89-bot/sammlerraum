import { Prisma } from "@sammlerraum/db/search-sql";
import { communityTransaction } from "../community/community-transaction";
import { publicItemPredicate } from "../community/social-scope";
import type { CommunityDatabase } from "../community/social-service";
import { getPublicIndexability } from "./indexability";
export type IndexablePublicResource = {
  path: string;
  alternates: { de: string; en: string };
  lastModified: Date;
};
type Kind = "p" | "c" | "i";
type Row = {
  searchEngineIndexingEnabled: boolean;
  handle: string;
  publicLocale: "de" | "en";
  collectionId: string | null;
  itemId: string | null;
  lastModified: Date;
};
const maxSegments = 49999;
function size(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 10000)
    throw new Error("Invalid sitemap page size");
  return value;
}
function source(kind: Kind) {
  if (kind === "p")
    return {
      from: Prisma.sql`"UserProfile" p`,
      id: Prisma.sql`p."userId"`,
      effective: Prisma.sql`true`,
      fields: Prisma.sql`NULL::text AS "collectionId", NULL::text AS "itemId", p."updatedAt" AS "lastModified"`,
    };
  if (kind === "c")
    return {
      from: Prisma.sql`"UserProfile" p JOIN "Collection" c ON c."ownerId"=p."userId"`,
      id: Prisma.sql`c.id::text`,
      effective: Prisma.sql`c.visibility='PUBLIC' AND c."deletedAt" IS NULL`,
      fields: Prisma.sql`c.id::text AS "collectionId", NULL::text AS "itemId", greatest(p."updatedAt",c."updatedAt") AS "lastModified"`,
    };
  return {
    from: Prisma.sql`"UserProfile" p JOIN "CollectibleItem" i ON i."ownerId"=p."userId" JOIN "Collection" c ON c.id=i."collectionId"`,
    id: Prisma.sql`i.id::text`,
    effective: publicItemPredicate,
    fields: Prisma.sql`c.id::text AS "collectionId", i.id::text AS "itemId", greatest(p."updatedAt",c."updatedAt",i."updatedAt") AS "lastModified"`,
  };
}
function range(hash: Prisma.Sql, prefix: string) {
  return prefix
    ? Prisma.sql`AND (${hash}) COLLATE "C">=${prefix} AND (${hash}) COLLATE "C"<${prefix + "g"}`
    : Prisma.empty;
}
export function createCommunitySitemapService(db: CommunityDatabase) {
  return {
    async listSegments(pageSize = 10000): Promise<string[]> {
      size(pageSize);
      return communityTransaction(db, async (tx) => {
        const leaves: string[] = [];
        for (const kind of ["p", "c", "i"] as const) {
          const s = source(kind),
            hash = Prisma.sql`md5(${s.id})`,
            queue = [""];
          while (queue.length) {
            if (queue.length + leaves.length > maxSegments)
              throw new Error("Sitemap index capacity exceeded");
            const prefix = queue.shift()!;
            const rows = await tx.$queryRaw<{ prefix: string; count: bigint }[]>(
              Prisma.sql`SELECT substring(${hash},1,${prefix.length + 1}) AS prefix, count(*)::bigint AS count FROM ${s.from} WHERE p."searchEngineIndexingEnabled"=true AND ${s.effective} ${range(hash, prefix)} GROUP BY 1 ORDER BY 1`,
            );
            for (const row of rows) {
              if (row.count > BigInt(pageSize)) {
                if (row.prefix.length >= 32) throw new Error("Sitemap hash range exhausted");
                queue.push(row.prefix);
              } else leaves.push(`${kind}-${row.prefix}`);
            }
          }
        }
        if (leaves.length > maxSegments) throw new Error("Sitemap index capacity exceeded");
        return leaves.sort();
      });
    },
    async getIndexableCommunityPage(
      page: string,
      pageSize = 10000,
    ): Promise<IndexablePublicResource[]> {
      size(pageSize);
      const parsed = /^([pci])-([0-9a-f]{1,32})$/u.exec(page);
      if (!parsed) throw new Error("Invalid sitemap segment");
      const kind = parsed[1] as Kind,
        prefix = parsed[2]!,
        s = source(kind),
        hash = Prisma.sql`md5(${s.id})`;
      return communityTransaction(db, async (tx) => {
        const rows = await tx.$queryRaw<Row[]>(
          Prisma.sql`SELECT p.handle,p."publicLocale",p."searchEngineIndexingEnabled",${s.fields} FROM ${s.from} WHERE p."searchEngineIndexingEnabled"=true AND ${s.effective} ${range(hash, prefix)} ORDER BY (${hash}) COLLATE "C", ${s.id} LIMIT ${pageSize + 1}`,
        );
        if (rows.length > pageSize)
          throw new Error("Sitemap segment changed; refresh sitemap index");
        return rows.map((row) => {
          // SQL supplied the current opt-in/effective PUBLIC facts, including ancestor closure.
          if (
            !getPublicIndexability({ visibility: "PUBLIC" }, [], {
              searchEngineIndexingEnabled: row.searchEngineIndexingEnabled,
            }).index
          )
            throw new Error("Indexability policy rejected");
          const suffix = `/@${row.handle}${row.collectionId ? `/collection-${row.collectionId}` : ""}${row.itemId ? `/items/${row.itemId}` : ""}`;
          return {
            path: `/${row.publicLocale}${suffix}`,
            alternates: { de: `/de${suffix}`, en: `/en${suffix}` },
            lastModified: row.lastModified,
          };
        });
      });
    },
  };
}
