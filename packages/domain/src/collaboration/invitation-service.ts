import { createTrustedAuditContext } from "../audit/audit-context";
import { recordAuditEventInTransaction } from "../audit/audit-service";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@sammlerraum/db/search-sql";
import {
  InvitationDtoSchema,
  InvitationError,
  MembershipError,
  MembershipActorIdSchema,
  MembershipCollectionIdSchema,
  CreateInvitationSchema,
  AcceptInvitationSchema,
  RevokeInvitationSchema,
  INVITATION_MAX_PENDING,
  MEMBERSHIP_MAX_MEMBERS,
} from "@sammlerraum/contracts/collaboration";
import { runTransferTransaction, type MembershipDatabase } from "./transfer-transaction";
import type { BoundedSearchReadTransaction } from "../search/search-read";
type Actor = { userId: string };
type Role = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
type Parent = { id: string; ownerId: string; collaborationRevision: number };
type Identity = { id: string; email: string; emailVerified: boolean };
type Invite = {
  id: string;
  collectionId: string;
  creatorUserId: string;
  targetKind: "EMAIL" | "USER";
  targetEmail: string | null;
  targetUserId: string | null;
  role: Exclude<Role, "OWNER">;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  acceptedByUserId: string | null;
  revokedAt: Date | null;
  expired: boolean;
};
function fail(code: InvitationError["code"]): never {
  throw new InvitationError(code);
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return fail("INVITATION_INVALID");
  return parsed.data;
}
/** Translate only the fixed native guard signal; never expose SQL diagnostics. */
function isNativeInvitationExpiry(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 5) return false;
  const value = error as Record<string, unknown>;
  if (
    (value.code === "23514" || value.originalCode === "23514") &&
    (value.message === "Invitation expired" || value.originalMessage === "Invitation expired")
  )
    return true;
  return ["meta", "cause", "driverAdapterError"].some((key) =>
    isNativeInvitationExpiry(value[key], depth + 1),
  );
}
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
function dto(row: Invite) {
  return InvitationDtoSchema.parse({
    id: row.id,
    collectionId: row.collectionId,
    target:
      row.targetKind === "EMAIL"
        ? { kind: "EMAIL" as const, email: row.targetEmail! }
        : { kind: "USER" as const, userId: row.targetUserId! },
    role: row.role,
    expiresAt: row.expiresAt.toISOString(),
    status: row.revokedAt
      ? ("REVOKED" as const)
      : row.acceptedAt
        ? ("ACCEPTED" as const)
        : row.expired
          ? ("EXPIRED" as const)
          : ("PENDING" as const),
  });
}
/** Invitations grant membership only through actual current identity, creator role and parent locks. */
export function createInvitationService(database: MembershipDatabase) {
  async function within<T>(work: (tx: BoundedSearchReadTransaction) => Promise<T>) {
    try {
      return await runTransferTransaction(database, work);
    } catch (error) {
      if (error instanceof InvitationError) throw error;
      if (error instanceof MembershipError) {
        if (error.code === "MEMBERSHIP_UNAVAILABLE") return fail("INVITATION_UNAVAILABLE");
        if (error.code === "MEMBERSHIP_CONFLICT") return fail("INVITATION_CONFLICT");
      }
      return fail("INVITATION_INTEGRITY");
    }
  }
  async function identity(tx: BoundedSearchReadTransaction, userId: string) {
    const [user] = await tx.$queryRaw<Identity[]>(
      Prisma.sql`SELECT id,email,"emailVerified" FROM "user" WHERE id=${userId} FOR NO KEY UPDATE`,
    );
    if (!user) return fail("INVITATION_NOT_FOUND");
    return user;
  }
  async function parent(tx: BoundedSearchReadTransaction, collectionId: string) {
    const [row] = await tx.$queryRaw<Parent[]>(
      Prisma.sql`SELECT id,"ownerId","collaborationRevision" FROM "Collection" WHERE id=${collectionId}::uuid AND "deletedAt" IS NULL FOR UPDATE`,
    );
    if (!row) return fail("INVITATION_NOT_FOUND");
    return row;
  }
  async function role(
    tx: BoundedSearchReadTransaction,
    p: Parent,
    userId: string,
  ): Promise<Role | null> {
    if (p.ownerId === userId) return "OWNER";
    const [row] = await tx.$queryRaw<{ role: Exclude<Role, "OWNER"> }[]>(
      Prisma.sql`SELECT role FROM "CollectionMember" WHERE "collectionId"=${p.id}::uuid AND "userId"=${userId}`,
    );
    return row?.role ?? null;
  }
  async function manager(tx: BoundedSearchReadTransaction, p: Parent, userId: string) {
    const current = await role(tx, p, userId);
    if (!current) return fail("INVITATION_NOT_FOUND");
    if (current !== "OWNER" && current !== "ADMIN") return fail("INVITATION_FORBIDDEN");
    return current;
  }
  function revision(p: Parent, expected: number) {
    if (p.collaborationRevision !== expected) return fail("INVITATION_CONFLICT");
  }
  function grant(current: Role | null, requested: Role) {
    if (
      (current !== "OWNER" && current !== "ADMIN") ||
      (requested === "ADMIN" && current !== "OWNER")
    )
      return fail("INVITATION_FORBIDDEN");
  }
  async function load(tx: BoundedSearchReadTransaction, id: string, collectionId?: string) {
    const [row] = await tx.$queryRaw<Invite[]>(
      Prisma.sql`SELECT *,"expiresAt"<=timezone('UTC',clock_timestamp()) AS expired FROM "CollectionInvitation" WHERE id=${id}::uuid ${collectionId ? Prisma.sql`AND "collectionId"=${collectionId}::uuid` : Prisma.empty} FOR UPDATE`,
    );
    if (!row) return fail("INVITATION_NOT_FOUND");
    return row;
  }
  function recipient(user: Identity, invite: Invite) {
    if (!user.emailVerified) return fail("INVITATION_VERIFICATION_REQUIRED");
    if (
      invite.targetKind === "USER"
        ? invite.targetUserId !== user.id
        : invite.targetEmail !== user.email.trim().toLowerCase()
    )
      return fail("INVITATION_RECIPIENT_MISMATCH");
  }
  return {
    async createInvitation(who: Actor, input: unknown) {
      const userId = parse(MembershipActorIdSchema, who?.userId),
        value = parse(CreateInvitationSchema, input);
      return within(async (tx) => {
        const user = await identity(tx, userId),
          p = await parent(tx, value.collectionId),
          current = await manager(tx, p, userId);
        revision(p, value.expectedRevision);
        grant(current, value.role);
        if (value.target.kind === "USER") {
          if (value.target.userId === userId) return fail("INVITATION_INVALID");
          const exists = await tx.$queryRaw<{ id: string }[]>(
            Prisma.sql`SELECT id FROM "user" WHERE id=${value.target.userId}`,
          );
          if (!exists.length) return fail("INVITATION_NOT_FOUND");
        } else if (value.target.email === user.email.trim().toLowerCase())
          return fail("INVITATION_INVALID");
        const [count] = await tx.$queryRaw<{ count: bigint }[]>(
          Prisma.sql`SELECT count(*) FROM "CollectionInvitation" WHERE "collectionId"=${p.id}::uuid AND "acceptedAt" IS NULL AND "revokedAt" IS NULL AND "expiresAt">timezone('UTC',clock_timestamp())`,
        );
        if (!count || count.count >= BigInt(INVITATION_MAX_PENDING))
          return fail("INVITATION_LIMIT_EXCEEDED");
        const targetEmail = value.target.kind === "EMAIL" ? value.target.email : null,
          targetUserId = value.target.kind === "USER" ? value.target.userId : null;
        const [duplicate] = await tx.$queryRaw<{ present: boolean }[]>(
          Prisma.sql`SELECT EXISTS(SELECT 1 FROM "CollectionInvitation" WHERE "collectionId"=${p.id}::uuid AND "targetEmail" IS NOT DISTINCT FROM ${targetEmail} AND "targetUserId" IS NOT DISTINCT FROM ${targetUserId} AND "acceptedAt" IS NULL AND "revokedAt" IS NULL AND "expiresAt">timezone('UTC',clock_timestamp())) AS present`,
        );
        if (duplicate?.present) return fail("INVITATION_CONFLICT");
        const token = randomBytes(32).toString("base64url"),
          id = randomUUID();
        await tx.$queryRaw(Prisma.sql`WITH issued AS(SELECT date_trunc('milliseconds',timezone('UTC',clock_timestamp())) AS now)
          INSERT INTO "CollectionInvitation" (id,"collectionId","creatorUserId","targetKind","targetEmail","targetUserId",role,"tokenHash","createdAt","expiresAt")
          SELECT ${id}::uuid,${p.id}::uuid,${userId},${value.target.kind}::"CollectionInvitationTargetKind",${targetEmail},${targetUserId},${value.role}::"CollectionMemberRole",${hash(token)},issued.now,issued.now+${value.expiresInSeconds}*interval '1 second' FROM issued RETURNING id`);
        return { invitation: dto(await load(tx, id, p.id)), token };
      });
    },
    async getPendingInvitations(who: Actor, collectionIdInput: unknown) {
      const userId = parse(MembershipActorIdSchema, who?.userId),
        collectionId = parse(MembershipCollectionIdSchema, collectionIdInput);
      return within(async (tx) => {
        await identity(tx, userId);
        const p = await parent(tx, collectionId),
          current = await manager(tx, p, userId);
        const rows = await tx.$queryRaw<Invite[]>(
          Prisma.sql`SELECT *,false AS expired FROM "CollectionInvitation" WHERE "collectionId"=${p.id}::uuid AND "acceptedAt" IS NULL AND "revokedAt" IS NULL AND "expiresAt">timezone('UTC',clock_timestamp()) ${current === "OWNER" ? Prisma.empty : Prisma.sql`AND role<>'ADMIN'`} ORDER BY "createdAt",id LIMIT ${INVITATION_MAX_PENDING + 1}`,
        );
        if (rows.length > INVITATION_MAX_PENDING) return fail("INVITATION_LIMIT_EXCEEDED");
        return { invitations: rows.map(dto) };
      });
    },
    async revokeInvitation(who: Actor, input: unknown) {
      const userId = parse(MembershipActorIdSchema, who?.userId),
        value = parse(RevokeInvitationSchema, input);
      return within(async (tx) => {
        await identity(tx, userId);
        const p = await parent(tx, value.collectionId),
          current = await manager(tx, p, userId);
        revision(p, value.expectedRevision);
        const row = await load(tx, value.invitationId, p.id);
        grant(current, row.role);
        if (row.acceptedAt) return fail("INVITATION_CONFLICT");
        if (!row.revokedAt)
          await tx.$queryRaw(
            Prisma.sql`UPDATE "CollectionInvitation" SET "revokedAt"=date_trunc('milliseconds',timezone('UTC',clock_timestamp())) WHERE id=${row.id}::uuid RETURNING id`,
          );
        return dto(await load(tx, row.id, p.id));
      });
    },
    async acceptInvitation(who: Actor, input: unknown) {
      const userId = parse(MembershipActorIdSchema, who?.userId),
        value = parse(AcceptInvitationSchema, input);
      return within(async (tx) => {
        const user = await identity(tx, userId);
        const [reference] = await tx.$queryRaw<{ id: string; collectionId: string }[]>(
          Prisma.sql`SELECT id,"collectionId" FROM "CollectionInvitation" WHERE "tokenHash"=${hash(value.token)}`,
        );
        if (!reference) return fail("INVITATION_NOT_FOUND");
        const p = await parent(tx, reference.collectionId),
          row = await load(tx, reference.id, p.id);
        recipient(user, row);
        if (row.revokedAt) return fail("INVITATION_REVOKED");
        const current = await role(tx, p, userId);
        if (row.acceptedAt) {
          if (row.acceptedByUserId !== userId) return fail("INVITATION_RECIPIENT_MISMATCH");
          if (!current) return fail("INVITATION_MEMBERSHIP_CONFLICT");
          return {
            collectionId: p.id,
            role: current,
            acceptedAt: row.acceptedAt.toISOString(),
            alreadyAccepted: true,
          };
        }
        if (row.expired) return fail("INVITATION_EXPIRED");
        grant(await role(tx, p, row.creatorUserId), row.role);
        if (current && current !== row.role) return fail("INVITATION_MEMBERSHIP_CONFLICT");
        if (!current) {
          const [count] = await tx.$queryRaw<{ count: bigint }[]>(
            Prisma.sql`SELECT count(*) FROM "CollectionMember" WHERE "collectionId"=${p.id}::uuid`,
          );
          if (!count || count.count >= BigInt(MEMBERSHIP_MAX_MEMBERS - 1))
            return fail("INVITATION_LIMIT_EXCEEDED");
          if (p.collaborationRevision >= 2147483647) return fail("INVITATION_CONFLICT");
          await tx.$queryRaw(
            Prisma.sql`INSERT INTO "CollectionMember" ("collectionId","userId",role) VALUES (${p.id}::uuid,${userId},${row.role}::"CollectionMemberRole") RETURNING "userId"`,
          );
          await tx.$queryRaw(
            Prisma.sql`UPDATE "Collection" SET "collaborationRevision"="collaborationRevision"+1,"updatedAt"=timezone('UTC',clock_timestamp()) WHERE id=${p.id}::uuid RETURNING id`,
          );
        }
        let accepted: { acceptedAt: Date } | undefined;
        try {
          [accepted] = await tx.$queryRaw<{ acceptedAt: Date }[]>(
            Prisma.sql`UPDATE "CollectionInvitation" SET "acceptedAt"=date_trunc('milliseconds',timezone('UTC',clock_timestamp())),"acceptedByUserId"=${userId} WHERE id=${row.id}::uuid AND "expiresAt">timezone('UTC',clock_timestamp()) AND "acceptedAt" IS NULL AND "revokedAt" IS NULL RETURNING "acceptedAt"`,
          );
        } catch (error) {
          if (isNativeInvitationExpiry(error)) return fail("INVITATION_EXPIRED");
          throw error;
        }
        if (!accepted) return fail("INVITATION_EXPIRED");
        if (!current)
          await recordAuditEventInTransaction(
            tx,
            createTrustedAuditContext({ source: "USER", actorId: userId }),
            {
              resourceType: "COLLECTION",
              resourceId: p.id,
              action: "MEMBERSHIP_JOINED",
              subjectUserId: userId,
              before: { role: null, invitationId: row.id },
              after: { role: row.role, invitationId: row.id },
            },
          );
        return {
          collectionId: p.id,
          role: row.role,
          acceptedAt: accepted.acceptedAt.toISOString(),
          alreadyAccepted: false,
        };
      });
    },
  };
}
