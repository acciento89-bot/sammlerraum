import { Prisma } from "@sammlerraum/db/search-sql";
import type { ItemFilterLeaf, ItemFilterNode } from "@sammlerraum/contracts/search";
import { searchFail, type SearchLifecycle } from "@sammlerraum/contracts/item-search";
import { catalogGuard, catalogScalar, customGuard } from "./search-typed-guards";
export const TRUE = Prisma.sql`TRUE`;
export const and = (values: Prisma.Sql[]) =>
  values.length ? Prisma.sql`(${Prisma.join(values, " AND ")})` : TRUE;
export const or = (values: Prisma.Sql[]) =>
  values.length ? Prisma.sql`(${Prisma.join(values, " OR ")})` : Prisma.sql`FALSE`;
type Scalar = string | number | boolean;
type Test =
  | { op: "present" | "missing" }
  | { op: "eq" | "lt" | "lte" | "gt" | "gte" | "contains" | "startsWith"; value: Scalar }
  | { op: "in" | "hasAny" | "hasAll"; values: Scalar[] }
  | { op: "between"; min: Scalar; max: Scalar };
type Cast = "text" | "uuid" | "numeric" | "date" | "timestamp" | "boolean";
export function operand(value: Scalar, cast: Cast): Prisma.Sql {
  switch (cast) {
    case "uuid":
      return Prisma.sql`${value}::uuid`;
    case "numeric":
      return Prisma.sql`${value}::numeric`;
    case "date":
      return Prisma.sql`${value}::date`;
    case "timestamp":
      return Prisma.sql`${value}::timestamp`;
    case "boolean":
      return Prisma.sql`${value}::boolean`;
    case "text":
      return Prisma.sql`${value}::text COLLATE pg_catalog."C"`;
  }
}
export function comparison(column: Prisma.Sql, test: Test, cast: Cast = "text"): Prisma.Sql {
  const c = cast === "text" ? Prisma.sql`(${column})::text COLLATE pg_catalog."C"` : column;
  const v = (value: Scalar) => operand(value, cast);
  let predicate: Prisma.Sql;
  switch (test.op) {
    case "present":
      return Prisma.sql`${c} IS NOT NULL`;
    case "missing":
      return Prisma.sql`${c} IS NULL`;
    case "eq":
      predicate = Prisma.sql`${c}=${v(test.value)}`;
      break;
    case "in":
      predicate = Prisma.sql`${c} IN (${Prisma.join(test.values.map(v))})`;
      break;
    case "lt":
      predicate = Prisma.sql`${c}<${v(test.value)}`;
      break;
    case "lte":
      predicate = Prisma.sql`${c}<=${v(test.value)}`;
      break;
    case "gt":
      predicate = Prisma.sql`${c}>${v(test.value)}`;
      break;
    case "gte":
      predicate = Prisma.sql`${c}>=${v(test.value)}`;
      break;
    case "between":
      predicate = Prisma.sql`${c} BETWEEN ${v(test.min)} AND ${v(test.max)}`;
      break;
    case "contains":
      predicate = Prisma.sql`strpos(${c},${v(test.value)})>0`;
      break;
    case "startsWith":
      predicate = Prisma.sql`left(${c},char_length(${v(test.value)}))=${v(test.value)}`;
      break;
    case "hasAny":
    case "hasAll":
      return searchFail("SEARCH_INVARIANT");
  }
  return Prisma.sql`COALESCE((${predicate}),FALSE)`;
}
export function leaves(node: ItemFilterNode | null): ItemFilterLeaf[] {
  if (!node) return [];
  if ("children" in node) return node.children.flatMap(leaves);
  if (node.kind === "not") return leaves(node.child);
  return [node];
}
export function ownedCandidates(owner: string, lifecycle: SearchLifecycle): Prisma.Sql {
  const life =
    lifecycle === "ACTIVE"
      ? Prisma.sql`i."archivedAt" IS NULL AND i."disposedAt" IS NULL`
      : lifecycle === "ARCHIVED"
        ? Prisma.sql`i."archivedAt" IS NOT NULL AND i."disposedAt" IS NULL`
        : lifecycle === "DISPOSED"
          ? Prisma.sql`i."disposedAt" IS NOT NULL`
          : TRUE;
  return and([
    Prisma.sql`i."ownerId"=${owner} AND c."ownerId"=${owner} AND i."deletedAt" IS NULL AND c."deletedAt" IS NULL`,
    life,
  ]);
}
export const candidateFrom = Prisma.sql`FROM "CollectibleItem" i JOIN "Collection" c ON c.id=i."collectionId" AND c."ownerId"=i."ownerId"`;
function presence(exists: Prisma.Sql, test: { op: string }) {
  return test.op === "missing" ? Prisma.sql`NOT (${exists})` : exists;
}
const customColumn = {
  SHORT_TEXT: Prisma.sql`v."shortTextValue"`,
  LONG_TEXT: Prisma.sql`v."longTextValue"`,
  INTEGER: Prisma.sql`v."integerValue"`,
  DECIMAL: Prisma.sql`v."decimalValue"`,
  DATE: Prisma.sql`v."dateValue"`,
  BOOLEAN: Prisma.sql`v."booleanValue"`,
  URL: Prisma.sql`v."urlValue"`,
  MONEY: Prisma.sql`v."moneyAmountMinor"`,
  SINGLE_SELECT: Prisma.sql`o."normalizedValue"`,
  MULTI_SELECT: Prisma.sql`o."normalizedValue"`,
};
const fieldCast = (type: string): Cast =>
  type === "INTEGER" || type === "DECIMAL"
    ? "numeric"
    : type === "DATE"
      ? "date"
      : type === "BOOLEAN"
        ? "boolean"
        : "text";
