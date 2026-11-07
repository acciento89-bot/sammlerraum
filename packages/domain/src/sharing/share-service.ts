import { createTrustedAuditContext } from "../audit/audit-context";
import { recordAuditEventInTransaction } from "../audit/audit-service";
import type { StorageProvider } from "@sammlerraum/storage";
import { shareScopeCte, shareItemPredicate } from "./share-scope";
import {
  projectShareItems,
  validateShareDocuments,
  projectShareCollectionInsurance,
} from "./share-projection";
import { hashSharePin, verifySharePin } from "./share-pin";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@sammlerraum/db/search-sql";
import { MembershipActorIdSchema, MembershipError } from "@sammlerraum/contracts/collaboration";
import {
  CreateShareSchema,
  ResolveShareSchema,
  RevokeShareSchema,
  ShareError,
  SharePermissionsSchema,
  ReadSharedAssetSchema,
} from "@sammlerraum/contracts/sharing";
import {
  runTransferTransaction,
  type MembershipDatabase,
} from "../collaboration/transfer-transaction";
import type { BoundedSearchReadTransaction } from "../search/search-read";

type Actor = { userId: string };
type Share = {
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
type Parent = { id: string; ownerId: string; collaborationRevision: number };
type Item = {
  id: string;
  title: string;
  publicDescription: string | null;
  quantity: number;
  privateNotes: string | null;
};
const hashBytes = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function fail(code: ShareError["code"]): never {
  throw new ShareError(code);
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : fail("SHARE_INVALID");
}
function permissions(row: Share) {
  const result = SharePermissionsSchema.safeParse(row.permissions);
  return result.success ? result.data : fail("SHARE_INTEGRITY");
}
function dto(row: Share) {
  return {
    id: row.id,
    revision: row.revision,
    target: { kind: row.targetKind, id: row.targetId },
    permissions: permissions(row),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revoked: row.revokedAt !== null,
    pinRequired: row.pinHash !== null,
  };
}

/** An explicit read capability, never a membership or an impersonated write actor. */
export function createShareService(
  database: MembershipDatabase,
  storage?: Pick<StorageProvider, "read">,
) {
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
  async function auditIdentity(tx: BoundedSearchReadTransaction, userId: string) {
    const [user] = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM "user" WHERE id=${userId} FOR NO KEY UPDATE`,
    );
    if (!user) return fail("SHARE_NOT_FOUND");
    return createTrustedAuditContext({ source: "USER", actorId: userId });
  }
  async function parent(tx: BoundedSearchReadTransaction, id: string, exclusive = false) {
    const [row] = await tx.$queryRaw<Parent[]>(
      Prisma.sql`SELECT id,"ownerId","collaborationRevision" FROM "Collection" WHERE id=${id}::uuid AND "deletedAt" IS NULL ${exclusive ? Prisma.sql`FOR UPDATE` : Prisma.sql`FOR SHARE`}`,
    );
    return row ?? fail("SHARE_NOT_FOUND");
  }
  async function load(tx: BoundedSearchReadTransaction, id: string) {
    const [row] = await tx.$queryRaw<Share[]>(
      Prisma.sql`SELECT *,coalesce("expiresAt"<=timezone('UTC',clock_timestamp()),false) AS expired FROM "CollectionShare" WHERE id=${id}::uuid FOR SHARE`,
    );
    return row ?? fail("SHARE_NOT_FOUND");
  }
  async function targetCollection(
    tx: BoundedSearchReadTransaction,
    kind: Share["targetKind"],
    id: string,
  ) {
    if (kind === "COLLECTION") return id;
    const [row] =
      kind === "NODE"
        ? await tx.$queryRaw<{ collectionId: string }[]>(
            Prisma.sql`SELECT "collectionId" FROM "CollectionNode" WHERE id=${id}::uuid`,
          )
        : await tx.$queryRaw<{ collectionId: string }[]>(
            Prisma.sql`SELECT "collectionId" FROM "CollectibleItem" WHERE id=${id}::uuid AND "deletedAt" IS NULL`,
          );
    return row?.collectionId ?? fail("SHARE_NOT_FOUND");
  }
  async function currentScope(
    tx: BoundedSearchReadTransaction,
    row: Share,
    after?: string,
    maximum = 100,
    privateNotes = false,
  ) {
    // UNION (not UNION ALL) terminates even with corrupt cyclic hierarchy data.
    const nodes = shareScopeCte(row);
    if (row.targetKind === "NODE") {
      const [exists] = await tx.$queryRaw<{ present: boolean }[]>(
        Prisma.sql`SELECT EXISTS(SELECT 1 FROM "CollectionNode" WHERE id=${row.targetId}::uuid AND "collectionId"=${row.collectionId}::uuid) AS present`,
      );
      if (!exists?.present) return fail("SHARE_NOT_FOUND");
    }
    const items = await tx.$queryRaw<(Item & { oversized: boolean })[]>(
      Prisma.sql`${nodes} SELECT i.id,CASE WHEN octet_length(i.title)<=2000 THEN i.title ELSE '' END AS title,CASE WHEN octet_length(i."publicDescription")<=100000 THEN i."publicDescription" ELSE NULL END AS "publicDescription",i.quantity,${privateNotes ? Prisma.sql`CASE WHEN octet_length(i."privateNotes")<=100000 THEN i."privateNotes" ELSE NULL END` : Prisma.sql`NULL::text`} AS "privateNotes",(octet_length(i.title)>2000 OR coalesce(octet_length(i."publicDescription")>100000,false) ${privateNotes ? Prisma.sql`OR coalesce(octet_length(i."privateNotes")>100000,false)` : Prisma.empty}) AS oversized FROM "CollectibleItem" i WHERE ${shareItemPredicate(row)} ${after ? Prisma.sql`AND i.id>${after}::uuid` : Prisma.empty} ORDER BY i.id LIMIT ${maximum + 1} FOR SHARE OF i`,
    );
    if (items.some((item) => item.oversized)) return fail("SHARE_LIMIT_EXCEEDED");
    if (row.targetKind === "ITEM" && !items.length && !after) return fail("SHARE_NOT_FOUND");
    return items;
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
  async function assetFor(
    tx: BoundedSearchReadTransaction,
    userId: string | null,
    input: z.infer<typeof ReadSharedAssetSchema>,
    verifiedPinHash: string | null,
  ) {
    const row = await authorized(tx, input.access, userId);
    await checkPinAccess(tx, row, input.access, verifiedPinHash);
    const rights = permissions(row);
    if (input.kind === "IMAGE" ? !rights.images : !rights.documents.includes(input.linkId))
      return fail("SHARE_NOT_FOUND");
    const table = input.kind === "IMAGE" ? Prisma.sql`"MediaLink"` : Prisma.sql`"DocumentLink"`;
    const [asset] = await tx.$queryRaw<
      {
        id: string;
        storageKey: string;
        mimeType: string;
        byteSize: bigint;
        checksumSha256: string;
      }[]
    >(
      Prisma.sql`${shareScopeCte(row)} SELECT a.id,a."storageKey",a."mimeType",a."byteSize",a."checksumSha256" FROM ${table} l JOIN "CollectibleItem" i ON i.id=l."itemId" AND i."ownerId"=l."ownerId" JOIN "MediaAsset" a ON a.id=l."assetId" AND a."ownerId"=l."ownerId" WHERE ${shareItemPredicate(row)} AND l.id=${input.linkId}::uuid AND a.kind=${input.kind}::"MediaKind" AND a.status='READY' AND a."cleanupStartedAt" IS NULL AND a."byteSize" BETWEEN 1 AND 26214400 ${input.kind === "IMAGE" ? Prisma.sql`AND a."mimeType" IN ('image/jpeg','image/png','image/webp')` : Prisma.sql`AND a."mimeType"='application/pdf' ${rights.purchaseReceipts ? Prisma.empty : Prisma.sql`AND l.category NOT IN ('PURCHASE_RECEIPT','INVOICE')`}`}`,
    );
    if (!asset) return fail("SHARE_NOT_FOUND");
    return asset;
  }
  return {
    async createShare(who: Actor, input: unknown) {
      const userId = parse(MembershipActorIdSchema, who?.userId),
        value = parse(CreateShareSchema, input);
      const pinHash = value.pin
        ? await (async () => {
            await within(async (tx) => {
              const id = await targetCollection(tx, value.target.kind, value.target.id),
                p = await parent(tx, id);
              if (p.ownerId !== userId) return fail("SHARE_NOT_FOUND");
              if (p.collaborationRevision !== value.expectedRevision) return fail("SHARE_CONFLICT");
            });
            return hashSharePin(value.pin!);
          })()
        : null;
      return within(async (tx) => {
        const audit = await auditIdentity(tx, userId);
        const collectionId = await targetCollection(tx, value.target.kind, value.target.id),
          p = await parent(tx, collectionId, true);
        if (p.ownerId !== userId) return fail("SHARE_NOT_FOUND");
        if (p.collaborationRevision !== value.expectedRevision) return fail("SHARE_CONFLICT");
        if (value.recipient.kind === "USER") {
          const [user] = await tx.$queryRaw<{ emailVerified: boolean }[]>(
            Prisma.sql`SELECT "emailVerified" FROM "user" WHERE id=${value.recipient.userId}`,
          );
          if (!user?.emailVerified || value.recipient.userId === userId)
            return fail("SHARE_INVALID");
        }
        const [count] = await tx.$queryRaw<{ count: bigint }[]>(
          Prisma.sql`SELECT count(*) FROM "CollectionShare" WHERE "collectionId"=${p.id}::uuid AND "revokedAt" IS NULL AND ("expiresAt" IS NULL OR "expiresAt">timezone('UTC',clock_timestamp()))`,
        );
        if (!count || count.count >= 100n) return fail("SHARE_LIMIT_EXCEEDED");
        await validateShareDocuments(
          tx,
          {
            collectionId: p.id,
            creatorUserId: userId,
            targetKind: value.target.kind,
            targetId: value.target.id,
          },
          value.permissions,
        );
        const token =
            value.recipient.kind === "TOKEN" ? randomBytes(32).toString("base64url") : undefined,
          id = randomUUID();
        await tx.$queryRaw(
          Prisma.sql`INSERT INTO "CollectionShare" (id,"collectionId","creatorUserId","targetKind","targetId","recipientUserId","tokenHash",permissions,"pinHash","expiresAt") VALUES (${id}::uuid,${p.id}::uuid,${userId},${value.target.kind},${value.target.id}::uuid,${value.recipient.kind === "USER" ? value.recipient.userId : null},${token ? hash(token) : null},${JSON.stringify(value.permissions)}::jsonb,${pinHash},${value.expiresInSeconds === null ? Prisma.sql`NULL` : Prisma.sql`timezone('UTC',clock_timestamp())+${value.expiresInSeconds}*interval '1 second'`}) RETURNING id`,
        );
        const created = dto(await load(tx, id));
        await recordAuditEventInTransaction(tx, audit, {
          resourceType: "SHARE",
          resourceId: id,
          action: "SHARE_CREATED",
          before: null,
          after: created,
        });
        return { share: created, ...(token ? { token } : {}) };
      });
    },
    async resolveShare(who: Actor | null, input: unknown) {
      const value = parse(ResolveShareSchema, input),
        userId = who ? parse(MembershipActorIdSchema, who.userId) : null;
      const verifiedPinHash = await unlock(value, userId);
      return within(async (tx) => {
        const row = await authorized(tx, value, userId);
        await checkPinAccess(tx, row, value, verifiedPinHash);
        const rights = permissions(row),
          items = await currentScope(tx, row, value.after, 100, rights.privateNotes),
          page = items.slice(0, 100);
        let accessToken: string | undefined;
        if (row.pinHash && verifiedPinHash) {
          accessToken = randomBytes(32).toString("base64url");
          await tx.$queryRaw(
            Prisma.sql`DELETE FROM "ShareAccessSession" WHERE "shareId"=${row.id}::uuid AND "expiresAt"<=timezone('UTC',clock_timestamp()) RETURNING "tokenHash"`,
          );
          await tx.$queryRaw(
            Prisma.sql`INSERT INTO "ShareAccessSession" ("tokenHash","shareId","expiresAt") VALUES (${hash(accessToken)},${row.id}::uuid,timezone('UTC',clock_timestamp())+interval '10 minutes') RETURNING "shareId"`,
          );
        }
        const projected = await projectShareItems(tx, row, rights, page),
          insurance = await projectShareCollectionInsurance(tx, row, rights);
        const final = await authorized(tx, value, userId);
        await checkPinAccess(tx, final, value, verifiedPinHash);
        return {
          ...(accessToken ? { accessToken } : {}),
          data: {
            shareId: row.id,
            target: { kind: row.targetKind, id: row.targetId },
            items: projected,
            next: items.length > 100 ? page.at(-1)!.id : null,
            exportAllowed: rights.export,
            ...(insurance !== undefined ? { insurance } : {}),
          },
        };
      });
    },
    async exportShare(who: Actor | null, input: unknown) {
      const value = parse(ResolveShareSchema, input),
        userId = who ? parse(MembershipActorIdSchema, who.userId) : null;
      if (value.after) return fail("SHARE_INVALID");
      const verifiedPinHash = await unlock(value, userId);
      return within(async (tx) => {
        const row = await authorized(tx, value, userId);
        await checkPinAccess(tx, row, value, verifiedPinHash);
        const rights = permissions(row);
        if (!rights.export) return fail("SHARE_FORBIDDEN");
        const source = await currentScope(tx, row, undefined, 1000, rights.privateNotes);
        if (source.length > 1000) return fail("SHARE_LIMIT_EXCEEDED");
        const items = await projectShareItems(tx, row, rights, source),
          insurance = await projectShareCollectionInsurance(tx, row, rights);
        const bytes = Buffer.from(
          JSON.stringify({
            schemaVersion: 1,
            items,
            ...(insurance !== undefined ? { insurance } : {}),
          }),
        );
        if (bytes.byteLength > 2097152) return fail("SHARE_LIMIT_EXCEEDED");
        const final = await authorized(tx, value, userId);
        await checkPinAccess(tx, final, value, verifiedPinHash);
        return {
          bytes,
          mimeType: "application/json",
          fileName: `shared-${row.id}.json`,
        };
      });
    },
    async readSharedAsset(who: Actor | null, input: unknown) {
      const value = parse(ReadSharedAssetSchema, input),
        userId = who ? parse(MembershipActorIdSchema, who.userId) : null;
      const verifiedPinHash = await unlock(value.access, userId);
      const initial = await within((tx) => assetFor(tx, userId, value, verifiedPinHash));
      if (!storage) return fail("SHARE_UNAVAILABLE");
      let bytes: Uint8Array;
      try {
        bytes = await storage.read(initial.storageKey, {
          maxBytes: 26214400,
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        return fail("SHARE_UNAVAILABLE");
      }
      if (
        BigInt(bytes.byteLength) !== initial.byteSize ||
        hashBytes(bytes) !== initial.checksumSha256
      )
        return fail("SHARE_INTEGRITY");
      const final = await within((tx) => assetFor(tx, userId, value, verifiedPinHash));
      if (
        final.id !== initial.id ||
        final.storageKey !== initial.storageKey ||
        final.mimeType !== initial.mimeType ||
        final.byteSize !== initial.byteSize ||
        final.checksumSha256 !== initial.checksumSha256
      )
        return fail("SHARE_NOT_FOUND");
      return {
        bytes,
        mimeType: final.mimeType,
        fileName: `shared-${value.linkId}.${value.kind === "DOCUMENT" ? "pdf" : final.mimeType === "image/jpeg" ? "jpg" : final.mimeType === "image/png" ? "png" : "webp"}`,
      };
    },
    async revokeShare(who: Actor, input: unknown) {
      const userId = parse(MembershipActorIdSchema, who?.userId),
        value = parse(RevokeShareSchema, input);
      return within(async (tx) => {
        const audit = await auditIdentity(tx, userId);
        const [ref] = await tx.$queryRaw<{ collectionId: string }[]>(
          Prisma.sql`SELECT "collectionId" FROM "CollectionShare" WHERE id=${value.shareId}::uuid`,
        );
        if (!ref) return fail("SHARE_NOT_FOUND");
        const p = await parent(tx, ref.collectionId, true);
        if (p.ownerId !== userId) return fail("SHARE_NOT_FOUND");
        const row = await load(tx, value.shareId);
        if (row.revision !== value.expectedRevision) return fail("SHARE_CONFLICT");
        if (!row.revokedAt)
          await tx.$queryRaw(
            Prisma.sql`UPDATE "CollectionShare" SET "revokedAt"=timezone('UTC',clock_timestamp()),revision=revision+1 WHERE id=${row.id}::uuid RETURNING id`,
          );
        const after = dto(await load(tx, row.id));
        if (!row.revokedAt)
          await recordAuditEventInTransaction(tx, audit, {
            resourceType: "SHARE",
            resourceId: row.id,
            action: "SHARE_REVOKED",
            before: dto(row),
            after,
          });
        return after;
      });
    },
  };
}
