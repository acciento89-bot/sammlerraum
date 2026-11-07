import { randomUUID } from "node:crypto";
import {
  GRADING_MAX_RECORDS,
  GradingIdSchema,
  GradingInputSchema,
  GradingSchema,
  type Grading,
} from "@sammlerraum/contracts/grading";

type Query = { $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T> };
export type GradingDatabase = Query & {
  $transaction<T>(
    work: (tx: Query) => Promise<T>,
    options: { isolationLevel: "ReadCommitted" },
  ): Promise<T>;
};
type Code =
  | "GRADING_INVALID"
  | "ITEM_NOT_FOUND"
  | "ITEM_INACTIVE"
  | "GRADING_NOT_FOUND"
  | "GRADING_REQUIRES_SINGLE_ITEM"
  | "GRADING_CERTIFICATE_CONFLICT"
  | "GRADING_LIMIT_EXCEEDED";
export class GradingServiceError extends Error {
  constructor(readonly code: Code) {
    super(code);
    this.name = "GradingServiceError";
  }
}
type ItemRow = { id: string; quantity: number; archivedAt: Date | null; disposedAt: Date | null };
type Row = Omit<Grading, "createdAt" | "updatedAt" | "gradedAt"> & {
  createdAt: Date;
  updatedAt: Date;
  gradedAt: Date | null;
};
const id = (input: unknown) => {
  const parsed = GradingIdSchema.safeParse(input);
  if (!parsed.success) throw new GradingServiceError("GRADING_INVALID");
  return parsed.data;
};
const dto = (row: Row): Grading =>
  GradingSchema.parse({
    ...row,
    gradedAt: row.gradedAt?.toISOString().slice(0, 10) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
const providerKey = (value: string) => value.replace(/[A-Z]/gu, (letter) => letter.toLowerCase());
async function lockItem(tx: Query, itemId: string, actorUserId: string, mutation: boolean) {
  const [item] = await tx.$queryRaw<ItemRow[]>`
    SELECT item.id, item.quantity, item."archivedAt", item."disposedAt"
    FROM "CollectibleItem" item JOIN "Collection" collection ON collection.id=item."collectionId"
    WHERE item.id=${itemId}::uuid AND item."ownerId"=${actorUserId} AND collection."ownerId"=${actorUserId}
      AND item."deletedAt" IS NULL AND collection."deletedAt" IS NULL FOR UPDATE OF item
  `;
  if (!item) throw new GradingServiceError("ITEM_NOT_FOUND");
  if (mutation && (item.archivedAt !== null || item.disposedAt !== null))
    throw new GradingServiceError("ITEM_INACTIVE");
  return item;
}
async function rows(tx: Query, itemId: string, actorUserId: string): Promise<Grading[]> {
  const result = await tx.$queryRaw<Row[]>`
    SELECT id,"itemId",provider,grade,"comparableValue"::text AS "comparableValue","comparableScale","certificateNo","gradedAt","verificationUrl",source,"createdAt","updatedAt"
    FROM "Grading" WHERE "itemId"=${itemId}::uuid AND "ownerId"=${actorUserId}
    ORDER BY "createdAt",id LIMIT ${GRADING_MAX_RECORDS}
  `;
  return result.map(dto);
}
async function record(
  tx: Query,
  itemId: string,
  gradingId: string,
  actorUserId: string,
): Promise<Grading> {
  const result = await tx.$queryRaw<Row[]>`
    SELECT id,"itemId",provider,grade,"comparableValue"::text AS "comparableValue","comparableScale","certificateNo","gradedAt","verificationUrl",source,"createdAt","updatedAt"
    FROM "Grading" WHERE id=${gradingId}::uuid AND "itemId"=${itemId}::uuid AND "ownerId"=${actorUserId}
  `;
  if (!result[0]) throw new GradingServiceError("GRADING_NOT_FOUND");
  return dto(result[0]);
}
function mapped(error: unknown): never {
  if (typeof error === "object" && error !== null && "meta" in error) {
    const meta = error.meta as
      | { code?: string; driverAdapterError?: { cause?: { originalCode?: string } } }
      | undefined;
    if (meta?.code === "23505" || meta?.driverAdapterError?.cause?.originalCode === "23505")
      throw new GradingServiceError("GRADING_CERTIFICATE_CONFLICT");
  }
  throw error;
}
/** Private authored facts only. The item lock serializes CRUD with quantity/lifecycle changes.
 * Mutations are one transaction so Phase09 can append the shared audit event atomically.
 * Current edits/removal have no immutable history guarantee; URLs are never fetched here.
 */
export function createGradingService(database: GradingDatabase, actorUserId: string) {
  const within = async <T>(work: (tx: Query) => Promise<T>) => {
    try {
      return await database.$transaction(work, { isolationLevel: "ReadCommitted" });
    } catch (error) {
      mapped(error);
    }
  };
  async function listGradings(itemIdInput: string) {
    const itemId = id(itemIdInput);
    return within(async (tx) => {
      await lockItem(tx, itemId, actorUserId, false);
      return rows(tx, itemId, actorUserId);
    });
  }
  async function getGrading(itemIdInput: string, gradingIdInput: string) {
    const itemId = id(itemIdInput);
    const gradingId = id(gradingIdInput);
    return within(async (tx) => {
      await lockItem(tx, itemId, actorUserId, false);
      return record(tx, itemId, gradingId, actorUserId);
    });
  }
  async function save(itemIdInput: string, gradingIdInput: string | null, input: unknown) {
    const itemId = id(itemIdInput);
    const gradingId = gradingIdInput === null ? null : id(gradingIdInput);
    const parsed = GradingInputSchema.safeParse(input);
    if (!parsed.success) throw new GradingServiceError("GRADING_INVALID");
    const value = parsed.data;
    return within(async (tx) => {
      const item = await lockItem(tx, itemId, actorUserId, true);
      if (item.quantity !== 1) throw new GradingServiceError("GRADING_REQUIRES_SINGLE_ITEM");
      const date = value.gradedAt === null ? null : new Date(`${value.gradedAt}T00:00:00.000Z`);
      let savedId = gradingId;
      if (gradingId === null) {
        const [count] = await tx.$queryRaw<
          Array<{ count: number }>
        >`SELECT count(*)::int AS count FROM "Grading" WHERE "itemId"=${itemId}::uuid`;
        if (count!.count >= GRADING_MAX_RECORDS)
          throw new GradingServiceError("GRADING_LIMIT_EXCEEDED");
        savedId = randomUUID();
        await tx.$queryRaw`
          INSERT INTO "Grading" (id,"itemId","ownerId",provider,"providerKey",grade,"comparableValue","comparableScale","certificateNo","certificateKey","gradedAt","verificationUrl",source,"updatedAt")
          VALUES (${savedId}::uuid,${itemId}::uuid,${actorUserId},${value.provider},${providerKey(value.provider)},${value.grade},${value.comparableValue}::numeric,${value.comparableScale},${value.certificateNo},${value.certificateNo},${date}::date,${value.verificationUrl},${value.source},now()) RETURNING id
        `;
      } else {
        await record(tx, itemId, gradingId, actorUserId);
        await tx.$queryRaw`
          UPDATE "Grading" SET provider=${value.provider},"providerKey"=${providerKey(value.provider)},grade=${value.grade},
            "comparableValue"=${value.comparableValue}::numeric,"comparableScale"=${value.comparableScale},"certificateNo"=${value.certificateNo},"certificateKey"=${value.certificateNo},
            "gradedAt"=${date}::date,"verificationUrl"=${value.verificationUrl},source=${value.source},"updatedAt"=now()
          WHERE id=${gradingId}::uuid AND "itemId"=${itemId}::uuid AND "ownerId"=${actorUserId} RETURNING id
        `;
      }
      return record(tx, itemId, savedId!, actorUserId);
    });
  }
  async function removeGrading(itemIdInput: string, gradingIdInput: string): Promise<void> {
    const itemId = id(itemIdInput);
    const gradingId = id(gradingIdInput);
    await within(async (tx) => {
      await lockItem(tx, itemId, actorUserId, true);
      await record(tx, itemId, gradingId, actorUserId);
      await tx.$queryRaw`DELETE FROM "Grading" WHERE id=${gradingId}::uuid AND "itemId"=${itemId}::uuid AND "ownerId"=${actorUserId} RETURNING id`;
    });
  }
  return {
    listGradings,
    getGrading,
    addGrading: (itemId: string, input: unknown) => save(itemId, null, input),
    updateGrading: (itemId: string, gradingId: string, input: unknown) =>
      save(itemId, gradingId, input),
    removeGrading,
  };
}
