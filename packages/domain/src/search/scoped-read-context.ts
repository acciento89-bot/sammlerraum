import { z } from "zod";
import { Prisma } from "@sammlerraum/db/search-sql";
import { MembershipActorIdSchema, MembershipError } from "@sammlerraum/contracts/collaboration";
import {
  ResolveShareSchema,
  ShareError,
  SharePermissionsSchema,
} from "@sammlerraum/contracts/sharing";
import { loadCollectionReadAccess } from "../collaboration/collection-read-access";
import type { MembershipDatabase } from "../collaboration/transfer-transaction";
import { createShareReadAccessPort, type Share } from "../sharing/share-read-access";
import { shareItemPredicate, shareScopeCte } from "../sharing/share-scope";
import { runSearchRead, type BoundedSearchReadTransaction } from "./search-read";

const TargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("MEMBER_COLLECTION"), collectionId: z.uuid() }).strict(),
  z
    .object({
      kind: z.literal("SHARE"),
      access: ResolveShareSchema,
      expectedShareId: z.uuid().optional(),
    })
    .strict(),
]);
export type ScopedReadTarget = z.infer<typeof TargetSchema>;
// Deliberately opaque: only this module can create a live context.
declare const scopedContextBrand: unique symbol;
export type ScopedReadContext = { readonly [scopedContextBrand]: true };
type Rights = Readonly<
  Omit<z.infer<typeof SharePermissionsSchema>, "documents"> & { documents: readonly string[] }
>;
type State = {
  tx: BoundedSearchReadTransaction;
  actorUserId: string | null;
  ownerUserId: string;
  reference: Readonly<
    { kind: "MEMBER_COLLECTION"; collectionId: string } | { kind: "SHARE"; shareId: string }
  >;
  mode: "OWNER_COLLECTION" | "MEMBER_COLLECTION" | "SHARE";
  permissions: Rights | null;
  prefix: Prisma.Sql;
  predicate: Prisma.Sql;
};
const live = new WeakMap<ScopedReadContext, Readonly<State>>();
export function scopedReadState(context: ScopedReadContext): Readonly<State> {
  const state = live.get(context);
  if (!state) throw new ShareError("SHARE_INTEGRITY");
  state.tx.checkBudget();
  return state;
}
async function assertTarget(tx: BoundedSearchReadTransaction, row: Share) {
  if (row.targetKind === "COLLECTION") {
    if (row.targetId !== row.collectionId) throw new ShareError("SHARE_INTEGRITY");
    return;
  }
  const [exists] =
    row.targetKind === "NODE"
      ? await tx.$queryRaw<{ present: boolean }[]>(
          Prisma.sql`SELECT EXISTS(SELECT 1 FROM "CollectionNode" WHERE id=${row.targetId}::uuid AND "collectionId"=${row.collectionId}::uuid) AS present`,
        )
      : await tx.$queryRaw<{ present: boolean }[]>(
          Prisma.sql`SELECT EXISTS(SELECT 1 FROM "CollectibleItem" WHERE id=${row.targetId}::uuid AND "collectionId"=${row.collectionId}::uuid AND "ownerId"=${row.creatorUserId} AND "deletedAt" IS NULL) AS present`,
        );
  if (!exists?.present) throw new ShareError("SHARE_NOT_FOUND");
}
/** One bounded snapshot for all scoped rows/counts; PIN failures commit in canonical preflight. */
export async function withScopedReadContext<T>(
  database: MembershipDatabase,
  actor: { userId: string } | null,
  input: unknown,
  consume: (context: ScopedReadContext) => Promise<T>,
): Promise<T> {
  const parsed = TargetSchema.safeParse(input);
  if (!parsed.success) throw new ShareError("SHARE_INVALID");
  const target = parsed.data;
  const actorId = actor ? MembershipActorIdSchema.safeParse(actor.userId) : null;
  if (actorId && !actorId.success) throw new MembershipError("MEMBERSHIP_INVALID");
  const userId = actorId?.success ? actorId.data : null;
  if (target.kind === "SHARE" && target.access.after) throw new ShareError("SHARE_INVALID");
  const port = createShareReadAccessPort(database);
  const verifiedPinHash = target.kind === "SHARE" ? await port.unlock(target.access, userId) : null;
  return runSearchRead(database, async (raw) => {
    let active = true;
    const check = () => {
      if (!active) throw new ShareError("SHARE_INTEGRITY");
      raw.checkBudget();
    };
    const tx: BoundedSearchReadTransaction = {
      checkBudget: check,
      $queryRaw: async <R>(query: Prisma.Sql) => {
        check();
        const rows = await raw.$queryRaw<R>(query);
        check();
        return rows;
      },
    };
    let state: State;
    let revalidate: () => Promise<void>;
    if (target.kind === "MEMBER_COLLECTION") {
      if (!userId) throw new MembershipError("MEMBERSHIP_NOT_FOUND");
      const { parent, role } = await loadCollectionReadAccess(
        tx,
        target.collectionId,
        userId,
        "SHARE",
      );
      state = {
        tx,
        actorUserId: userId,
        ownerUserId: parent.ownerId,
        reference: Object.freeze({ kind: "MEMBER_COLLECTION", collectionId: parent.id }),
        mode: role === "OWNER" ? "OWNER_COLLECTION" : "MEMBER_COLLECTION",
        permissions: null,
        prefix: Prisma.empty,
        predicate: Prisma.sql`i."collectionId"=${parent.id}::uuid AND i."ownerId"=${parent.ownerId} AND i."deletedAt" IS NULL`,
      };
      revalidate = async () => {
        await loadCollectionReadAccess(tx, parent.id, userId, "SHARE");
      };
    } else {
      const row = await port.authorized(tx, target.access, userId);
      if (target.expectedShareId && target.expectedShareId !== row.id)
        throw new ShareError("SHARE_NOT_FOUND");
      await port.checkPinAccess(tx, row, target.access, verifiedPinHash);
      await assertTarget(tx, row);
      const rights = SharePermissionsSchema.safeParse(row.permissions);
      if (!rights.success) throw new ShareError("SHARE_INTEGRITY");
      state = {
        tx,
        actorUserId: userId,
        ownerUserId: row.creatorUserId,
        reference: Object.freeze({ kind: "SHARE", shareId: row.id }),
        mode: "SHARE",
        permissions: Object.freeze({
          ...rights.data,
          documents: Object.freeze([...rights.data.documents]),
        }),
        prefix: shareScopeCte(row),
        predicate: shareItemPredicate(row),
      };
      revalidate = async () => {
        const final = await port.authorized(tx, target.access, userId);
        await port.checkPinAccess(tx, final, target.access, verifiedPinHash);
        await assertTarget(tx, final);
      };
    }
    const context = Object.freeze({}) as ScopedReadContext;
    live.set(context, Object.freeze(state));
    try {
      const result = await consume(context);
      await revalidate();
      return result;
    } finally {
      active = false;
      live.delete(context);
    }
  });
}
