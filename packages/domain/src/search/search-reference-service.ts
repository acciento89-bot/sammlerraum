type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };
import { searchFail } from "@sammlerraum/contracts/item-search";
import * as contract from "@sammlerraum/contracts/search-references";
import { CategorySummarySchema } from "@sammlerraum/contracts/catalog-reads";
import type { SearchActor } from "./item-search-service";
import {
  runSearchRead,
  type SearchDatabase,
  type BoundedSearchReadTransaction,
} from "./search-read";
import {
  decodeReferenceCursor,
  encodeReferenceCursor,
  referenceContextHash,
} from "./search-reference-cursor";
import * as sql from "./search-reference-sql";
import type { Prisma } from "@sammlerraum/db/search-sql";
function actorId(actor: SearchActor) {
  if (!actor || typeof actor.userId !== "string" || !actor.userId || actor.userId.includes("\0"))
    return searchFail("SEARCH_INVALID");
  return actor.userId;
}
function checked<T>(schema: Schema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) return searchFail("SEARCH_INVARIANT");
  return result.data;
}
/** A bounded producer DTO and serialization remain inside the snapshot/time budget. */
export function finishReference<T>(
  tx: Pick<BoundedSearchReadTransaction, "checkBudget">,
  schema: Schema<T>,
  value: unknown,
): T {
  tx.checkBudget();
  const result = checked(schema, value);
  tx.checkBudget();
  const bytes = Buffer.byteLength(JSON.stringify(result));
  tx.checkBudget();
  if (bytes > contract.REFERENCE_MAX_RESPONSE_BYTES) return searchFail("SEARCH_UNAVAILABLE");
  return result;
}
async function read(tx: BoundedSearchReadTransaction, query: Prisma.Sql) {
  const rows = await tx.$queryRaw<{ readAt: Date; payload: unknown }[]>(query);
  if (
    rows.length !== 1 ||
    !(rows[0]!.readAt instanceof Date) ||
    !Number.isFinite(rows[0]!.readAt.getTime())
  )
    return searchFail("SEARCH_INVARIANT");
  return { readAt: rows[0]!.readAt.toISOString(), payload: rows[0]!.payload };
}
function cap(values: unknown[], max: number) {
  if (values.length > max) searchFail("SEARCH_UNAVAILABLE");
}
function pagination(
  actor: string,
  family: contract.ReferenceFamily,
  parent: string | null,
  input: { limit: number; cursor?: string | undefined },
) {
  const hash = referenceContextHash(actor, family, parent, input.limit);
  return {
    after: input.cursor ? decodeReferenceCursor(input.cursor, hash) : null,
    next: (rows: { id: string }[]) =>
      rows.length > input.limit
        ? encodeReferenceCursor({ v: 1, contextHash: hash, after: rows[input.limit - 1]!.id })
        : null,
  };
}
export function createSearchReferenceService(database: SearchDatabase) {
  return {
    async listCollections(actor: SearchActor, input: unknown) {
      const owner = actorId(actor),
        query = contract.parseReferenceInput(contract.ReferencePageInputSchema, input),
        page = pagination(owner, "COLLECTIONS", null, query);
      return runSearchRead(database, async (tx) => {
        const { readAt, payload } = await read(
          tx,
          sql.collectionsPageSql(owner, query.limit, page.after),
        );
        const rows = checked(
          contract.CollectionReferenceSchema.array().max(query.limit + 1),
          payload,
        );
        return finishReference(tx, contract.CollectionReferencePageSchema, {
          version: 1,
          readAt,
          collections: rows.slice(0, query.limit),
          nextCursor: page.next(rows),
        });
      });
    },
    async resolveCollections(actor: SearchActor, input: unknown) {
      const owner = actorId(actor),
        query = contract.parseReferenceInput(contract.CollectionReferencesInputSchema, input);
      return runSearchRead(database, async (tx) => {
        const { readAt, payload } = await read(tx, sql.collectionsResolveSql(owner, query.ids));
        const rows = checked(contract.ReferenceCollectionRowsSchema, payload);
        if (rows.length !== query.ids.length || rows.some((row, n) => row.id !== query.ids[n]))
          searchFail("SEARCH_INVARIANT");
        return finishReference(tx, contract.CollectionReferencesSchema, {
          version: 1,
          readAt,
          references: rows.map((row) => {
            const collection =
              row.collection === null
                ? null
                : checked(contract.CollectionReferenceSchema, row.collection);
            if (collection && collection.id !== row.id) searchFail("SEARCH_INVARIANT");
            return { ...row, collection, state: collection === null ? "UNAVAILABLE" : "AVAILABLE" };
          }),
        });
      });
    },
    async listCustomFields(actor: SearchActor, input: unknown) {
      const owner = actorId(actor),
        query = contract.parseReferenceInput(contract.CustomReferencePageInputSchema, input),
        page = pagination(owner, "CUSTOM_FIELDS", query.collectionId, query);
      return runSearchRead(database, async (tx) => {
        const { readAt, payload } = await read(
          tx,
          sql.customPageSql(owner, query.collectionId, query.limit, page.after),
        );
        const raw = checked(contract.ReferenceCustomPageRowSchema, payload);
        if (raw.collection === null) searchFail("FILTER_REFERENCE_INVALID");
        if (checked(contract.CollectionReferenceSchema, raw.collection).id !== query.collectionId)
          searchFail("SEARCH_INVARIANT");
        const rows = checked(
          contract.CustomReferenceSchema.array().max(query.limit + 1),
          raw.definitions,
        );
        if (rows.some((row) => row.collectionId !== query.collectionId))
          searchFail("SEARCH_INVARIANT");
        return finishReference(tx, contract.CustomReferencePageSchema, {
          version: 1,
          readAt,
          collection: raw.collection,
          definitions: rows.slice(0, query.limit),
          nextCursor: page.next(rows),
        });
      });
    },
    async resolveCustomFields(actor: SearchActor, input: unknown) {
      const owner = actorId(actor),
        query = contract.parseReferenceInput(contract.CustomReferencesInputSchema, input);
      return runSearchRead(database, async (tx) => {
        const { readAt, payload } = await read(tx, sql.customResolveSql(owner, query.references));
        const rows = checked(contract.ReferenceCustomRowsSchema, payload);
        if (
          rows.length !== query.references.length ||
          rows.some(
            (row, n) => JSON.stringify(row.reference) !== JSON.stringify(query.references[n]),
          )
        )
          searchFail("SEARCH_INVARIANT");
        const entries = rows.map((row) => ({
          ...row,
          definition:
            row.definition === null
              ? null
              : checked(contract.CustomReferenceSchema, row.definition),
        }));
        if (
          entries.some(
            (row) =>
              row.definition &&
              (row.definition.id !== row.reference[1] ||
                row.definition.collectionId !== row.reference[0]),
          )
        )
          searchFail("SEARCH_INVARIANT");
        if (query.detail === "OPTIONS") {
          const options = checked(
            contract.ReferenceCustomOptionRowsSchema,
            await tx.$queryRaw(sql.customOptionsSql(owner, query.references)),
          );
          if (options.length !== entries.length) searchFail("SEARCH_INVARIANT");
          return finishReference(tx, contract.CustomReferencesSchema, {
            version: 1,
            readAt,
            detail: query.detail,
            references: entries.map((row, n) => {
              const value = options[n]!;
              if (value.ordinal !== n || value.id !== (row.definition?.id ?? null))
                searchFail("SEARCH_INVARIANT");
              cap(value.options, 100);
              if (!row.definition && value.options.length) searchFail("SEARCH_INVARIANT");
              return {
                ...row,
                state: row.definition ? "AVAILABLE" : "UNAVAILABLE",
                definition: row.definition ? { ...row.definition, options: value.options } : null,
              };
            }),
          });
        }
        return finishReference(tx, contract.CustomReferencesSchema, {
          version: 1,
          readAt,
          detail: query.detail,
          references: entries.map((row) => ({
            ...row,
            state: row.definition ? "AVAILABLE" : "UNAVAILABLE",
          })),
        });
      });
    },
    async listConditions(actor: SearchActor, input: unknown) {
      const owner = actorId(actor),
        query = contract.parseReferenceInput(contract.ConditionReferencePageInputSchema, input),
        page = pagination(owner, "CONDITIONS", query.categoryId, query);
      return runSearchRead(database, async (tx) => {
        const { readAt, payload } = await read(tx, sql.conditionsPageSql(query.categoryId));
        const raw = checked(contract.ReferenceConditionPageRowSchema, payload);
        if (raw.category === null) searchFail("FILTER_REFERENCE_INVALID");
        if (checked(CategorySummarySchema, raw.category).id !== query.categoryId)
          searchFail("SEARCH_INVARIANT");
        cap(raw.options, 100);
        const all = checked(contract.ConditionReferenceOptionSchema.array(), raw.options);
        const scheme =
          raw.scheme === null ? null : checked(contract.ConditionSchemeSummarySchema, raw.scheme);
        if (
          (scheme && scheme.categoryTemplateId !== query.categoryId) ||
          all.some((o) => o.categoryTemplateId !== query.categoryId || o.schemeId !== scheme?.id)
        )
          searchFail("SEARCH_INVARIANT");
        const rows = all.filter((row) => !page.after || row.id > page.after);
        return finishReference(tx, contract.ConditionReferencePageSchema, {
          version: 1,
          readAt,
          category: raw.category,
          scheme,
          options: rows.slice(0, query.limit),
          nextCursor: page.next(rows),
        });
      });
    },
    async resolveConditions(actor: SearchActor, input: unknown) {
      actorId(actor);
      const query = contract.parseReferenceInput(contract.ConditionReferencesInputSchema, input);
      return runSearchRead(database, async (tx) => {
        const { readAt, payload } = await read(tx, sql.conditionsResolveSql(query.references));
        const rows = checked(contract.ReferenceConditionRowsSchema, payload);
        if (
          rows.length !== query.references.length ||
          rows.some(
            (row, n) => JSON.stringify(row.reference) !== JSON.stringify(query.references[n]),
          )
        )
          searchFail("SEARCH_INVARIANT");
        return finishReference(tx, contract.ConditionReferencesSchema, {
          version: 1,
          readAt,
          references: rows.map((row) => {
            if (row.category === null || (row.reference[1] !== null && row.option === null))
              return {
                reference: row.reference,
                state: "UNAVAILABLE",
                category: null,
                scheme: null,
                option: null,
              };
            if (checked(CategorySummarySchema, row.category).id !== row.reference[0])
              searchFail("SEARCH_INVARIANT");
            const scheme =
                row.scheme === null
                  ? null
                  : checked(contract.ConditionSchemeSummarySchema, row.scheme),
              option =
                row.option === null
                  ? null
                  : checked(contract.ConditionReferenceOptionSchema, row.option);
            if (
              (scheme && scheme.categoryTemplateId !== row.reference[0]) ||
              (option &&
                (option.id !== row.reference[1] ||
                  option.categoryTemplateId !== row.reference[0] ||
                  option.schemeId !== scheme?.id))
            )
              searchFail("SEARCH_INVARIANT");
            return { ...row, state: "AVAILABLE" };
          }),
        });
      });
    },
    async getCatalogDefinitionChoices(actor: SearchActor, categoryId: string) {
      actorId(actor);
      const parent = contract.parseReferenceInput(contract.ReferenceIdSchema, categoryId);
      return runSearchRead(database, async (tx) => {
        const { readAt, payload } = await read(tx, sql.catalogChoicesSql(parent));
        const raw = checked(contract.ReferenceCatalogChoicesRowSchema, payload);
        if (raw.category === null) searchFail("FILTER_REFERENCE_INVALID");
        cap(raw.definitions, 100);
        const result = finishReference(tx, contract.CatalogDefinitionChoicesSchema, {
          version: 1,
          readAt,
          ...raw,
        });
        if (
          result.category.id !== parent ||
          result.definitions.some((d) => d.categoryTemplateId !== parent)
        )
          searchFail("SEARCH_INVARIANT");
        return result;
      });
    },
    async getCatalogDefinition(actor: SearchActor, categoryId: string, definitionId: string) {
      actorId(actor);
      const parent = contract.parseReferenceInput(contract.ReferenceIdSchema, categoryId),
        id = contract.parseReferenceInput(contract.ReferenceIdSchema, definitionId);
      return runSearchRead(database, async (tx) => {
        const { readAt, payload } = await read(tx, sql.catalogDefinitionSql(parent, id));
        const raw = checked(contract.ReferenceCatalogDefinitionRowSchema, payload);
        if (raw.category === null || raw.definition === null)
          searchFail("FILTER_REFERENCE_INVALID");
        const data = checked(contract.ReferenceOptionsRowSchema, raw.definition);
        cap(data.options, 100);
        const result = finishReference(tx, contract.CatalogDefinitionReferenceSchema, {
          version: 1,
          readAt,
          ...raw,
        });
        if (
          result.category.id !== parent ||
          result.definition.id !== id ||
          result.definition.categoryTemplateId !== parent
        )
          searchFail("SEARCH_INVARIANT");
        return result;
      });
    },
  };
}
