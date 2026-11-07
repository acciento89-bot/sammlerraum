import { Prisma } from "@sammlerraum/db/search-sql";
import {
  FilterValidationError,
  type ItemFilterNode,
  type ItemFilterLeaf,
} from "@sammlerraum/contracts/search";
import type { NormalizedItemSearchQuery } from "@sammlerraum/contracts/item-search";
import { searchFail } from "@sammlerraum/contracts/item-search";
import { and, or, TRUE, compileFilter, leaves, candidateFrom } from "./search-compiler";
import { scopedReadState, type ScopedReadContext } from "./scoped-read-context";
import { prepareLegacyMoneyPredicates } from "./legacy-money-query";
import { validateCurrentFilterAvailability } from "./filter-ast";
import { disabledSearchMarket, withItemSelection } from "./search-selection";

const unavailable = (): never => {
  throw new FilterValidationError("FILTER_UNAVAILABLE");
};
/** Whole-tree field checks precede every matching/count/coverage query, including empty scopes. */
export function validateScopedFields(context: ScopedReadContext, query: NormalizedItemSearchQuery) {
  const state = scopedReadState(context);
  if (state.mode === "SHARE" && query.lifecycle !== "ALL") unavailable();
  for (const leaf of leaves(query.filter?.root ?? null)) {
    if (leaf.kind === "marketMoney") unavailable(); // No shared redistribution grant exists.
    if (state.mode === "OWNER_COLLECTION") continue;
    if (state.mode === "MEMBER_COLLECTION") {
      if (["visibility", "tradeStatus", "updatedAt", "acquisitionDate"].includes(leaf.kind))
        continue;
      if (leaf.kind === "collection" && state.reference.kind === "MEMBER_COLLECTION") {
        const values = leaf.test.op === "eq" ? [leaf.test.value] : leaf.test.values;
        const collectionId = state.reference.collectionId;
        if (values.every((id) => id === collectionId)) continue;
      }
      unavailable();
    }
    const rights = state.permissions!;
    if ((leaf.kind === "purchaseMoney" || leaf.kind === "manualMoney") && rights.values) continue;
    if (leaf.kind === "media") {
      if (leaf.mediaKind === "IMAGE" && rights.images) continue;
      if (leaf.mediaKind === "DOCUMENT" && rights.documents.length > 0) {
        if (
          !rights.purchaseReceipts &&
          (leaf.documentCategory === "PURCHASE_RECEIPT" || leaf.documentCategory === "INVOICE")
        )
          unavailable();
        continue;
      }
    }
    unavailable();
  }
}
function basicText(text: string) {
  const pattern = `%${text.replace(/[\\%_]/gu, (c) => `\\${c}`)}%`;
  const match = (column: Prisma.Sql) =>
    Prisma.sql`COALESCE(normalize(${column},NFKC) COLLATE pg_catalog."und-x-icu" ILIKE ${pattern} ESCAPE ${"\\"},FALSE)`;
  return or([match(Prisma.sql`i.title`), match(Prisma.sql`i."publicDescription"`)]);
}
/** Internal composition seam; all consumers use this same prepared scoped relation. */
export async function withScopedSelection<T>(
  context: ScopedReadContext,
  query: NormalizedItemSearchQuery,
  canonicalMoneyEnabled: boolean,
  consume: (selection: {
    prefix: Prisma.Sql;
    predicate: Prisma.Sql;
    outerPredicate: Prisma.Sql;
    readAt: string;
  }) => Promise<T>,
): Promise<T> {
  const state = scopedReadState(context);
  validateScopedFields(context, query);
  if (query.filter) validateCurrentFilterAvailability(query.filter, canonicalMoneyEnabled);
  if (state.mode === "OWNER_COLLECTION") {
    return withItemSelection(
      state.tx,
      { userId: state.ownerUserId },
      query,
      canonicalMoneyEnabled,
      disabledSearchMarket,
      (selection) =>
        consume({
          prefix: selection.prefix,
          predicate: selection.matchedPredicate,
          outerPredicate: selection.outerPredicate,
          readAt: selection.readAt,
        }),
      { predicate: state.predicate },
    );
  }
  const tx = {
    checkBudget: state.tx.checkBudget,
    $queryRaw: <R>(sql: Prisma.Sql) =>
      state.tx.$queryRaw<R>(Prisma.sql`${state.prefix} SELECT * FROM (${sql}) AS scoped_result`),
  };
  const [clock] = await state.tx.$queryRaw<{ now: Date; collation: boolean }[]>(
    Prisma.sql`SELECT date_trunc('milliseconds',transaction_timestamp()) AS now,EXISTS(SELECT 1 FROM pg_collation WHERE collname='und-x-icu' AND collprovider='i' AND collisdeterministic AND collnamespace='pg_catalog'::regnamespace) AS collation`,
  );
  if (!clock?.collation) return searchFail("SEARCH_UNAVAILABLE");
  const life =
    query.lifecycle === "ACTIVE"
      ? Prisma.sql`i."archivedAt" IS NULL AND i."disposedAt" IS NULL`
      : query.lifecycle === "ARCHIVED"
        ? Prisma.sql`i."archivedAt" IS NOT NULL AND i."disposedAt" IS NULL`
        : query.lifecycle === "DISPOSED"
          ? Prisma.sql`i."disposedAt" IS NOT NULL`
          : TRUE;
  const outer = and([state.predicate, life]);
  const money = canonicalMoneyEnabled
    ? await prepareLegacyMoneyPredicates(
        tx,
        { ownerId: state.ownerUserId, predicate: outer },
        query.filter,
      )
    : undefined;
  const compile = (node: ItemFilterNode): Prisma.Sql => {
    if ("children" in node) return (node.kind === "and" ? and : or)(node.children.map(compile));
    if (node.kind === "not") return Prisma.sql`NOT (${compile(node.child)})`;
    if (node.kind === "media") {
      const rights = state.permissions!;
      const exists =
        node.mediaKind === "IMAGE"
          ? Prisma.sql`EXISTS(SELECT 1 FROM "MediaLink" l JOIN "MediaAsset" m ON m.id=l."assetId" AND m."ownerId"=l."ownerId" WHERE l."itemId"=i.id AND l."ownerId"=${state.ownerUserId} AND m.kind='IMAGE' AND m.status='READY' AND m."cleanupStartedAt" IS NULL AND m."mimeType" IN ('image/jpeg','image/png','image/webp'))`
          : Prisma.sql`EXISTS(SELECT 1 FROM "DocumentLink" l JOIN "MediaAsset" m ON m.id=l."assetId" AND m."ownerId"=l."ownerId" WHERE l."itemId"=i.id AND l."ownerId"=${state.ownerUserId} AND l.id IN (${Prisma.join(rights.documents.map((id) => Prisma.sql`${id}::uuid`))}) AND m.kind='DOCUMENT' AND m.status='READY' AND m."cleanupStartedAt" IS NULL AND m."mimeType"='application/pdf' ${rights.purchaseReceipts ? Prisma.empty : Prisma.sql`AND l.category NOT IN ('PURCHASE_RECEIPT','INVOICE')`} ${node.documentCategory ? Prisma.sql`AND l.category::text=${node.documentCategory}` : Prisma.empty})`;
      return node.test.op === "missing" ? Prisma.sql`NOT (${exists})` : exists;
    }
    return compileFilter(node as ItemFilterLeaf, state.ownerUserId, money);
  };
  const [integrity] = await state.tx.$queryRaw<{ invalid: boolean }[]>(
    Prisma.sql`${state.prefix} SELECT EXISTS(SELECT 1 ${candidateFrom} WHERE ${outer} AND (octet_length(i.title)>2000 OR coalesce(octet_length(i."publicDescription")>100000,false))) AS invalid`,
  );
  if (integrity?.invalid) return searchFail("SEARCH_INVARIANT");
  return consume({
    prefix: state.prefix,
    outerPredicate: outer,
    predicate: and([
      outer,
      query.filter ? compile(query.filter.root) : TRUE,
      query.text ? basicText(query.text) : TRUE,
    ]),
    readAt: clock.now.toISOString(),
  });
}
