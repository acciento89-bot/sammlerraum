import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@sammlerraum/db/search-sql";
import { FilterValidationError } from "@sammlerraum/contracts/search";
import {
  ItemSearchError,
  SEARCH_MAX_RESPONSE_BYTES,
  searchFail,
} from "@sammlerraum/contracts/item-search";
import { MembershipActorIdSchema, MembershipError } from "@sammlerraum/contracts/collaboration";
import { ShareError } from "@sammlerraum/contracts/sharing";
import {
  parseScopedSmartCollectionDefinition,
  parseScopedSmartCollectionMutation,
  parseSmartCollectionId,
  parseSmartCollectionPageInput,
  SmartCollectionSummarySchema,
  smartFail,
  SMART_COLLECTION_MAX_REVISION,
  type ScopedSmartCollectionDefinition,
  type ScopedSmartCollectionDetail,
} from "@sammlerraum/contracts/smart-collections";
import type { MembershipDatabase } from "../collaboration/transfer-transaction";
import { runSearchRead, type BoundedSearchReadTransaction } from "./search-read";
import { withScopedReadContext, scopedReadState } from "./scoped-read-context";
import { executeScopedSearch } from "./scoped-search-service";
import { decodeReferenceCursor, encodeReferenceCursor } from "./search-reference-cursor";
import { checkedSearchTotal } from "./item-search-service";

