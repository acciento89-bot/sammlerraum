import { createHash } from "node:crypto";
import {
  CatalogSnapshotSchema,
  CategoryTemplateSchema,
  type CatalogEntryRevision,
} from "@sammlerraum/contracts/catalog";
import {
  CatalogPageInputSchema,
  CatalogHistoryInputSchema,
  CatalogHistoryRevisionSchema,
  CatalogTitleSummarySchema,
  type CatalogRevisionSummary,
  CatalogReadIdSchema,
  CatalogSearchInputSchema,
  CatalogSearchResultSchema,
  CategorySummarySchema,
} from "@sammlerraum/contracts/catalog-reads";

type Query = { $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T> };
export class CatalogReadError extends Error {
  constructor(readonly code: "CATALOG_NOT_FOUND" | "CATALOG_QUERY_INVALID") {
    super(code);
    this.name = "CatalogReadError";
  }
}
const scope = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function afterCursor(cursor: string | undefined, identity: string): string | null {
  if (cursor === undefined) return null;
  try {
    if (!/^[A-Za-z0-9_-]{1,2048}$/u.test(cursor)) throw new Error();
    const decoded = Buffer.from(cursor, "base64url");
    if (decoded.toString("base64url") !== cursor) throw new Error();
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decoded)) as Record<
      string,
      unknown
    >;
    if (
      value === null ||
      typeof value !== "object" ||
      Object.keys(value).sort().join(",") !== "after,scope,v" ||
      value.v !== 1 ||
      value.scope !== identity
    )
      throw new Error();
    return CatalogReadIdSchema.parse(value.after);
  } catch {
    throw new CatalogReadError("CATALOG_QUERY_INVALID");
  }
}
function pageCursor(after: string, identity: string): string {
  return Buffer.from(JSON.stringify({ v: 1, scope: identity, after })).toString("base64url");
}

/** Canonical-only projections. Authentication belongs to the HTTP adapter; this service
 * has no personal-item, proposal, account or provider dependency. UUID keyset pages are
 * live pages, not a cross-request snapshot. Each individual result is MVCC-consistent. */