export function catalogTarget(target: "ENTRY" | "SELECTED_VARIANT"): Prisma.Sql {
  return target === "ENTRY"
    ? Prisma.sql`a."variantId" IS NULL AND a."targetKey"='entry'`
    : Prisma.sql`a."variantId"=i."catalogVariantId" AND a."targetKey"=i."catalogVariantId"::text`;
}
export function exactCatalog(
  leaf: Extract<ItemFilterLeaf, { kind: "catalogAttribute" }>,
): Prisma.Sql {
  return and([
    Prisma.sql`a."entryId"=i."catalogEntryId" AND a."categoryTemplateId"=i."categoryTemplateId" AND a."definitionId"=${leaf.selector.definitionId}::uuid`,
    catalogTarget(leaf.selector.target),
  ]);
}
export function compileFilter(node: ItemFilterNode, owner: string): Prisma.Sql {
  if ("children" in node)
    return (node.kind === "and" ? and : or)(node.children.map((n) => compileFilter(n, owner)));
  if (node.kind === "not") return Prisma.sql`NOT (${compileFilter(node.child, owner)})`;
  switch (node.kind) {
    case "collection":
      return comparison(Prisma.sql`i."collectionId"`, node.test, "uuid");
    case "category":
      return comparison(Prisma.sql`i."categoryTemplateId"`, node.test, "uuid");
    case "condition":
      return and([
        Prisma.sql`COALESCE(i."categoryTemplateId"=${node.categoryTemplateId}::uuid,FALSE)`,
        comparison(Prisma.sql`i."conditionOptionId"`, node.test, "uuid"),
      ]);
    case "visibility":
      return comparison(Prisma.sql`i.visibility`, node.test);
    case "tradeStatus":
      return comparison(Prisma.sql`i."tradeStatus"`, node.test);
    case "createdAt":
      return comparison(Prisma.sql`i."createdAt"`, node.test, "timestamp");
    case "updatedAt":
      return comparison(Prisma.sql`i."updatedAt"`, node.test, "timestamp");
    case "acquisitionDate":
      return comparison(Prisma.sql`i."acquisitionDate"`, node.test, "date");
    case "purchaseMoney":
      if (node.test.op === "range") return searchFail("SEARCH_INVARIANT");
      return presence(
        Prisma.sql`i."purchaseAmountMinor" IS NOT NULL AND i."purchaseCurrency" IS NOT NULL`,
        node.test,
      );
    case "grading": {
      const clauses = [Prisma.sql`g."itemId"=i.id AND g."ownerId"=${owner}`];
      const t = node.test;
      if (t.op === "authored" || t.op === "comparable") {
        clauses.push(
          comparison(Prisma.sql`g."providerKey"`, {
            op: "eq",
            value: t.provider.replace(/[A-Z]/gu, (x) => x.toLowerCase()),
          }),
        );
        if (t.op === "authored") {
          if (t.grade !== undefined)
            clauses.push(comparison(Prisma.sql`g.grade`, { op: "eq", value: t.grade }));
          if (t.certificateNo !== undefined)
            clauses.push(
              comparison(Prisma.sql`g."certificateNo"`, { op: "eq", value: t.certificateNo }),
            );
        } else
          clauses.push(
            comparison(Prisma.sql`g."comparableScale"`, { op: "eq", value: t.scale }),
            comparison(Prisma.sql`g."comparableValue"`, t.value, "numeric"),
          );
      }
      return presence(Prisma.sql`EXISTS(SELECT 1 FROM "Grading" g WHERE ${and(clauses)})`, t);
    }
    case "manualMoney": {
      const latest = Prisma.sql`SELECT v."amountMinor",v.currency,v."minorUnitExponent" FROM "Valuation" v WHERE v."itemId"=i.id AND v."ownerId"=${owner} AND v.type='MANUAL' AND v.basis='PER_UNIT' ORDER BY v."observedAt" DESC,v."createdAt" DESC,v.id DESC LIMIT 1`;
      const t = node.test;
      if (t.op !== "range") return presence(Prisma.sql`EXISTS(${latest})`, t);
      const clauses = [
        Prisma.sql`m.currency=${t.unit.currency} AND m."minorUnitExponent"=${t.unit.minorUnitExponent}`,
      ];
      if (t.minMinor !== undefined)
        clauses.push(Prisma.sql`m."amountMinor">=${t.minMinor}::bigint`);
      if (t.maxMinor !== undefined)
        clauses.push(Prisma.sql`m."amountMinor"<=${t.maxMinor}::bigint`);
      return Prisma.sql`EXISTS(SELECT 1 FROM (${latest}) m WHERE ${and(clauses)})`;
    }
    case "tags": {
      const base = Prisma.sql`FROM "ItemTag" it JOIN "Tag" t ON t.id=it."tagId" WHERE it."itemId"=i.id AND t."ownerId"=${owner}`;
      const t = node.test;
      if (t.op === "present" || t.op === "missing")
        return presence(Prisma.sql`EXISTS(SELECT 1 ${base})`, t);
      return (t.op === "hasAll" ? and : or)(
        t.values.map(
          (value) =>
            Prisma.sql`EXISTS(SELECT 1 ${base} AND t."normalizedName" COLLATE pg_catalog."C"=${value})`,
        ),
      );
    }
    case "media": {
      const link =
        node.mediaKind === "IMAGE" ? Prisma.sql`"MediaLink"` : Prisma.sql`"DocumentLink"`;
      return presence(
        Prisma.sql`EXISTS(SELECT 1 FROM ${link} l JOIN "MediaAsset" m ON m.id=l."assetId" AND m."ownerId"=l."ownerId" WHERE l."itemId"=i.id AND l."ownerId"=${owner} AND m."ownerId"=${owner} AND m.kind::text=${node.mediaKind} AND m.status='READY' AND m."cleanupStartedAt" IS NULL ${node.documentCategory ? Prisma.sql`AND l.category::text=${node.documentCategory}` : Prisma.empty})`,
        node.test,
      );
    }
    case "customField": {
      const scope = Prisma.sql`i."collectionId"=${node.selector.collectionId}::uuid`;
      const base = Prisma.sql`v."itemId"=i.id AND v."collectionId"=i."collectionId" AND v."fieldDefinitionId"=${node.selector.definitionId}::uuid AND v."fieldType"::text=${node.predicate.valueType}`;
      const t = node.predicate.test;
      if (t.op === "present" || t.op === "missing")
        return and([
          scope,
          presence(Prisma.sql`EXISTS(SELECT 1 FROM "CustomFieldValue" v WHERE ${base})`, t),
        ]);
      if (t.op === "range") return searchFail("SEARCH_INVARIANT");
      let match: Prisma.Sql;
      if (node.predicate.valueType === "MULTI_SELECT" && (t.op === "hasAny" || t.op === "hasAll"))
        match = (t.op === "hasAll" ? and : or)(
          t.values.map(
            (value) =>
              Prisma.sql`EXISTS(SELECT 1 FROM "CustomFieldMultiSelectValue" mv JOIN "CustomFieldOption" o ON o.id=mv."optionId" AND o."fieldDefinitionId"=mv."fieldDefinitionId" WHERE mv."itemId"=v."itemId" AND mv."fieldDefinitionId"=v."fieldDefinitionId" AND o."normalizedValue" COLLATE pg_catalog."C"=${value})`,
          ),
        );
      else if (node.predicate.valueType === "SINGLE_SELECT")
        match = Prisma.sql`EXISTS(SELECT 1 FROM "CustomFieldOption" o WHERE o.id=v."singleSelectOptionId" AND o."fieldDefinitionId"=v."fieldDefinitionId" AND ${comparison(customColumn.SINGLE_SELECT, t)})`;
      else
        match = comparison(
          customColumn[node.predicate.valueType],
          t,
          fieldCast(node.predicate.valueType),
        );
      return and([
        scope,
        Prisma.sql`EXISTS(SELECT 1 FROM "CustomFieldValue" v WHERE ${base} AND ${match})`,
      ]);
    }
    case "catalogAttribute": {
      const scope = Prisma.sql`COALESCE(i."categoryTemplateId"=${node.selector.categoryTemplateId}::uuid,FALSE)`;
      const base = exactCatalog(node);
      const t = node.predicate.test;
      if (t.op === "present" || t.op === "missing")
        return and([
          scope,
          presence(Prisma.sql`EXISTS(SELECT 1 FROM "CatalogAttributeValue" a WHERE ${base})`, t),
        ]);
      if (t.op === "range") return searchFail("SEARCH_INVARIANT");
      const match =
        t.op === "hasAll" || t.op === "hasAny"
          ? (t.op === "hasAll" ? and : or)(
              t.values.map((v) => Prisma.sql`a.value @> ${JSON.stringify([v])}::jsonb`),
            )
          : comparison(
              catalogScalar(node.predicate.valueType),
              t,
              fieldCast(node.predicate.valueType),
            );
      return and([
        scope,
        Prisma.sql`EXISTS(SELECT 1 FROM "CatalogAttributeValue" a WHERE ${base} AND ${match})`,
      ]);
    }
    case "duplicate":
    case "marketMoney":
      return searchFail("SEARCH_INVARIANT");
  }
  const exhaustive: never = node;
  return exhaustive;
}
/** One bounded boolean reference query; no per-leaf network round trips. */
export function referencePredicate(nodes: ItemFilterLeaf[], owner: string): Prisma.Sql {
  const checks: Prisma.Sql[] = [];
  const category = (id: string) =>
    checks.push(Prisma.sql`EXISTS(SELECT 1 FROM "CategoryTemplate" r WHERE r.id=${id}::uuid)`);
  const collection = (id: string) =>
    checks.push(
      Prisma.sql`EXISTS(SELECT 1 FROM "Collection" r WHERE r.id=${id}::uuid AND r."ownerId"=${owner} AND r."deletedAt" IS NULL)`,
    );
  for (const node of nodes) {
    if (node.kind === "collection" || node.kind === "category") {
      const t = node.test;
      if (t.op === "eq") (node.kind === "collection" ? collection : category)(t.value);
      if (t.op === "in") t.values.forEach(node.kind === "collection" ? collection : category);
    }
    if (node.kind === "condition") {
      category(node.categoryTemplateId);
      const t = node.test;
      const ids = t.op === "eq" ? [t.value] : t.op === "in" ? t.values : [];
      for (const id of ids)
        checks.push(
          Prisma.sql`EXISTS(SELECT 1 FROM "ConditionOption" r WHERE r.id=${id}::uuid AND r."categoryTemplateId"=${node.categoryTemplateId}::uuid)`,
        );
    }
    if (node.kind === "customField") {
      collection(node.selector.collectionId);
      checks.push(
        Prisma.sql`EXISTS(SELECT 1 FROM "CustomFieldDefinition" r WHERE r.id=${node.selector.definitionId}::uuid AND r."collectionId"=${node.selector.collectionId}::uuid AND r.type::text=${node.predicate.valueType})`,
      );
    }
    if (node.kind === "catalogAttribute") {
      category(node.selector.categoryTemplateId);
      checks.push(
        Prisma.sql`EXISTS(SELECT 1 FROM "CatalogAttributeDefinition" r WHERE r.id=${node.selector.definitionId}::uuid AND r."categoryTemplateId"=${node.selector.categoryTemplateId}::uuid AND r.type::text=${node.predicate.valueType})`,
      );
      if (
        node.predicate.valueType === "SINGLE_SELECT" ||
        node.predicate.valueType === "MULTI_SELECT"
      ) {
        const t = node.predicate.test;
        const keys = t.op === "eq" ? [t.value] : "values" in t ? t.values : [];
        for (const key of keys)
          checks.push(
            Prisma.sql`EXISTS(SELECT 1 FROM "CatalogAttributeOption" r WHERE r."definitionId"=${node.selector.definitionId}::uuid AND r.key COLLATE pg_catalog."C"=${key})`,
          );
      }
    }
  }
  return and(checks);
}
export function invalidFacts(nodes: ItemFilterLeaf[]): Prisma.Sql {
  return or(
    nodes.flatMap((n) =>
      n.kind === "catalogAttribute"
        ? [
            Prisma.sql`EXISTS(SELECT 1 FROM "CatalogAttributeValue" a WHERE i."categoryTemplateId"=${n.selector.categoryTemplateId}::uuid AND ${exactCatalog(n)} AND NOT COALESCE((${catalogGuard(n.predicate.valueType)}),FALSE))`,
          ]
        : n.kind === "customField"
          ? [
              Prisma.sql`EXISTS(SELECT 1 FROM "CustomFieldValue" v WHERE i."collectionId"=${n.selector.collectionId}::uuid AND v."itemId"=i.id AND v."collectionId"=i."collectionId" AND v."fieldDefinitionId"=${n.selector.definitionId}::uuid AND NOT COALESCE((${customGuard(n.predicate.valueType)}),FALSE))`,
            ]
          : [],
    ),
  );
}