type Row = {
  id: string;
  name: string;
  revision: number;
  filterVersion: number;
  definition: unknown;
  createdAt: Date;
  updatedAt: Date;
};
function ownerId(actor: { userId: string }) {
  const parsed = MembershipActorIdSchema.safeParse(actor?.userId);
  if (!parsed.success) return smartFail("SMART_COLLECTION_INVALID");
  return parsed.data;
}
function bounded<T>(value: T): T {
  if (Buffer.byteLength(JSON.stringify(value)) > SEARCH_MAX_RESPONSE_BYTES)
    return searchFail("SEARCH_INVARIANT");
  return value;
}
function detail(row: Row): ScopedSmartCollectionDetail {
  try {
    if (row.filterVersion !== 1) return smartFail("SMART_COLLECTION_UNRESOLVABLE");
    const summary = SmartCollectionSummarySchema.parse({
      id: row.id,
      name: row.name,
      revision: row.revision,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
    return bounded({
      ...summary,
      definition: parseScopedSmartCollectionDefinition(row.definition),
    });
  } catch {
    return smartFail("SMART_COLLECTION_UNRESOLVABLE");
  }
}
async function load(tx: BoundedSearchReadTransaction, owner: string, id: string) {
  const [row] = await tx.$queryRaw<Row[]>(
    Prisma.sql`SELECT id,name,revision,"filterVersion",definition,"createdAt","updatedAt" FROM "SmartCollection" WHERE id=${id}::uuid AND "ownerId"=${owner} AND "deletedAt" IS NULL`,
  );
  if (!row) return smartFail("SMART_COLLECTION_NOT_FOUND");
  return row;
}
function target(definition: ScopedSmartCollectionDefinition, access: unknown) {
  const ref = definition.scope;
  if (ref.kind === "MEMBER_COLLECTION") {
    if (access !== undefined) return smartFail("SMART_COLLECTION_INVALID");
    return ref;
  }
  return {
    kind: "SHARE",
    expectedShareId: ref.shareId,
    access: access ?? { shareId: ref.shareId },
  };
}
function unavailable(error: unknown): never {
  if (
    error instanceof ShareError ||
    error instanceof MembershipError ||
    error instanceof FilterValidationError ||
    (error instanceof ItemSearchError && error.code === "FILTER_REFERENCE_INVALID")
  )
    return smartFail("SMART_COLLECTION_UNRESOLVABLE");
  throw error;
}
/** Own symbolic query records; resolving a record grants no access of its own. */
export function createScopedSavedSearchService(
  database: MembershipDatabase,
  options: { canonicalMoneyEnabled?: boolean } = {},
) {
  const enabled = options.canonicalMoneyEnabled === true;
  return {
    async create(actor: { userId: string }, input: unknown, access?: unknown) {
      const owner = ownerId(actor),
        mutation = parseScopedSmartCollectionMutation(input),
        id = randomUUID();
      return withScopedReadContext(
        database,
        actor,
        target(mutation.definition, access),
        async (context) => {
          await executeScopedSearch(
            context,
            {
              text: mutation.definition.text,
              filter: mutation.definition.filter,
              lifecycle: mutation.definition.lifecycle,
              limit: 1,
            },
            enabled,
          );
          const tx = scopedReadState(context).tx;
          const [row] = await tx.$queryRaw<Row[]>(
            Prisma.sql`INSERT INTO "SmartCollection" (id,"ownerId",name,"filterVersion",definition,revision,"createdAt","updatedAt") VALUES (${id}::uuid,${owner},${mutation.name},1,${JSON.stringify(mutation.definition)}::jsonb,1,date_trunc('milliseconds',transaction_timestamp()),date_trunc('milliseconds',transaction_timestamp())) RETURNING id,name,revision,"filterVersion",definition,"createdAt","updatedAt"`,
          );
          if (!row) return searchFail("SEARCH_INVARIANT");
          return detail(row);
        },
      );
    },
    async get(actor: { userId: string }, idInput: unknown) {
      const owner = ownerId(actor),
        id = parseSmartCollectionId(idInput);
      return runSearchRead(database, async (tx) => detail(await load(tx, owner, id)));
    },
    async list(actor: { userId: string }, input: unknown = {}) {
      const owner = ownerId(actor),
        query = parseSmartCollectionPageInput(input);
      const hash = createHash("sha256")
        .update(JSON.stringify(["scoped-saved-list", 2, owner, query.limit, "ID_ASC"]))
        .digest("hex");
      const after = query.cursor ? decodeReferenceCursor(query.cursor, hash) : null;
      return runSearchRead(database, async (tx) => {
        const [count] = await tx.$queryRaw<{ total: bigint }[]>(
          Prisma.sql`SELECT count(*) AS total FROM "SmartCollection" WHERE "ownerId"=${owner} AND "deletedAt" IS NULL AND definition->>'version'='2'`,
        );
        const rows = await tx.$queryRaw<Row[]>(
          Prisma.sql`SELECT id,name,revision,"filterVersion",definition,"createdAt","updatedAt" FROM "SmartCollection" WHERE "ownerId"=${owner} AND "deletedAt" IS NULL AND definition->>'version'='2' ${after ? Prisma.sql`AND id>${after}::uuid` : Prisma.empty} ORDER BY id LIMIT ${query.limit + 1}`,
        );
        const items = rows.slice(0, query.limit).map(detail),
          last = items.at(-1);
        return bounded({
          items,
          total: checkedSearchTotal(count!.total),
          nextCursor:
            rows.length > query.limit && last
              ? encodeReferenceCursor({ v: 1, contextHash: hash, after: last.id })
              : null,
        });
      });
    },
    async update(actor: { userId: string }, idInput: unknown, input: unknown, access?: unknown) {
      const owner = ownerId(actor),
        id = parseSmartCollectionId(idInput),
        mutation = parseScopedSmartCollectionMutation(input, true);
      return withScopedReadContext(
        database,
        actor,
        target(mutation.definition, access),
        async (context) => {
          const tx = scopedReadState(context).tx,
            current = detail(await load(tx, owner, id));
          if (
            current.revision !== mutation.expectedRevision ||
            current.revision >= SMART_COLLECTION_MAX_REVISION
          )
            return smartFail("SMART_COLLECTION_CONFLICT");
          await executeScopedSearch(
            context,
            {
              text: mutation.definition.text,
              filter: mutation.definition.filter,
              lifecycle: mutation.definition.lifecycle,
              limit: 1,
            },
            enabled,
          );
          const [row] = await tx.$queryRaw<Row[]>(
            Prisma.sql`UPDATE "SmartCollection" SET name=${mutation.name},definition=${JSON.stringify(mutation.definition)}::jsonb,revision=revision+1,"updatedAt"=date_trunc('milliseconds',transaction_timestamp()) WHERE id=${id}::uuid AND "ownerId"=${owner} AND "deletedAt" IS NULL AND revision=${mutation.expectedRevision} RETURNING id,name,revision,"filterVersion",definition,"createdAt","updatedAt"`,
          );
          if (!row) return smartFail("SMART_COLLECTION_CONFLICT");
          return detail(row);
        },
      );
    },
    async resolve(
      actor: { userId: string },
      idInput: unknown,
      input: unknown = {},
      access?: unknown,
    ) {
      const owner = ownerId(actor),
        id = parseSmartCollectionId(idInput),
        page = parseSmartCollectionPageInput(input);
      // Read only the caller's own symbolic reference before durable PIN preflight.
      const initial = await runSearchRead(database, async (tx) =>
        detail(await load(tx, owner, id)),
      );
      try {
        return await withScopedReadContext(
          database,
          actor,
          target(initial.definition, access),
          async (context) => {
            const current = detail(await load(scopedReadState(context).tx, owner, id));
            if (
              current.revision !== initial.revision ||
              JSON.stringify(current.definition) !== JSON.stringify(initial.definition)
            )
              return smartFail("SMART_COLLECTION_CONFLICT");
            return executeScopedSearch(
              context,
              {
                text: current.definition.text,
                filter: current.definition.filter,
                lifecycle: current.definition.lifecycle,
                ...page,
              },
              enabled,
              `${id}:${current.revision}`,
            );
          },
        );
      } catch (error) {
        return unavailable(error);
      }
    },
  };
}
