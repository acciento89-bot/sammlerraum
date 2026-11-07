import { Prisma } from "@sammlerraum/db/search-sql";
// All identifiers below are static implementation constants, never request input.
const clock = Prisma.sql`date_trunc('milliseconds',transaction_timestamp()) AS "readAt"`;
function text(column: string, maxBytes: number) {
  return Prisma.sql`CASE WHEN octet_length(${Prisma.raw(column)}) <= ${maxBytes} THEN ${Prisma.raw(column)} ELSE NULL END`;
}
const collection = Prisma.sql`CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id',c.id,'name',${text("c.name", 480)}) END`;
const custom = Prisma.sql`CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('id',d.id,'collectionId',d."collectionId",'name',${text("d.name", 480)},'type',d.type) END`;
function labels(
  table: "CategoryTemplateLabel" | "CatalogAttributeLabel" | "CatalogAttributeOptionLabel",
  column: "categoryTemplateId" | "definitionId" | "optionId",
  alias: "c" | "d" | "o",
) {
  const label = (locale: string) =>
    Prisma.sql`(SELECT ${text("l.label", 800)} FROM ${Prisma.raw(`"${table}"`)} l WHERE l.${Prisma.raw(`"${column}"`)}=${Prisma.raw(alias)}.id AND l.locale=${locale})`;
  return Prisma.sql`jsonb_build_object('de',${label("de")},'en',${label("en")})`;
}
const category = Prisma.sql`CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id',c.id,'key',c.key,'labels',${labels("CategoryTemplateLabel", "categoryTemplateId", "c")}) END`;
const scheme = Prisma.sql`CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('id',s.id,'categoryTemplateId',s."categoryTemplateId",'key',s.key,'labels',jsonb_build_object('de',${text('s."labelDe"', 800)},'en',${text('s."labelEn"', 800)}),'active',s.active) END`;
const condition = Prisma.sql`CASE WHEN o.id IS NULL THEN NULL ELSE jsonb_build_object('id',o.id,'schemeId',o."schemeId",'categoryTemplateId',o."categoryTemplateId",'labelKey',o."labelKey",'labels',jsonb_build_object('de',${text('o."labelDe"', 800)},'en',${text('o."labelEn"', 800)}),'active',o.active,'position',o.position,'normalizedBand',o."normalizedBand") END`;
const definition = Prisma.sql`jsonb_build_object('id',d.id,'categoryTemplateId',d."categoryTemplateId",'key',d.key,'type',d.type,'position',d.position,'labels',${labels("CatalogAttributeLabel", "definitionId", "d")})`;
const catalogOption = Prisma.sql`jsonb_build_object('id',o.id,'key',o.key,'position',o.position,'labels',${labels("CatalogAttributeOptionLabel", "optionId", "o")})`;
function pairs(references: readonly (readonly [string, string | null])[]) {
  return Prisma.join(
    references.map(
      ([parent, id], ordinal) => Prisma.sql`(${ordinal}::integer,${parent}::uuid,${id}::uuid)`,
    ),
  );
}
export function collectionsPageSql(actor: string, limit: number, after: string | null) {
  return Prisma.sql`SELECT ${clock}, COALESCE((SELECT jsonb_agg(value ORDER BY id) FROM (SELECT c.id,${collection} AS value FROM "Collection" c WHERE c."ownerId"=${actor} AND c."deletedAt" IS NULL AND (${after}::uuid IS NULL OR c.id>${after}::uuid) ORDER BY c.id LIMIT ${limit + 1}) page),'[]'::jsonb) AS payload`;
}
export function collectionsResolveSql(actor: string, ids: string[]) {
  return Prisma.sql`SELECT ${clock},(SELECT jsonb_agg(jsonb_build_object('id',i.id,'collection',${collection}) ORDER BY i.ordinal) FROM (VALUES ${Prisma.join(ids.map((id, n) => Prisma.sql`(${n}::integer,${id}::uuid)`))}) i(ordinal,id) LEFT JOIN "Collection" c ON c.id=i.id AND c."ownerId"=${actor} AND c."deletedAt" IS NULL) AS payload`;
}
export function customPageSql(actor: string, parent: string, limit: number, after: string | null) {
  return Prisma.sql`SELECT ${clock},jsonb_build_object('collection',${collection},'definitions',COALESCE((SELECT jsonb_agg(value ORDER BY id) FROM (SELECT d.id,${custom} AS value FROM "CustomFieldDefinition" d WHERE d."collectionId"=c.id AND (${after}::uuid IS NULL OR d.id>${after}::uuid) ORDER BY d.id LIMIT ${limit + 1}) page),'[]'::jsonb)) AS payload FROM (VALUES(1)) marker LEFT JOIN "Collection" c ON c.id=${parent}::uuid AND c."ownerId"=${actor} AND c."deletedAt" IS NULL`;
}
export function customResolveSql(actor: string, references: [string, string][]) {
  return Prisma.sql`SELECT ${clock},(SELECT jsonb_agg(jsonb_build_object('reference',jsonb_build_array(i.parent,i.id),'definition',${custom}) ORDER BY i.ordinal) FROM (VALUES ${pairs(references)}) i(ordinal,parent,id) LEFT JOIN "Collection" c ON c.id=i.parent AND c."ownerId"=${actor} AND c."deletedAt" IS NULL LEFT JOIN "CustomFieldDefinition" d ON d.id=i.id AND d."collectionId"=c.id) AS payload`;
}
export function customOptionsSql(actor: string, references: [string, string][]) {
  return Prisma.sql`SELECT i.ordinal,d.id,COALESCE((SELECT jsonb_agg(value ORDER BY position,id) FROM (SELECT o.id,o.position,CASE WHEN o.position BETWEEN 0 AND 99 THEN ${text("o.value", 800)} ELSE NULL END AS value FROM "CustomFieldOption" o WHERE o."fieldDefinitionId"=d.id ORDER BY o.position,o.id LIMIT 101) options),'[]'::jsonb) AS options FROM (VALUES ${pairs(references)}) i(ordinal,parent,id) LEFT JOIN "Collection" c ON c.id=i.parent AND c."ownerId"=${actor} AND c."deletedAt" IS NULL LEFT JOIN "CustomFieldDefinition" d ON d.id=i.id AND d."collectionId"=c.id ORDER BY i.ordinal`;
}
export function conditionsPageSql(parent: string) {
  return Prisma.sql`SELECT ${clock},jsonb_build_object('category',${category},'scheme',${scheme},'options',COALESCE((SELECT jsonb_agg(value ORDER BY id) FROM (SELECT o.id,${condition} AS value FROM "ConditionOption" o WHERE o."schemeId"=s.id AND o."categoryTemplateId"=c.id ORDER BY o.id LIMIT 101) options),'[]'::jsonb)) AS payload FROM (VALUES(1)) marker LEFT JOIN "CategoryTemplate" c ON c.id=${parent}::uuid LEFT JOIN "ConditionScheme" s ON s."categoryTemplateId"=c.id`;
}
export function conditionsResolveSql(references: [string, string | null][]) {
  return Prisma.sql`SELECT ${clock},(SELECT jsonb_agg(jsonb_build_object('reference',jsonb_build_array(i.parent,i.id),'category',${category},'scheme',${scheme},'option',${condition}) ORDER BY i.ordinal) FROM (VALUES ${pairs(references)}) i(ordinal,parent,id) LEFT JOIN "CategoryTemplate" c ON c.id=i.parent LEFT JOIN "ConditionScheme" s ON s."categoryTemplateId"=c.id LEFT JOIN "ConditionOption" o ON o.id=i.id AND o."schemeId"=s.id AND o."categoryTemplateId"=c.id) AS payload`;
}
export function catalogChoicesSql(parent: string) {
  return Prisma.sql`SELECT ${clock},jsonb_build_object('category',${category},'definitions',COALESCE((SELECT jsonb_agg(value ORDER BY position,id) FROM (SELECT d.id,d.position,${definition} AS value FROM "CatalogAttributeDefinition" d WHERE d."categoryTemplateId"=c.id ORDER BY d.position,d.id LIMIT 101) definitions),'[]'::jsonb)) AS payload FROM (VALUES(1)) marker LEFT JOIN "CategoryTemplate" c ON c.id=${parent}::uuid`;
}
export function catalogDefinitionSql(parent: string, id: string) {
  return Prisma.sql`SELECT ${clock},jsonb_build_object('category',${category},'definition',CASE WHEN d.id IS NULL THEN NULL ELSE ${definition} || jsonb_build_object('options',COALESCE((SELECT jsonb_agg(value ORDER BY position,id) FROM (SELECT o.id,o.position,${catalogOption} AS value FROM "CatalogAttributeOption" o WHERE o."definitionId"=d.id ORDER BY o.position,o.id LIMIT 101) options),'[]'::jsonb)) END) AS payload FROM (VALUES(1)) marker LEFT JOIN "CategoryTemplate" c ON c.id=${parent}::uuid LEFT JOIN "CatalogAttributeDefinition" d ON d.id=${id}::uuid AND d."categoryTemplateId"=c.id`;
}