export function createCatalogReadService(database: Query) {
  async function listCategories(input: unknown = {}) {
    const { limit, cursor } = CatalogPageInputSchema.parse(input);
    const identity = scope(["categories"]);
    const after = afterCursor(cursor, identity);
    const rows = await database.$queryRaw<Array<{ id: string; key: string; labels: unknown }>>`
      SELECT category.id,category.key,
        (SELECT jsonb_object_agg(label.locale,label.label) FROM "CategoryTemplateLabel" label WHERE label."categoryTemplateId"=category.id AND label.locale IN ('de','en')) AS labels
      FROM "CategoryTemplate" category WHERE (${after}::uuid IS NULL OR category.id>${after}::uuid)
      ORDER BY category.id LIMIT ${limit + 1}
    `;
    const categories = rows.slice(0, limit).map((row) => CategorySummarySchema.parse(row));
    return {
      categories,
      nextCursor: rows.length > limit ? pageCursor(categories.at(-1)!.id, identity) : null,
    };
  }
  async function getCategoryTemplate(categoryIdInput: string) {
    const categoryId = CatalogReadIdSchema.parse(categoryIdInput);
    // One statement also bounds corrupt/out-of-contract maintenance rows: 101 is
    // deliberately rejected by the DTO rather than silently presenting 100 of 101.
    const [row] = await database.$queryRaw<Array<{ template: unknown }>>`
      SELECT jsonb_build_object('id',category.id,'key',category.key,'labels',
        (SELECT jsonb_object_agg(label.locale,label.label) FROM "CategoryTemplateLabel" label WHERE label."categoryTemplateId"=category.id AND label.locale IN ('de','en')),
        'definitions', COALESCE((SELECT jsonb_agg(definition.dto ORDER BY definition.position,definition.id) FROM (
          SELECT d.id,d.position,jsonb_build_object('id',d.id,'categoryTemplateId',d."categoryTemplateId",'key',d.key,'type',d.type,'position',d.position,
            'labels',(SELECT jsonb_object_agg(l.locale,l.label) FROM "CatalogAttributeLabel" l WHERE l."definitionId"=d.id AND l.locale IN ('de','en')),
            'options',COALESCE((SELECT jsonb_agg(option.dto ORDER BY option.position,option.id) FROM (
              SELECT o.id,o.position,jsonb_build_object('id',o.id,'key',o.key,'position',o.position,'labels',
                (SELECT jsonb_object_agg(l.locale,l.label) FROM "CatalogAttributeOptionLabel" l WHERE l."optionId"=o.id AND l.locale IN ('de','en'))) AS dto
              FROM "CatalogAttributeOption" o WHERE o."definitionId"=d.id ORDER BY o.position,o.id LIMIT 101
            ) option),'[]'::jsonb)) AS dto
          FROM "CatalogAttributeDefinition" d WHERE d."categoryTemplateId"=category.id ORDER BY d.position,d.id LIMIT 101
        ) definition),'[]'::jsonb)) AS template
      FROM "CategoryTemplate" category WHERE category.id=${categoryId}::uuid
    `;
    if (!row) throw new CatalogReadError("CATALOG_NOT_FOUND");
    return CategoryTemplateSchema.parse(row.template);
  }
  async function getCurrentCatalogEntry(entryIdInput: string): Promise<CatalogEntryRevision> {
    const entryId = CatalogReadIdSchema.parse(entryIdInput);
    const [row] = await database.$queryRaw<
      Array<{ revision: number; snapshot: unknown; rollbackFromRevision: number | null }>
    >`
      SELECT entry.revision,revision.snapshot,revision."rollbackFromRevision"
      FROM "CatalogEntry" entry JOIN "CatalogRevision" revision ON revision."entryId"=entry.id AND revision.revision=entry.revision
      WHERE entry.id=${entryId}::uuid
    `;
    if (!row) throw new CatalogReadError("CATALOG_NOT_FOUND");
    return {
      revision: row.revision,
      state: CatalogSnapshotSchema.parse(row.snapshot),
      rollbackFromRevision: row.rollbackFromRevision,
    };
  }
  async function searchCatalog(input: unknown) {
    const value = CatalogSearchInputSchema.parse(input);
    const { mode, q, limit } = value;
    const categoryId = value.categoryId ?? null;
    const namespace = value.namespace ?? null;
    const identifierType = value.type ?? null;
    const identity = scope(["catalog", mode, q, categoryId, namespace, identifierType]);
    const after = afterCursor(value.cursor, identity);
    const pattern = `%${q.replace(/[\\%_]/gu, "\\$&")}%`;
    // Exact identifier lookup has a value-leading B-tree. Literal text matching can
    // scan canonical rows in V1; LIMIT bounds returned entries, not scanning work.
    // Preview projection happens in SQL: no descriptions, attributes or complete
    // revision snapshots are transferred for search hits.
    const rows = await database.$queryRaw<Array<{ result: unknown }>>`
      WITH candidates AS (
        SELECT entry.id,entry."categoryTemplateId",entry.revision
        FROM "CatalogEntry" entry
        WHERE (${categoryId}::uuid IS NULL OR entry."categoryTemplateId"=${categoryId}::uuid)
          AND (${after}::uuid IS NULL OR entry.id>${after}::uuid)
          AND (
            (${mode}='identifier' AND EXISTS (
              SELECT 1 FROM "CatalogExternalIdentifier" identifier
              WHERE identifier."entryId"=entry.id AND identifier.active AND identifier.value=${q}
                AND (${namespace}::text IS NULL OR identifier.namespace=${namespace})
                AND (${identifierType}::text IS NULL OR identifier.type=${identifierType})
                AND (identifier."variantId" IS NULL OR EXISTS(SELECT 1 FROM "CatalogVariant" v WHERE v.id=identifier."variantId" AND v."entryId"=entry.id AND v.active))
            )) OR (${mode}='text' AND (
              entry.authored#>>'{text,title}' ILIKE ${pattern}
              OR EXISTS(SELECT 1 FROM jsonb_array_elements(entry.authored#>'{text,translations}') t WHERE t->>'title' ILIKE ${pattern})
              OR EXISTS(SELECT 1 FROM "CatalogVariant" v WHERE v."entryId"=entry.id AND v.active AND (
                v.authored#>>'{text,title}' ILIKE ${pattern} OR v.authored->>'edition' ILIKE ${pattern} OR v.authored->>'reference' ILIKE ${pattern}
                OR EXISTS(SELECT 1 FROM jsonb_array_elements(v.authored#>'{text,translations}') t WHERE t->>'title' ILIKE ${pattern})
              ))
            ))
          )
        ORDER BY entry.id LIMIT ${limit + 1}
      )
      SELECT jsonb_build_object('id',entry.id,'revision',entry.revision,
        'category',jsonb_build_object('id',category.id,'key',category.key,'labels',
          (SELECT jsonb_object_agg(l.locale,l.label) FROM "CategoryTemplateLabel" l WHERE l."categoryTemplateId"=category.id AND l.locale IN ('de','en'))),
        'text',jsonb_build_object('language',revision.snapshot#>'{text,language}','title',revision.snapshot#>'{text,title}','translations',
          COALESCE((SELECT jsonb_agg(t.value-'description') FROM jsonb_array_elements(revision.snapshot#>'{text,translations}') t),'[]'::jsonb)),
        'variantCount',jsonb_array_length(revision.snapshot->'variants'),
        'identifierCount',jsonb_array_length(revision.snapshot->'identifiers'),
        'variants',COALESCE((SELECT jsonb_agg(v.dto ORDER BY v.position) FROM (
          SELECT position,jsonb_strip_nulls(jsonb_build_object('id',variant->'id','language',variant->'language','edition',variant->'edition','reference',variant->'reference',
            'text',jsonb_build_object('language',variant#>'{text,language}','title',variant#>'{text,title}','translations',
              COALESCE((SELECT jsonb_agg(t.value-'description') FROM jsonb_array_elements(variant#>'{text,translations}') t),'[]'::jsonb)))) AS dto
          FROM jsonb_array_elements(revision.snapshot->'variants') WITH ORDINALITY AS source(variant,position) ORDER BY position LIMIT 5
        ) v),'[]'::jsonb),
        'identifiers',COALESCE((SELECT jsonb_agg(i.identifier ORDER BY i.position) FROM (
          SELECT identifier,position FROM jsonb_array_elements(revision.snapshot->'identifiers') WITH ORDINALITY AS source(identifier,position) ORDER BY position LIMIT 5
        ) i),'[]'::jsonb)
      ) AS result
      FROM candidates entry JOIN "CategoryTemplate" category ON category.id=entry."categoryTemplateId"
      JOIN "CatalogRevision" revision ON revision."entryId"=entry.id AND revision.revision=entry.revision ORDER BY entry.id
    `;
    const results = rows.slice(0, limit).map((row) => CatalogSearchResultSchema.parse(row.result));
    return {
      results,
      nextCursor: rows.length > limit ? pageCursor(results.at(-1)!.id, identity) : null,
    };
  }
  async function listCatalogRevisions(entryIdInput: string, input: unknown = {}) {
    const entryId = CatalogReadIdSchema.parse(entryIdInput);
    const { limit, cursor } = CatalogHistoryInputSchema.parse(input);
    let before: number | null = null;
    if (cursor !== undefined) {
      try {
        if (!/^[A-Za-z0-9_-]{1,256}$/u.test(cursor)) throw new Error();
        const buffer = Buffer.from(cursor, "base64url");
        if (buffer.toString("base64url") !== cursor) throw new Error();
        const parsed = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(buffer),
        ) as Record<string, unknown>;
        if (
          !parsed ||
          Object.keys(parsed).sort().join(",") !== "before,entryId,v" ||
          parsed.v !== 1 ||
          parsed.entryId !== entryId
        )
          throw new Error();
        before = CatalogHistoryRevisionSchema.parse(parsed.before);
      } catch {
        throw new CatalogReadError("CATALOG_QUERY_INVALID");
      }
    }
    const rows = await database.$queryRaw<
      Array<{
        revision: number;
        createdAt: Date;
        rollbackFromRevision: number | null;
        text: unknown;
        sources: unknown;
      }>
    >`
      SELECT revision,"createdAt","rollbackFromRevision",snapshot->'text' AS text,snapshot->'sources' AS sources
      FROM "CatalogRevision" WHERE "entryId"=${entryId}::uuid AND (${before}::int IS NULL OR revision<${before}::int)
      ORDER BY revision DESC LIMIT ${limit + 1}
    `;
    // Distinguish an empty later page from an unknown canonical resource.
    if (!rows.length) await getCurrentCatalogEntry(entryId);
    const revisions: CatalogRevisionSummary[] = rows.slice(0, limit).map((row) => {
      const text = row.text as {
        language: unknown;
        title: unknown;
        translations?: Array<{ language: unknown; title: unknown }>;
      };
      return {
        revision: row.revision,
        createdAt: row.createdAt.toISOString(),
        rollbackFromRevision: row.rollbackFromRevision,
        text: CatalogTitleSummarySchema.parse({
          language: text.language,
          title: text.title,
          translations: (text.translations ?? []).map((value) => ({
            language: value.language,
            title: value.title,
          })),
        }),
        sources: CatalogSnapshotSchema.shape.sources.parse(row.sources ?? []),
      };
    });
    return {
      revisions,
      nextCursor:
        rows.length > limit
          ? Buffer.from(
              JSON.stringify({ v: 1, entryId, before: revisions.at(-1)!.revision }),
            ).toString("base64url")
          : null,
    };
  }
  async function getCatalogRevision(
    entryIdInput: string,
    revisionInput: number,
  ): Promise<CatalogEntryRevision> {
    const entryId = CatalogReadIdSchema.parse(entryIdInput);
    const revision = CatalogHistoryRevisionSchema.parse(revisionInput);
    const [row] = await database.$queryRaw<
      Array<{ revision: number; snapshot: unknown; rollbackFromRevision: number | null }>
    >`SELECT revision,snapshot,"rollbackFromRevision" FROM "CatalogRevision" WHERE "entryId"=${entryId}::uuid AND revision=${revision}`;
    if (!row) throw new CatalogReadError("CATALOG_NOT_FOUND");
    return {
      revision: row.revision,
      state: CatalogSnapshotSchema.parse(row.snapshot),
      rollbackFromRevision: row.rollbackFromRevision,
    };
  }
  return {
    searchCatalog,
    listCategories,
    getCategoryTemplate,
    getCurrentCatalogEntry,
    listCatalogRevisions,
    getCatalogRevision,
  };
}
