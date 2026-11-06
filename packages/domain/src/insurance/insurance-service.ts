import { randomUUID } from "node:crypto";
import { Prisma } from "@sammlerraum/db/search-sql";
import {
  InsuranceError,
  InsuranceTargetSchema,
  InsuranceMutationSchema,
  InsuranceDataSchema,
  type InsuranceTarget,
  type InsuranceData,
} from "@sammlerraum/contracts/insurance";
import { currencyMinorUnitExponent } from "../money/currencies";
import {
  runSearchTransaction,
  type SearchDatabase,
  type BoundedSearchReadTransaction,
} from "../search/search-read";
function owner(actor: { userId: string }) {
  if (
    !actor ||
    typeof actor.userId !== "string" ||
    !actor.userId ||
    actor.userId.length > 512 ||
    actor.userId.includes("\0")
  )
    throw new InsuranceError("INSURANCE_NOT_FOUND");
  return actor.userId;
}
function parseTarget(input: unknown) {
  const result = InsuranceTargetSchema.safeParse(input);
  if (!result.success) throw new InsuranceError("INSURANCE_INVALID");
  return result.data;
}
function mutation(input: unknown) {
  try {
    if (Buffer.byteLength(JSON.stringify(input)) > 16384) throw new Error();
  } catch {
    throw new InsuranceError("INSURANCE_INVALID");
  }
  const result = InsuranceMutationSchema.safeParse(input);
  if (!result.success) throw new InsuranceError("INSURANCE_INVALID");
  let exponent: number | null = null;
  if (result.data.insurance) {
    try {
      exponent = currencyMinorUnitExponent(result.data.insurance.currency);
    } catch {
      throw new InsuranceError("INSURANCE_INVALID");
    }
  }
  return { ...result.data, exponent };
}
async function lockTarget(
  tx: BoundedSearchReadTransaction,
  ownerId: string,
  target: InsuranceTarget,
  write: boolean,
) {
  let collectionId: string;
  if (target.kind === "COLLECTION") collectionId = target.collectionId;
  else {
    const [item] = await tx.$queryRaw<{ collectionId: string }[]>(
      Prisma.sql`SELECT "collectionId" FROM "CollectibleItem" WHERE id=${target.itemId}::uuid AND "ownerId"=${ownerId} AND "deletedAt" IS NULL`,
    );
    if (!item) throw new InsuranceError("INSURANCE_NOT_FOUND");
    collectionId = item.collectionId;
  }
  const parentLock =
    target.kind === "COLLECTION" && write ? Prisma.sql`FOR UPDATE` : Prisma.sql`FOR SHARE`;
  const parent = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id FROM "Collection" WHERE id=${collectionId}::uuid AND "ownerId"=${ownerId} AND "deletedAt" IS NULL ${parentLock}`,
  );
  if (parent.length !== 1) throw new InsuranceError("INSURANCE_NOT_FOUND");
  if (target.kind === "ITEM") {
    const lock = write ? Prisma.sql`FOR UPDATE` : Prisma.sql`FOR SHARE`;
    const [item] = await tx.$queryRaw<{ archivedAt: Date | null; disposedAt: Date | null }[]>(
      Prisma.sql`SELECT "archivedAt","disposedAt" FROM "CollectibleItem" WHERE id=${target.itemId}::uuid AND "collectionId"=${collectionId}::uuid AND "ownerId"=${ownerId} AND "deletedAt" IS NULL ${lock}`,
    );
    if (!item) throw new InsuranceError("INSURANCE_NOT_FOUND");
    if (write && (item.archivedAt !== null || item.disposedAt !== null))
      throw new InsuranceError("INSURANCE_INACTIVE");
  }
}
function predicate(target: InsuranceTarget) {
  return target.kind === "ITEM"
    ? Prisma.sql`"itemId"=${target.itemId}::uuid`
    : Prisma.sql`"collectionId"=${target.collectionId}::uuid`;
}
type RecordRow = {
  id: string;
  revision: number;
  basis: string;
  amountMinor: string | null;
  currency: string | null;
  minorUnitExponent: number | null;
  valuationDate: string | null;
  insurer: string | null;
  policyReference: string | null;
  notes: string | null;
};
async function read(tx: BoundedSearchReadTransaction, ownerId: string, target: InsuranceTarget) {
  return (
    await tx.$queryRaw<RecordRow[]>(
      Prisma.sql`SELECT id,revision,basis,"amountMinor"::text,currency,"minorUnitExponent",to_char("valuationDate",'YYYY-MM-DD') AS "valuationDate",insurer,"policyReference",notes FROM "InsuranceRecord" WHERE "ownerId"=${ownerId} AND ${predicate(target)} FOR UPDATE`,
    )
  )[0];
}
function dto(target: InsuranceTarget, row: RecordRow | undefined): InsuranceData {
  const result = InsuranceDataSchema.safeParse({
    target,
    revision: row?.revision ?? 0,
    insurance:
      !row || row.amountMinor === null
        ? null
        : {
            amountMinor: row.amountMinor,
            currency: row.currency,
            minorUnitExponent: row.minorUnitExponent,
            basis: row.basis,
            valuationDate: row.valuationDate,
            insurer: row.insurer,
            policyReference: row.policyReference,
            notes: row.notes,
          },
  });
  if (!result.success) throw new InsuranceError("INSURANCE_INTEGRITY");
  return result.data;
}
/** Private current declarations. Item amounts are explicitly per-unit; collection totals
 * are independent declarations, never summed with their items or silently copied on split.
 * Empty revision tombstones prevent stale create requests from resurrecting cleared data.
 */
export function createInsuranceService(database: SearchDatabase) {
  async function getInsuranceData(actor: { userId: string }, targetInput: unknown) {
    const ownerId = owner(actor),
      target = parseTarget(targetInput);
    return runSearchTransaction(database, async (tx) => {
      await lockTarget(tx, ownerId, target, false);
      return dto(target, await read(tx, ownerId, target));
    });
  }
  async function set(actor: { userId: string }, targetInput: unknown, input: unknown) {
    const ownerId = owner(actor),
      target = parseTarget(targetInput),
      value = mutation(input);
    return runSearchTransaction(database, async (tx) => {
      await lockTarget(tx, ownerId, target, true);
      const current = await read(tx, ownerId, target);
      if ((current?.revision ?? 0) !== value.expectedRevision)
        throw new InsuranceError("INSURANCE_CONFLICT");
      const insurance = value.insurance;
      const [clock] = await tx.$queryRaw<{ day: string }[]>(
        Prisma.sql`SELECT to_char(clock_timestamp(),'YYYY-MM-DD') AS day`,
      );
      if (!clock || (insurance && insurance.valuationDate > clock.day))
        throw new InsuranceError("INSURANCE_INVALID");
      const amount = insurance ? BigInt(insurance.amountMinor) : null,
        currency = insurance?.currency ?? null,
        date = insurance?.valuationDate ?? null,
        insurer = insurance?.insurer ?? null,
        policy = insurance?.policyReference ?? null,
        notes = insurance?.notes ?? null;
      if (current) {
        await tx.$queryRaw(
          Prisma.sql`UPDATE "InsuranceRecord" SET revision=revision+1,"amountMinor"=${amount},currency=${currency},"minorUnitExponent"=${value.exponent},"valuationDate"=${date}::date,insurer=${insurer},"policyReference"=${policy},notes=${notes},"updatedAt"=date_trunc('milliseconds',clock_timestamp()) WHERE id=${current.id}::uuid AND "ownerId"=${ownerId} AND revision=${value.expectedRevision} RETURNING id`,
        );
      } else {
        await tx.$queryRaw(
          Prisma.sql`INSERT INTO "InsuranceRecord" (id,"ownerId","collectionId","itemId",revision,basis,"amountMinor",currency,"minorUnitExponent","valuationDate",insurer,"policyReference",notes,"updatedAt") VALUES (${randomUUID()}::uuid,${ownerId},${target.kind === "COLLECTION" ? target.collectionId : null}::uuid,${target.kind === "ITEM" ? target.itemId : null}::uuid,1,${target.kind === "ITEM" ? "PER_UNIT" : "COLLECTION_TOTAL"},${amount},${currency},${value.exponent},${date}::date,${insurer},${policy},${notes},date_trunc('milliseconds',clock_timestamp())) RETURNING id`,
        );
      }
      return dto(target, await read(tx, ownerId, target));
    });
  }
  return {
    getInsuranceData,
    setCollectionInsurance: (actor: { userId: string }, collectionId: string, input: unknown) =>
      set(actor, { kind: "COLLECTION", collectionId }, input),
    setItemInsurance: (actor: { userId: string }, itemId: string, input: unknown) =>
      set(actor, { kind: "ITEM", itemId }, input),
  };
}
