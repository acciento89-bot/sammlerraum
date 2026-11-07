import { Prisma } from "@sammlerraum/db/search-sql";
import { catalogGuard, customGuard } from "./search-typed-guards";
import { or } from "./search-compiler";
const selected = Prisma.sql`a."entryId"=i."catalogEntryId" AND a."categoryTemplateId"=i."categoryTemplateId" AND ((a."variantId" IS NULL AND a."targetKey"='entry') OR (a."variantId"=i."catalogVariantId" AND a."targetKey"=i."catalogVariantId"::text))`;
const catalogFrom = Prisma.sql`FROM "CatalogAttributeValue" a JOIN "CatalogAttributeDefinition" d ON d.id=a."definitionId" AND d."categoryTemplateId"=a."categoryTemplateId"`;
const relevant = Prisma.sql`d.type IN ('SHORT_TEXT','LONG_TEXT','SINGLE_SELECT','MULTI_SELECT')`;
const guards = Prisma.sql`CASE d.type WHEN 'SHORT_TEXT' THEN ${catalogGuard("SHORT_TEXT")} WHEN 'LONG_TEXT' THEN ${catalogGuard("LONG_TEXT")} WHEN 'SINGLE_SELECT' THEN ${catalogGuard("SINGLE_SELECT")} WHEN 'MULTI_SELECT' THEN ${catalogGuard("MULTI_SELECT")} ELSE TRUE END`;
export const invalidBroadFacts = or([
  Prisma.sql`EXISTS(SELECT 1 ${catalogFrom} WHERE ${selected} AND ${relevant} AND NOT COALESCE((${guards}),FALSE))`,
  Prisma.sql`EXISTS(SELECT 1 FROM "CustomFieldValue" v WHERE v."itemId"=i.id AND v."collectionId"=i."collectionId" AND ((v."fieldType"='SHORT_TEXT' AND NOT COALESCE((${customGuard("SHORT_TEXT")}),FALSE)) OR (v."fieldType"='LONG_TEXT' AND NOT COALESCE((${customGuard("LONG_TEXT")}),FALSE))))`,
]);
/** Broad text is literal NFKC/ILIKE with the fixed deterministic root ICU collation. */
export function compileBroadText(query: string, owner: string): Prisma.Sql {
  const pattern = `%${query.replace(/[\\%_]/gu, (c) => `\\${c}`)}%`;
  const matches = (column: Prisma.Sql) =>
    Prisma.sql`COALESCE(normalize(${column},NFKC) COLLATE pg_catalog."und-x-icu" ILIKE ${pattern} ESCAPE ${"\\"},FALSE)`;
  const title = (column: Prisma.Sql) =>
    or([
      Prisma.sql`CASE WHEN jsonb_typeof(${column}->'text'->'title')='string' THEN ${matches(Prisma.sql`${column}->'text'->>'title'`)} ELSE FALSE END`,
      Prisma.sql`EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${column}->'text'->'translations')='array' THEN ${column}->'text'->'translations' ELSE '[]'::jsonb END) tr WHERE jsonb_typeof(tr->'title')='string' AND ${matches(Prisma.sql`tr->>'title'`)})`,
    ]);
  return or([
    matches(Prisma.sql`i.title`),
    matches(Prisma.sql`i."publicDescription"`),
    Prisma.sql`EXISTS(SELECT 1 FROM "ItemTag" it JOIN "Tag" t ON t.id=it."tagId" WHERE it."itemId"=i.id AND t."ownerId"=${owner} AND ${matches(Prisma.sql`t."normalizedName"`)})`,
    Prisma.sql`EXISTS(SELECT 1 FROM "ItemIdentifier" x WHERE x."itemId"=i.id AND ${matches(Prisma.sql`x.value`)})`,
    Prisma.sql`EXISTS(SELECT 1 FROM "Grading" g WHERE g."itemId"=i.id AND g."ownerId"=${owner} AND ${or([matches(Prisma.sql`g.provider`), matches(Prisma.sql`g.grade`), matches(Prisma.sql`g."certificateNo"`)])})`,
    Prisma.sql`EXISTS(SELECT 1 FROM "CustomFieldValue" v WHERE v."itemId"=i.id AND v."collectionId"=i."collectionId" AND ${or(
      [
        Prisma.sql`v."fieldType"='SHORT_TEXT' AND ${matches(Prisma.sql`v."shortTextValue"`)}`,
        Prisma.sql`v."fieldType"='LONG_TEXT' AND ${matches(Prisma.sql`v."longTextValue"`)}`,
        Prisma.sql`v."fieldType"='SINGLE_SELECT' AND EXISTS(SELECT 1 FROM "CustomFieldOption" o WHERE o.id=v."singleSelectOptionId" AND o."fieldDefinitionId"=v."fieldDefinitionId" AND ${matches(Prisma.sql`o.value`)})`,
        Prisma.sql`v."fieldType"='MULTI_SELECT' AND EXISTS(SELECT 1 FROM "CustomFieldMultiSelectValue" mv JOIN "CustomFieldOption" o ON o.id=mv."optionId" AND o."fieldDefinitionId"=mv."fieldDefinitionId" WHERE mv."itemId"=v."itemId" AND mv."fieldDefinitionId"=v."fieldDefinitionId" AND ${matches(Prisma.sql`o.value`)})`,
      ],
    )})`,
    Prisma.sql`EXISTS(SELECT 1 FROM "CategoryTemplateLabel" l WHERE l."categoryTemplateId"=i."categoryTemplateId" AND l.locale IN ('de','en') AND ${matches(Prisma.sql`l.label`)})`,
    Prisma.sql`EXISTS(SELECT 1 FROM "CatalogEntry" e WHERE e.id=i."catalogEntryId" AND e."categoryTemplateId"=i."categoryTemplateId" AND ${title(Prisma.sql`e.authored`)})`,
    Prisma.sql`EXISTS(SELECT 1 FROM "CatalogVariant" e WHERE e.id=i."catalogVariantId" AND e."entryId"=i."catalogEntryId" AND ${title(Prisma.sql`e.authored`)})`,
    Prisma.sql`EXISTS(SELECT 1 ${catalogFrom} WHERE ${selected} AND ${relevant} AND ${or([
      Prisma.sql`d.type IN ('SHORT_TEXT','LONG_TEXT','SINGLE_SELECT') AND ${matches(Prisma.sql`a.value #>> '{}'`)}`,
      Prisma.sql`d.type IN ('SINGLE_SELECT','MULTI_SELECT') AND EXISTS(SELECT 1 FROM "CatalogAttributeOption" o LEFT JOIN "CatalogAttributeOptionLabel" l ON l."optionId"=o.id AND l.locale IN ('de','en') WHERE o."definitionId"=a."definitionId" AND ((d.type='SINGLE_SELECT' AND o.key COLLATE pg_catalog."C"=(a.value #>> '{}')) OR (d.type='MULTI_SELECT' AND a.value @> jsonb_build_array(o.key))) AND ${or([matches(Prisma.sql`o.key`), matches(Prisma.sql`l.label`)])})`,
    ])})`,
  ]);
}
