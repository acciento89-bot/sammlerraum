import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@sammlerraum/db/search-sql";
import { MembershipError } from "@sammlerraum/contracts/collaboration";
import { ResolveShareSchema, ShareError } from "@sammlerraum/contracts/sharing";
import {
  runTransferTransaction,
  type MembershipDatabase,
} from "../collaboration/transfer-transaction";
import type { BoundedSearchReadTransaction } from "../search/search-read";
import { verifySharePin } from "./share-pin";
export type Share = {
  id: string;
  collectionId: string;
  creatorUserId: string;
  targetKind: "COLLECTION" | "NODE" | "ITEM";
  targetId: string;
  recipientUserId: string | null;
  tokenHash: string | null;
  permissions: unknown;
  pinHash: string | null;
  revision: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  expired: boolean;
};
export type Parent = { id: string; ownerId: string; collaborationRevision: number };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function fail(code: ShareError["code"]): never {
  throw new ShareError(code);
}
/** Internal canonical read port; credentials and rows must never become public DTOs. */
export function createShareReadAccessPort(database: MembershipDatabase) {
  async function within<T>(work: (tx: BoundedSearchReadTransaction) => Promise<T>) {
    try {
      return await runTransferTransaction(database, work);
    } catch (error) {
      if (error instanceof ShareError) throw error;
      if (error instanceof MembershipError) {
        if (error.code === "MEMBERSHIP_UNAVAILABLE") return fail("SHARE_UNAVAILABLE");
        if (error.code === "MEMBERSHIP_CONFLICT") return fail("SHARE_CONFLICT");
      }
      return fail("SHARE_INTEGRITY");
    }
  }
  async function parent(tx: BoundedSearchReadTransaction, id: string, exclusive = false) {
    const [row] = await tx.$queryRaw<Parent[]>(
      Prisma.sql`SELECT id,"ownerId","collaborationRevision" FROM "Collection" WHERE id=${id}::uuid AND "deletedAt" IS NULL ${exclusive ? Prisma.sql`FOR UPDATE` : Prisma.sql`FOR SHARE`}`,
    );
    return row ?? fail("SHARE_NOT_FOUND");
  }
  async function load(tx: BoundedSearchReadTransaction, id: string) {
    const [row] = await tx.$queryRaw<Share[]>(
      Prisma.sql`SELECT s.id,s."collectionId",s."creatorUserId",s."targetKind",s."targetId",s."recipientUserId",s."tokenHash",s.permissions,s."pinHash",s.revision,s."expiresAt",coalesce(s."revokedAt",r."revokedAt") AS "revokedAt",coalesce(s."expiresAt"<=timezone('UTC',clock_timestamp()),false) AS expired FROM "CollectionShare" s LEFT JOIN "ShareRevocation" r ON r."shareId"=s.id WHERE s.id=${id}::uuid FOR SHARE OF s`,
    );
    return row ?? fail("SHARE_NOT_FOUND");
  }
  async function authorized(
    tx: BoundedSearchReadTransaction,
    value: z.infer<typeof ResolveShareSchema>,
    userId: string | null,
  ) {
    const [ref] =
      "token" in value
        ? await tx.$queryRaw<{ id: string; collectionId: string }[]>(
            Prisma.sql`SELECT id,"collectionId" FROM "CollectionShare" WHERE "tokenHash"=${hash(value.token)}`,
          )
        : await tx.$queryRaw<{ id: string; collectionId: string }[]>(
            Prisma.sql`SELECT s.id,s."collectionId" FROM "CollectionShare" s JOIN "user" u ON u.id=s."recipientUserId" AND u."emailVerified" WHERE s.id=${value.shareId}::uuid AND s."recipientUserId"=${userId}`,
          );
    if (!ref) return fail("SHARE_NOT_FOUND");
    const p = await parent(tx, ref.collectionId),
      row = await load(tx, ref.id);
    if (row.revokedAt || p.ownerId !== row.creatorUserId) return fail("SHARE_REVOKED");
    if (row.expired) return fail("SHARE_EXPIRED");
    return row;
  }
  async function checkPinAccess(
    tx: BoundedSearchReadTransaction,
    row: Share,
    value: z.infer<typeof ResolveShareSchema>,
    verifiedPinHash: string | null,
  ) {
    if (!row.pinHash || row.pinHash === verifiedPinHash) return;
    if (value.accessToken) {
      const [session] = await tx.$queryRaw<{ present: boolean }[]>(
        Prisma.sql`SELECT EXISTS(SELECT 1 FROM "ShareAccessSession" WHERE "shareId"=${row.id}::uuid AND "tokenHash"=${hash(value.accessToken)} AND "expiresAt">timezone('UTC',clock_timestamp())) AS present`,
      );
      if (session?.present) return;
    }
    return fail("SHARE_PIN_REQUIRED");
  }
  async function unlock(value: z.infer<typeof ResolveShareSchema>, userId: string | null) {
    const pinState = await within(async (tx) => {
      const row = await authorized(tx, value, userId);
      if (!row.pinHash) return null;
      if (value.accessToken) {
        await checkPinAccess(tx, row, value, null);
        return null;
      }
      if (!value.pin) return fail("SHARE_PIN_REQUIRED");
      const budget = await tx.$queryRaw<{ shareId: string }[]>(
        Prisma.sql`INSERT INTO "SharePinBudget" ("shareId",attempts,"windowStartedAt") VALUES (${row.id}::uuid,1,timezone('UTC',clock_timestamp())) ON CONFLICT ("shareId") DO UPDATE SET attempts=CASE WHEN "SharePinBudget"."windowStartedAt"<=timezone('UTC',clock_timestamp())-interval '15 minutes' THEN 1 ELSE "SharePinBudget".attempts+1 END,"windowStartedAt"=CASE WHEN "SharePinBudget"."windowStartedAt"<=timezone('UTC',clock_timestamp())-interval '15 minutes' THEN timezone('UTC',clock_timestamp()) ELSE "SharePinBudget"."windowStartedAt" END WHERE "SharePinBudget".attempts<5 OR "SharePinBudget"."windowStartedAt"<=timezone('UTC',clock_timestamp())-interval '15 minutes' RETURNING "shareId"`,
      );
      if (!budget.length) return fail("SHARE_RATE_LIMITED");
      return row.pinHash;
    });
    const verifiedPinHash =
      pinState && (await verifySharePin(value.pin!, pinState)) ? pinState : null;
    if (pinState && !verifiedPinHash) return fail("SHARE_PIN_INVALID");
    return verifiedPinHash;
  }
  return { within, parent, load, authorized, checkPinAccess, unlock };
}
