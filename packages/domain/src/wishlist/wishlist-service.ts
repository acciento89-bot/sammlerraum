import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@sammlerraum/db/search-sql";
import { MembershipActorIdSchema } from "@sammlerraum/contracts/collaboration";
import {
  CreateWishlistEntrySchema,
  WishlistIdSchema,
  WishlistListQuerySchema,
  WishlistEntrySchema,
  DuplicateCandidatesQuerySchema,
  WishlistError,
  WISHLIST_MAX_ENTRIES,
  DUPLICATE_MAX_RELATIONS,
} from "@sammlerraum/contracts/wishlist";
import { currencyMinorUnitExponent } from "../money/currencies";
import { isReadDependencyFailure } from "../api/read-dependency-errors";
import type { SearchReadTransaction } from "../search/search-read";
type Actor = { userId: string };
export type WishlistDatabase = {
  $transaction<T>(
    work: (tx: SearchReadTransaction) => Promise<T>,
    options: { isolationLevel: "ReadCommitted"; maxWait: number; timeout: number },
  ): Promise<T>;
};
function fail(code: WishlistError["code"]): never {
  throw new WishlistError(code);
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) return fail("WISHLIST_INVALID");
  return result.data;
}
const timestamp = (value: Date | string) => new Date(value).toISOString();
type WishRow = {
  id: string;
  title: string;
  catalogEntryId: string | null;
  catalogVariantId: string | null;
  desiredCondition: string | null;
  targetAmountMinor: bigint | null;
  targetCurrency: string | null;
  targetMinorUnitExponent: number | null;
  priority: number;
  notes: string | null;
  fulfilledAt: Date | null;
  createdAt: Date;
};
function wish(row: WishRow) {
  return WishlistEntrySchema.parse({
    id: row.id,
    title: row.title,
    catalogEntryId: row.catalogEntryId,
    catalogVariantId: row.catalogVariantId,
    desiredCondition: row.desiredCondition,
    targetPrice:
      row.targetAmountMinor === null
        ? null
        : {
            amountMinor: row.targetAmountMinor.toString(),
            currency: row.targetCurrency,
            minorUnitExponent: row.targetMinorUnitExponent,
          },
    priority: row.priority,
    notes: row.notes,
    fulfilledAt: row.fulfilledAt === null ? null : timestamp(row.fulfilledAt),
    createdAt: timestamp(row.createdAt),
  });
}
/** Private current-owner wishes and specimen relations. Membership/share visibility never grants access. */
export function createWishlistService(database: WishlistDatabase) {
  async function run<T>(
    who: Actor,
    work: (tx: SearchReadTransaction, userId: string) => Promise<T>,
  ): Promise<T> {
    const userId = parse(MembershipActorIdSchema, who?.userId);
    try {
      return await database.$transaction(
        async (tx) => {
          await tx.$queryRaw(
            Prisma.sql`SELECT set_config('TimeZone','UTC',true),set_config('statement_timeout','2000ms',true),set_config('lock_timeout','500ms',true),set_config('transaction_timeout','5000ms',true)`,
          );
          const [actor] = await tx.$queryRaw<{ id: string }[]>(
            Prisma.sql`SELECT id FROM "user" WHERE id=${userId} FOR NO KEY UPDATE`,
          );
          if (!actor) return fail("WISHLIST_NOT_FOUND");
          // Read committed re-reads quota/idempotency facts after this per-user fence actually settles.
          return work(tx, userId);
        },
        { isolationLevel: "ReadCommitted", maxWait: 2000, timeout: 5000 },
      );
    } catch (error) {
      if (error instanceof WishlistError) throw error;
      if (isReadDependencyFailure(error)) return fail("WISHLIST_UNAVAILABLE");
      throw error;
    }
  }
  async function ownedPair(tx: SearchReadTransaction, userId: string, ids: string[]) {
    await tx.$queryRaw(
      Prisma.sql`SELECT c.id FROM "Collection" c WHERE c."ownerId"=${userId} AND c."deletedAt" IS NULL AND c.id IN (SELECT i."collectionId" FROM "CollectibleItem" i WHERE i.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})) ORDER BY c.id FOR SHARE OF c`,
    );
    const items = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT i.id FROM "CollectibleItem" i JOIN "Collection" c ON c.id=i."collectionId" WHERE i.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) AND i."ownerId"=${userId} AND c."ownerId"=${userId} AND i."deletedAt" IS NULL AND c."deletedAt" IS NULL ORDER BY i.id FOR SHARE OF i`,
    );
    if (items.length !== ids.length) return fail("WISHLIST_NOT_FOUND");
  }
  function pair(a: string, b: string) {
    const ids = [parse(WishlistIdSchema, a), parse(WishlistIdSchema, b)].sort();
    if (ids[0] === ids[1]) return fail("WISHLIST_INVALID");
    return ids as [string, string];
  }
  return {
    async createWishlistEntry(who: Actor, input: unknown) {
      const value = parse(CreateWishlistEntrySchema, input),
        price = value.targetPrice;
      if (price) {
        let exponent: number;
        try {
          exponent = currencyMinorUnitExponent(price.currency);
        } catch {
          return fail("WISHLIST_INVALID");
        }
        if (exponent !== price.minorUnitExponent) return fail("WISHLIST_INVALID");
      }
      return run(who, async (tx, userId) => {
        const [quota] = await tx.$queryRaw<{ count: bigint }[]>(
          Prisma.sql`SELECT count(*) FROM "WishlistEntry" WHERE "ownerId"=${userId}`,
        );
        if (!quota || quota.count >= BigInt(WISHLIST_MAX_ENTRIES)) return fail("WISHLIST_LIMIT");
        if (value.catalogEntryId) {
          const [entry] = await tx.$queryRaw<{ id: string }[]>(
            Prisma.sql`SELECT id FROM "CatalogEntry" WHERE id=${value.catalogEntryId}::uuid FOR SHARE`,
          );
          if (!entry) return fail("WISHLIST_NOT_FOUND");
          if (value.catalogVariantId) {
            const [variant] = await tx.$queryRaw<{ id: string }[]>(
              Prisma.sql`SELECT id FROM "CatalogVariant" WHERE id=${value.catalogVariantId}::uuid AND "entryId"=${value.catalogEntryId}::uuid AND active FOR SHARE`,
            );
            if (!variant) return fail("WISHLIST_NOT_FOUND");
          }
        }
        const [row] = await tx.$queryRaw<WishRow[]>(
          Prisma.sql`INSERT INTO "WishlistEntry" (id,"ownerId",title,"catalogEntryId","catalogVariantId","desiredCondition","targetAmountMinor","targetCurrency","targetMinorUnitExponent","targetUnitKey",priority,notes) VALUES (${randomUUID()}::uuid,${userId},${value.title},${value.catalogEntryId}::uuid,${value.catalogVariantId}::uuid,${value.desiredCondition},${price ? BigInt(price.amountMinor) : null},${price?.currency ?? null},${price?.minorUnitExponent ?? null},${price ? "iso4217-2026-09-17:" + price.currency : null},${value.priority},${value.notes}) RETURNING *`,
        );
        if (!row) return fail("WISHLIST_CONFLICT");
        return wish(row);
      });
    },
    async listWishlistEntries(who: Actor, input: unknown = {}) {
      const query = parse(WishlistListQuerySchema, input);
      return run(who, async (tx, userId) => {
        const rows = await tx.$queryRaw<WishRow[]>(
          Prisma.sql`SELECT * FROM "WishlistEntry" WHERE "ownerId"=${userId} ${query.afterId ? Prisma.sql`AND id>${query.afterId}::uuid` : Prisma.empty} ${query.status === "OPEN" ? Prisma.sql`AND "fulfilledAt" IS NULL` : query.status === "FULFILLED" ? Prisma.sql`AND "fulfilledAt" IS NOT NULL` : Prisma.empty} ORDER BY id LIMIT ${query.limit + 1}`,
        );
        return {
          entries: rows.slice(0, query.limit).map(wish),
          next: rows.length > query.limit ? rows[query.limit - 1]!.id : null,
        };
      });
    },
    async removeWishlistEntry(who: Actor, idInput: string) {
      const id = parse(WishlistIdSchema, idInput);
      return run(who, async (tx, userId) => {
        const rows = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`DELETE FROM "WishlistEntry" WHERE id=${id}::uuid AND "ownerId"=${userId} RETURNING id`,
        );
        if (!rows.length) return fail("WISHLIST_NOT_FOUND");
        return { removed: true };
      });
    },
    async unmarkDuplicateRelation(who: Actor, a: string, b: string) {
      const [first, second] = pair(a, b);
      return run(who, async (tx, userId) => {
        await ownedPair(tx, userId, [first, second]);
        const rows = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`DELETE FROM "DuplicateRelation" WHERE "ownerId"=${userId} AND "itemAId"=${first}::uuid AND "itemBId"=${second}::uuid RETURNING id`,
        );
        return { removed: rows.length > 0 };
      });
    },
    async fulfillWishlistEntry(who: Actor, idInput: string) {
      const id = parse(WishlistIdSchema, idInput);
      return run(who, async (tx, userId) => {
        const [row] = await tx.$queryRaw<WishRow[]>(
          Prisma.sql`UPDATE "WishlistEntry" SET "fulfilledAt"=coalesce("fulfilledAt",timezone('UTC',clock_timestamp())) WHERE id=${id}::uuid AND "ownerId"=${userId} RETURNING *`,
        );
        if (!row) return fail("WISHLIST_NOT_FOUND");
        return wish(row);
      });
    },
    async markDuplicateRelation(who: Actor, a: string, b: string) {
      const [first, second] = pair(a, b);
      return run(who, async (tx, userId) => {
        await ownedPair(tx, userId, [first, second]);
        const [existing] = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM "DuplicateRelation" WHERE "ownerId"=${userId} AND "itemAId"=${first}::uuid AND "itemBId"=${second}::uuid`,
        );
        if (existing) return { id: existing.id, itemAId: first, itemBId: second };
        const [quota] = await tx.$queryRaw<{ count: bigint }[]>(
          Prisma.sql`SELECT count(*) FROM "DuplicateRelation" WHERE "ownerId"=${userId}`,
        );
        if (!quota || quota.count >= BigInt(DUPLICATE_MAX_RELATIONS)) return fail("WISHLIST_LIMIT");
        const id = randomUUID();
        await tx.$queryRaw(
          Prisma.sql`INSERT INTO "DuplicateRelation" (id,"ownerId","itemAId","itemBId") VALUES (${id}::uuid,${userId},${first}::uuid,${second}::uuid)`,
        );
        return { id, itemAId: first, itemBId: second };
      });
    },
    async areMarkedDuplicates(who: Actor, a: string, b: string) {
      const [first, second] = pair(a, b);
      return run(who, async (tx, userId) => {
        await ownedPair(tx, userId, [first, second]);
        const [row] = await tx.$queryRaw<{ marked: boolean }[]>(
          Prisma.sql`SELECT EXISTS(SELECT 1 FROM "DuplicateRelation" WHERE "ownerId"=${userId} AND "itemAId"=${first}::uuid AND "itemBId"=${second}::uuid) AS marked`,
        );
        return row?.marked === true;
      });
    },
    async listDuplicateCandidates(who: Actor, input: unknown) {
      const query = parse(DuplicateCandidatesQuerySchema, input);
      return run(who, async (tx, userId) => {
        await ownedPair(tx, userId, [query.itemId]);
        const rows = await tx.$queryRaw<
          { id: string; title: string; collectionId: string; quantity: number; marked: boolean }[]
        >(
          Prisma.sql`SELECT candidate.id,candidate.title,candidate."collectionId",candidate.quantity,EXISTS(SELECT 1 FROM "DuplicateRelation" d WHERE d."ownerId"=${userId} AND d."itemAId"=least(source.id,candidate.id) AND d."itemBId"=greatest(source.id,candidate.id)) AS marked FROM "CollectibleItem" source JOIN "CollectibleItem" candidate ON candidate.id<>source.id JOIN "Collection" c ON c.id=candidate."collectionId" WHERE source.id=${query.itemId}::uuid AND candidate."ownerId"=${userId} AND c."ownerId"=${userId} AND candidate."deletedAt" IS NULL AND c."deletedAt" IS NULL ${query.afterId ? Prisma.sql`AND candidate.id>${query.afterId}::uuid` : Prisma.empty} AND ((source."catalogEntryId" IS NOT NULL AND candidate."catalogEntryId"=source."catalogEntryId" AND candidate."catalogVariantId" IS NOT DISTINCT FROM source."catalogVariantId") OR (source."catalogEntryId" IS NULL AND lower(btrim(candidate.title))=lower(btrim(source.title))) OR EXISTS(SELECT 1 FROM "DuplicateRelation" d WHERE d."ownerId"=${userId} AND d."itemAId"=least(source.id,candidate.id) AND d."itemBId"=greatest(source.id,candidate.id))) ORDER BY candidate.id LIMIT ${query.limit + 1}`,
        );
        return {
          candidates: rows.slice(0, query.limit),
          next: rows.length > query.limit ? rows[query.limit - 1]!.id : null,
        };
      });
    },
  };
}
