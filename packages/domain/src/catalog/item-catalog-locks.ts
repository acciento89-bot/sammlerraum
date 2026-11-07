type Query = { $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T> };
export type CatalogReferences = { catalogEntryId: string | null; catalogVariantId: string | null };
/** Canonical writers lock entry before variants. Acquire these parents before an item
 * lock or a split INSERT's implicit FK locks; no item -> entry lock inversion. */
export async function lockCatalogParents(tx: Query, refs: CatalogReferences) {
  const entry =
    refs.catalogEntryId === null
      ? null
      : ((
          await tx.$queryRaw<Array<{ id: string; categoryTemplateId: string }>>`
    SELECT id,"categoryTemplateId" FROM "CatalogEntry" WHERE id=${refs.catalogEntryId}::uuid FOR SHARE
  `
        )[0] ?? null);
  const variant =
    entry === null || refs.catalogVariantId === null
      ? null
      : ((
          await tx.$queryRaw<Array<{ id: string; active: boolean }>>`
    SELECT id,active FROM "CatalogVariant" WHERE id=${refs.catalogVariantId}::uuid AND "entryId"=${entry.id}::uuid FOR SHARE
  `
        )[0] ?? null);
  return { entry, variant };
}
export class CatalogReferencesChanged extends Error {}
