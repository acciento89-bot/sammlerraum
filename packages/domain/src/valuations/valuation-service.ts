import { randomUUID } from "node:crypto";
import { currencyMinorUnitExponent } from "../money/currencies";
import { MAX_AMOUNT_MINOR, type Money } from "../money/money";

type Query = { $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T> };
export type ValuationDatabase = {
  $transaction<T>(
    work: (tx: Query) => Promise<T>,
    options: { isolationLevel: "ReadCommitted" },
  ): Promise<T>;
};
type Code = "VALUATION_INVALID" | "ITEM_NOT_FOUND" | "ITEM_INACTIVE" | "VALUATION_LIMIT_EXCEEDED";
export class ValuationServiceError extends Error {
  constructor(readonly code: Code) {
    super(code);
    this.name = "ValuationServiceError";
  }
}
export type ManualValuation = Money & {
  id: string;
  itemId: string;
  ownerId: string;
  actorUserId: string;
  type: "MANUAL";
  basis: "PER_UNIT";
  minorUnitExponent: number;
  note: string | null;
  observedAt: Date;
  createdAt: Date;
};
export type ValuationCursor = { observedAt: string; createdAt: string; id: string };
export type ValuationPage = { records: ManualValuation[]; nextCursor: ValuationCursor | null };
const invalid = (): never => {
  throw new ValuationServiceError("VALUATION_INVALID");
};
function object(input: unknown, keys: string[]): Record<string, unknown> {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !keys.includes(key))
  )
    return invalid();
  return input as Record<string, unknown>;
}
function uuid(input: unknown): string {
  if (
    typeof input !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(input)
  )
    return invalid();
  return input.toLowerCase();
}
function instant(input: unknown): Date {
  if (
    typeof input !== "string" ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/u.test(input) ||
    input.startsWith("0000")
  )
    return invalid();
  const date = new Date(input);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== input) return invalid();
  return date;
}
function inputValue(input: unknown) {
  const value = object(input, ["amountMinor", "currency", "observedAt", "note"]);
  if (
    typeof value.amountMinor !== "bigint" ||
    value.amountMinor < 0n ||
    value.amountMinor > MAX_AMOUNT_MINOR ||
    typeof value.currency !== "string"
  )
    return invalid();
  let exponent: number;
  try {
    exponent = currencyMinorUnitExponent(value.currency);
  } catch {
    return invalid();
  }
  if (value.note !== undefined && value.note !== null && typeof value.note !== "string")
    return invalid();
  const note = typeof value.note === "string" ? value.note.trim() || null : null;
  if (note !== null && (note.includes("\0") || [...note].length > 2000)) return invalid();
  return {
    amountMinor: value.amountMinor,
    currency: value.currency,
    minorUnitExponent: exponent,
    note,
    observedAt: value.observedAt === undefined ? null : instant(value.observedAt),
  };
}
function pageOptions(input: unknown) {
  const value = object(input ?? {}, ["limit", "cursor"]);
  const limit = value.limit ?? 50;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100)
    return invalid();
  let cursor: { observedAt: Date; createdAt: Date; id: string } | null = null;
  if (value.cursor !== undefined && value.cursor !== null) {
    const data = object(value.cursor, ["observedAt", "createdAt", "id"]);
    cursor = {
      observedAt: instant(data.observedAt),
      createdAt: instant(data.createdAt),
      id: uuid(data.id),
    };
    if (cursor.observedAt > cursor.createdAt) return invalid();
  }
  return { limit, cursor };
}
async function lockItem(tx: Query, itemId: string, actorUserId: string, mutation: boolean) {
  const [source] = await tx.$queryRaw<Array<{ collectionId: string }>>`
    SELECT item."collectionId" FROM "CollectibleItem" item
    JOIN "Collection" collection ON collection.id=item."collectionId"
    WHERE item.id=${itemId}::uuid AND item."ownerId"=${actorUserId} AND collection."ownerId"=${actorUserId}
      AND item."deletedAt" IS NULL AND collection."deletedAt" IS NULL
  `;
  if (!source) throw new ValuationServiceError("ITEM_NOT_FOUND");
  // Parent first: deleteCollection locks only the parent, so the item lock alone cannot gate it.
  const parent = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Collection" WHERE id=${source.collectionId}::uuid AND "ownerId"=${actorUserId} AND "deletedAt" IS NULL FOR SHARE
  `;
  if (parent.length !== 1) throw new ValuationServiceError("ITEM_NOT_FOUND");
  type Item = { id: string; archivedAt: Date | null; disposedAt: Date | null };
  const rows = mutation
    ? await tx.$queryRaw<Item[]>`
    SELECT item.id,item."archivedAt",item."disposedAt" FROM "CollectibleItem" item
    WHERE item.id=${itemId}::uuid AND item."collectionId"=${source.collectionId}::uuid AND item."ownerId"=${actorUserId} AND item."deletedAt" IS NULL FOR UPDATE OF item
  `
    : await tx.$queryRaw<Item[]>`
    SELECT item.id,item."archivedAt",item."disposedAt" FROM "CollectibleItem" item
    WHERE item.id=${itemId}::uuid AND item."collectionId"=${source.collectionId}::uuid AND item."ownerId"=${actorUserId} AND item."deletedAt" IS NULL FOR SHARE OF item
  `;
  const item = rows[0];
  if (!item) throw new ValuationServiceError("ITEM_NOT_FOUND");
  if (mutation && (item.archivedAt !== null || item.disposedAt !== null))
    throw new ValuationServiceError("ITEM_INACTIVE");
}
/** Private append-only, per interchangeable unit. Quantity edits preserve meaning; split keeps
 * history only on the source item. No update/delete service exists. Trusted SQL DELETE/cascades
 * support private erasure; Phase09 must deliberately migrate actor=owner and actor-erasure policy
 * before introducing collaborating authors. Future JSON DTOs must stringify bigint and retain scale.
 */
export function createValuationService(database: ValuationDatabase, actorUserId: string) {
  if (typeof actorUserId !== "string" || actorUserId.length === 0 || actorUserId.includes("\0"))
    invalid();
  const within = <T>(work: (tx: Query) => Promise<T>) =>
    database.$transaction(
      async (tx) => {
        // Prisma PG adapter currently normalizes timestamptz offsets without converting them.
        // Scope UTC to this transaction so reads, clock and keyset cursors share exact instants.
        await tx.$queryRaw`SELECT set_config('TimeZone', 'UTC', true)`;
        return work(tx);
      },
      { isolationLevel: "ReadCommitted" },
    );
  async function addManualValuation(itemIdInput: string, input: unknown): Promise<ManualValuation> {
    const itemId = uuid(itemIdInput);
    const value = inputValue(input);
    return within(async (tx) => {
      await lockItem(tx, itemId, actorUserId, true);
      const [count] = await tx.$queryRaw<
        Array<{ count: number }>
      >`SELECT count(*)::int AS count FROM "Valuation" WHERE "itemId"=${itemId}::uuid`;
      if (count!.count >= 10000) throw new ValuationServiceError("VALUATION_LIMIT_EXCEEDED");
      // CURRENT_TIMESTAMP is transaction-start time and can precede a long lock wait.
      const [clock] = await tx.$queryRaw<
        Array<{ now: Date }>
      >`SELECT date_trunc('milliseconds', clock_timestamp()) AS now`;
      const createdAt = clock!.now;
      const observedAt = value.observedAt ?? createdAt;
      if (observedAt > createdAt) return invalid();
      const [row] = await tx.$queryRaw<ManualValuation[]>`
        INSERT INTO "Valuation" (id,"itemId","ownerId","actorUserId",type,basis,"amountMinor",currency,"minorUnitExponent",note,"observedAt","createdAt")
        VALUES (${randomUUID()}::uuid,${itemId}::uuid,${actorUserId},${actorUserId},'MANUAL','PER_UNIT',${value.amountMinor},${value.currency},${value.minorUnitExponent},${value.note},${observedAt.toISOString()}::timestamptz,${createdAt.toISOString()}::timestamptz) RETURNING *
      `;
      return row!;
    });
  }
  async function listManualValuations(
    itemIdInput: string,
    options?: unknown,
  ): Promise<ValuationPage> {
    const itemId = uuid(itemIdInput);
    const { limit, cursor } = pageOptions(options);
    return within(async (tx) => {
      await lockItem(tx, itemId, actorUserId, false);
      const result = await tx.$queryRaw<ManualValuation[]>`
        SELECT * FROM "Valuation" WHERE "itemId"=${itemId}::uuid AND "ownerId"=${actorUserId}
        AND (${cursor === null} OR ("observedAt","createdAt",id) < (${cursor?.observedAt.toISOString() ?? null}::timestamptz,${cursor?.createdAt.toISOString() ?? null}::timestamptz,${cursor?.id ?? null}::uuid))
        ORDER BY "observedAt" DESC,"createdAt" DESC,id DESC LIMIT ${limit + 1}
      `;
      const records = result.slice(0, limit);
      const last = records.at(-1);
      return {
        records,
        nextCursor:
          result.length > limit && last
            ? {
                observedAt: last.observedAt.toISOString(),
                createdAt: last.createdAt.toISOString(),
                id: last.id,
              }
            : null,
      };
    });
  }
  async function latestManualValuation(itemId: string): Promise<ManualValuation | null> {
    return (await listManualValuations(itemId, { limit: 1 })).records[0] ?? null;
  }
  return { addManualValuation, listManualValuations, latestManualValuation };
}
