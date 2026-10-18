import { Prisma } from "@sammlerraum/db/search-sql";
import type { ItemFilterLeaf } from "@sammlerraum/contracts/search";
import { searchFail } from "@sammlerraum/contracts/item-search";
import { validateFieldValue } from "../custom-fields/custom-field-service";
import { candidateFrom, exactCatalog, or } from "./search-compiler";
import type { BoundedSearchReadTransaction } from "./search-read";

/** The existing producer owns WHATWG URL validity and canonical serialization.
 * Only distinct selected values cross this internal seam, never item inventories. */
export async function validateRetainedUrls(
  tx: BoundedSearchReadTransaction,
  nodes: ItemFilterLeaf[],
  outer: Prisma.Sql,
): Promise<void> {
  const custom: Prisma.Sql[] = [],
    catalog: Prisma.Sql[] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    if (
      (node.kind !== "customField" && node.kind !== "catalogAttribute") ||
      node.predicate.valueType !== "URL"
    )
      continue;
    const key = JSON.stringify([node.kind, node.selector]);
    if (seen.has(key)) continue;
    seen.add(key);
    if (node.kind === "customField")
      custom.push(
        Prisma.sql`i."collectionId"=${node.selector.collectionId}::uuid AND v."fieldDefinitionId"=${node.selector.definitionId}::uuid`,
      );
    else
      catalog.push(
        Prisma.sql`i."categoryTemplateId"=${node.selector.categoryTemplateId}::uuid AND ${exactCatalog(node)}`,
      );
  }
  if (!seen.size) return;
  const sources: Prisma.Sql[] = [];
  if (custom.length)
    sources.push(
      Prisma.sql`SELECT v."urlValue" AS value ${candidateFrom} JOIN "CustomFieldValue" v ON v."itemId"=i.id AND v."collectionId"=i."collectionId" AND v."fieldType"='URL' WHERE ${outer} AND ${or(custom)}`,
    );
  if (catalog.length)
    sources.push(
      Prisma.sql`SELECT CASE WHEN jsonb_typeof(a.value)='string' THEN a.value #>> '{}' ELSE NULL END AS value ${candidateFrom} JOIN "CatalogAttributeValue" a ON a."entryId"=i."catalogEntryId" AND a."categoryTemplateId"=i."categoryTemplateId" WHERE ${outer} AND ${or(catalog)}`,
    );
  tx.checkBudget();
  const [manifest] = await tx.$queryRaw<
    { count: bigint; bytes: bigint; values: string[] | null }[]
  >(Prisma.sql`
    WITH search_url_manifest AS MATERIALIZED (
      SELECT DISTINCT value COLLATE pg_catalog."C" AS value FROM (${Prisma.join(sources, " UNION ALL ")}) selected_urls LIMIT 4097
    ), sizes AS (
      SELECT count(*) AS count, COALESCE(sum(octet_length(value)),0)::bigint AS bytes FROM search_url_manifest
    )
    SELECT count,bytes,CASE WHEN count<=4096 AND bytes<=8388608
      THEN (SELECT array_agg(value) FROM search_url_manifest) ELSE NULL END AS values FROM sizes
  `);
  tx.checkBudget();
  if (
    !manifest ||
    typeof manifest.count !== "bigint" ||
    typeof manifest.bytes !== "bigint" ||
    manifest.count < 0n ||
    manifest.bytes < 0n
  )
    return searchFail("SEARCH_INVARIANT");
  if (manifest.count > 4096n || manifest.bytes > 8388608n) return searchFail("SEARCH_UNAVAILABLE");
  if (manifest.count === 0n && manifest.values === null) return;
  if (!Array.isArray(manifest.values) || BigInt(manifest.values.length) !== manifest.count)
    return searchFail("SEARCH_INVARIANT");
  for (const value of manifest.values) {
    tx.checkBudget();
    let valid = false;
    try {
      valid = typeof value === "string" && validateFieldValue("URL", value) === value;
    } catch {
      /* Only the closed invariant code may leave this seam. */
    }
    tx.checkBudget();
    if (!valid) return searchFail("SEARCH_INVARIANT");
  }
  tx.checkBudget();
}
