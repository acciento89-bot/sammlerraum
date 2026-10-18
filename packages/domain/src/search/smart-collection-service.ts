import { randomUUID, createHash } from "node:crypto";
import { Prisma } from "@sammlerraum/db/search-sql";
import { FilterValidationError } from "@sammlerraum/contracts/search";
import {
  ItemSearchError,
  SEARCH_MAX_RESPONSE_BYTES,
  searchFail,
} from "@sammlerraum/contracts/item-search";
import {
  smartFail,
  parseSmartCollectionMutation,
  parseSmartCollectionDefinition,
  parseSmartCollectionId,
  parseSmartCollectionUpdate,
  parseSmartCollectionDelete,
  parseSmartCollectionPageInput,
  SmartCollectionSummarySchema,
  SMART_COLLECTION_MAX_REVISION,
  type SmartCollectionDetail,
  type SmartCollectionSummary,
} from "@sammlerraum/contracts/smart-collections";
import { executeItemSearch, checkedSearchTotal, type SearchActor } from "./item-search-service";
import {
  runSearchTransaction,
  type SearchDatabase,
  type BoundedSearchReadTransaction,
} from "./search-read";
import { decodeSearchCursor, encodeSearchCursor, searchContextHash } from "./search-cursor";
type SavedRow = {
  id: string;
  name: string;
  revision: number;
  filterVersion: number;
  definition: unknown;
  createdAt: Date;
  updatedAt: Date;
};
function actorId(actor: SearchActor) {
  if (!actor || typeof actor.userId !== "string" || !actor.userId || actor.userId.includes("\0"))
    return smartFail("SMART_COLLECTION_INVALID");
  return actor.userId;
}
function bounded<T>(value: T): T {
  if (Buffer.byteLength(JSON.stringify(value)) > SEARCH_MAX_RESPONSE_BYTES)
    return searchFail("SEARCH_INVARIANT");
  return value;
}
function summary(row: SavedRow): SmartCollectionSummary {
  const parsed = SmartCollectionSummarySchema.safeParse({
    id: row.id,
    name: row.name,
    revision: row.revision,
    createdAt: row.createdAt?.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
  });
  if (!parsed.success) return smartFail("SMART_COLLECTION_UNRESOLVABLE");
  return parsed.data;
}
function detail(row: SavedRow): SmartCollectionDetail {
  let definition: SmartCollectionDetail["definition"];
  try {
    if (row.filterVersion !== 1) return smartFail("SMART_COLLECTION_UNRESOLVABLE");
    definition = parseSmartCollectionDefinition(row.definition);
  } catch {
    return smartFail("SMART_COLLECTION_UNRESOLVABLE");
  }
  return bounded({ ...summary(row), definition });
}
async function load(tx: BoundedSearchReadTransaction, owner: string, id: string) {
  const [row] = await tx.$queryRaw<SavedRow[]>(
    Prisma.sql`SELECT id,name,revision,"filterVersion",definition,"createdAt","updatedAt" FROM "SmartCollection" WHERE id=${id}::uuid AND "ownerId"=${owner} AND "deletedAt" IS NULL`,
  );
  if (!row) return smartFail("SMART_COLLECTION_NOT_FOUND");
  tx.checkBudget();
  return row;
}
async function validateDefinition(
  tx: BoundedSearchReadTransaction,
  actor: SearchActor,
  definition: SmartCollectionDetail["definition"],
) {
  await executeItemSearch(tx, actor, { ...definitionQuery(definition), limit: 1 });
}
function definitionQuery(definition: SmartCollectionDetail["definition"]) {
  return { text: definition.text, filter: definition.filter, lifecycle: definition.lifecycle };
}
function storedAvailability(error: unknown): never {
  if (
    error instanceof FilterValidationError ||
    (error instanceof ItemSearchError && error.code === "FILTER_REFERENCE_INVALID")
  )
    return smartFail("SMART_COLLECTION_UNRESOLVABLE");
  throw error;
}
export function createSmartCollectionService(database: SearchDatabase) {
  return {
    async createSmartCollection(
      actor: SearchActor,
      input: unknown,
    ): Promise<SmartCollectionDetail> {
      const owner = actorId(actor),
        mutation = parseSmartCollectionMutation(input),
        id = randomUUID();
      return runSearchTransaction(database, async (tx) => {
        await validateDefinition(tx, actor, mutation.definition);
        const [row] = await tx.$queryRaw<SavedRow[]>(
          Prisma.sql`INSERT INTO "SmartCollection" (id,"ownerId",name,"filterVersion",definition,revision,"createdAt","updatedAt") VALUES (${id}::uuid,${owner},${mutation.name},1,${JSON.stringify(mutation.definition)}::jsonb,1,date_trunc('milliseconds',transaction_timestamp()),date_trunc('milliseconds',transaction_timestamp())) RETURNING id,name,revision,"filterVersion",definition,"createdAt","updatedAt"`,
        );
        if (!row) return searchFail("SEARCH_INVARIANT");
        return detail(row);
      });
    },
    async getSmartCollection(actor: SearchActor, idInput: string) {
      const owner = actorId(actor),
        id = parseSmartCollectionId(idInput);
      return runSearchTransaction(database, async (tx) => detail(await load(tx, owner, id)));
    },
    async listSmartCollections(actor: SearchActor, input: unknown = {}) {
      const owner = actorId(actor),
        query = parseSmartCollectionPageInput(input);
      const hash = createHash("sha256")
        .update(
          JSON.stringify(["smart-collection-list", 1, owner, query.limit, "CREATED_DESC_ID_DESC"]),
        )
        .digest("hex");
      const cursor = query.cursor ? decodeSearchCursor(query.cursor, hash) : null;
      return runSearchTransaction(database, async (tx) => {
        const [count] = await tx.$queryRaw<{ total: bigint }[]>(
          Prisma.sql`SELECT count(*) AS total FROM "SmartCollection" WHERE "ownerId"=${owner} AND "deletedAt" IS NULL`,
        );
        const total = checkedSearchTotal(count!.total);
        const after = cursor
          ? Prisma.sql`("createdAt",id)<(${cursor.after.createdAt}::timestamp,${cursor.after.id}::uuid)`
          : Prisma.sql`TRUE`;
        const rows = await tx.$queryRaw<SavedRow[]>(
          Prisma.sql`SELECT id,name,revision,"createdAt","updatedAt" FROM "SmartCollection" WHERE "ownerId"=${owner} AND "deletedAt" IS NULL AND ${after} ORDER BY "createdAt" DESC,id DESC LIMIT ${query.limit + 1}`,
        );
        const items = rows.slice(0, query.limit).map(summary),
          last = items.at(-1);
        return bounded({
          items,
          total,
          nextCursor:
            rows.length > query.limit && last
              ? encodeSearchCursor({
                  v: 1,
                  contextHash: hash,
                  after: { createdAt: last.createdAt, id: last.id },
                })
              : null,
        });
      });
    },
    async updateSmartCollection(actor: SearchActor, idInput: string, input: unknown) {
      const owner = actorId(actor),
        id = parseSmartCollectionId(idInput);
      const mutation = parseSmartCollectionUpdate(input),
        expectedRevision = mutation.expectedRevision;
      return runSearchTransaction(database, async (tx) => {
        const current = await load(tx, owner, id);
        if (
          current.revision !== expectedRevision ||
          current.revision >= SMART_COLLECTION_MAX_REVISION
        )
          return smartFail("SMART_COLLECTION_CONFLICT");
        await validateDefinition(tx, actor, mutation.definition);
        const [row] = await tx.$queryRaw<SavedRow[]>(
          Prisma.sql`UPDATE "SmartCollection" SET name=${mutation.name},definition=${JSON.stringify(mutation.definition)}::jsonb,revision=revision+1,"updatedAt"=date_trunc('milliseconds',transaction_timestamp()) WHERE id=${id}::uuid AND "ownerId"=${owner} AND "deletedAt" IS NULL AND revision=${expectedRevision} RETURNING id,name,revision,"filterVersion",definition,"createdAt","updatedAt"`,
        );
        if (!row) return smartFail("SMART_COLLECTION_CONFLICT");
        return detail(row);
      });
    },
    async deleteSmartCollection(actor: SearchActor, idInput: string, input: unknown) {
      const owner = actorId(actor),
        id = parseSmartCollectionId(idInput);
      const { expectedRevision: revision } = parseSmartCollectionDelete(input);
      return runSearchTransaction(database, async (tx) => {
        const current = await load(tx, owner, id);
        if (current.revision !== revision || current.revision >= SMART_COLLECTION_MAX_REVISION)
          return smartFail("SMART_COLLECTION_CONFLICT");
        const rows = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`UPDATE "SmartCollection" SET revision=revision+1,"deletedAt"=date_trunc('milliseconds',transaction_timestamp()),"updatedAt"=date_trunc('milliseconds',transaction_timestamp()) WHERE id=${id}::uuid AND "ownerId"=${owner} AND "deletedAt" IS NULL AND revision=${revision} RETURNING id`,
        );
        if (rows.length !== 1) return smartFail("SMART_COLLECTION_CONFLICT");
        return { id, revision: revision + 1 };
      });
    },
    async resolveSmartCollectionItems(actor: SearchActor, idInput: string, input: unknown = {}) {
      const owner = actorId(actor),
        id = parseSmartCollectionId(idInput),
        page = parseSmartCollectionPageInput(input);
      return runSearchTransaction(database, async (tx) => {
        const saved = detail(await load(tx, owner, id));
        if (page.cursor)
          decodeSearchCursor(
            page.cursor,
            searchContextHash(
              owner,
              { ...definitionQuery(saved.definition), ...page },
              { smartCollectionId: id, revision: saved.revision },
            ),
          );
        try {
          return await executeItemSearch(
            tx,
            actor,
            { ...definitionQuery(saved.definition), ...page },
            { smartCollectionId: id, revision: saved.revision },
          );
        } catch (error) {
          return storedAvailability(error);
        }
      });
    },
  };
}
