import { randomUUID, createHash, randomBytes } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createInvitationService } from "./invitation-service";
import { createMembershipService } from "./membership-service";
import type { MembershipDatabase } from "./transfer-transaction";
import type { Prisma } from "@sammlerraum/db/search-sql";
let isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
let db: ReturnType<typeof createTestDatabaseClient>;
async function fixture() {
  const owner = randomUUID(),
    recipient = randomUUID(),
    outsider = randomUUID();
  const email = `recipient-${recipient}@example.invalid`;
  for (const [id, address] of [
    [owner, `${owner}@example.invalid`],
    [recipient, email],
    [outsider, `${outsider}@example.invalid`],
  ])
    await db.user.create({
      data: { id: id!, name: "Own invitation fixture", email: address!, emailVerified: true },
    });
  const collection = await db.collection.create({
    data: { ownerId: owner, name: "Private invited collection" },
  });
  return {
    owner,
    recipient,
    outsider,
    email,
    collection: collection.id,
    actor: { userId: owner },
    service: createInvitationService(db),
  };
}
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "actual recipient-bound invitations",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    it("does not allow a different verified account to accept an email-bound invite", async () => {
      const f = await fixture();
      const created = await f.service.createInvitation(f.actor, {
        collectionId: f.collection,
        expectedRevision: 0,
        target: { kind: "EMAIL", email: f.email },
        role: "EDITOR",
      });
      await expect(
        f.service.acceptInvitation({ userId: f.outsider }, { token: created.token }),
      ).rejects.toMatchObject({ code: "INVITATION_RECIPIENT_MISMATCH" });
      expect(await db.collectionMember.count({ where: { collectionId: f.collection } })).toBe(0);
    });
    it("accepts the intended verified recipient atomically and derives exactly one owner", async () => {
      const f = await fixture();
      const created = await f.service.createInvitation(f.actor, {
        collectionId: f.collection,
        expectedRevision: 0,
        target: { kind: "EMAIL", email: `  ${f.email.toUpperCase()}  ` },
        role: "EDITOR",
      });
      expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const accepted = await f.service.acceptInvitation(
        { userId: f.recipient },
        { token: created.token },
      );
      expect(accepted).toMatchObject({
        collectionId: f.collection,
        role: "EDITOR",
        alreadyAccepted: false,
      });
      const state = await createMembershipService(db).getMembershipState(f.actor, f.collection);
      expect(state.members).toContainEqual({ userId: f.recipient, role: "EDITOR" });
      expect(state.members.filter((member) => member.role === "OWNER")).toEqual([
        { userId: f.owner, role: "OWNER" },
      ]);
      expect(state.revision).toBe(1);
      const replay = await f.service.acceptInvitation(
        { userId: f.recipient },
        { token: created.token },
      );
      expect(replay).toMatchObject({ alreadyAccepted: true, role: "EDITOR" });
      expect(
        (await createMembershipService(db).getMembershipState(f.actor, f.collection)).revision,
      ).toBe(1);
    });

    it.each(["VIEWER", "EDITOR"] as const)(
      "records actual %s invitation membership exactly once with the accepting user",
      async (role) => {
        const f = await fixture(),
          created = await f.service.createInvitation(f.actor, {
            collectionId: f.collection,
            expectedRevision: 0,
            target: { kind: "USER", userId: f.recipient },
            role,
          });
        await f.service.acceptInvitation({ userId: f.recipient }, { token: created.token });
        const events = await db.auditEvent.findMany({
          where: { collectionId: f.collection, action: "MEMBERSHIP_JOINED" },
        });
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          source: "USER",
          actorId: f.recipient,
          subjectUserId: f.recipient,
          before: { role: null, invitationId: created.invitation.id },
          after: { role, invitationId: created.invitation.id },
        });
        expect(
          JSON.stringify(events, (_key, value) =>
            typeof value === "bigint" ? value.toString() : value,
          ),
        ).not.toContain(created.token);
        await f.service.acceptInvitation({ userId: f.recipient }, { token: created.token });
        expect(
          await db.auditEvent.count({
            where: { collectionId: f.collection, action: "MEMBERSHIP_JOINED" },
          }),
        ).toBe(1);
      },
    );
    it("requires current verified identity instead of trusting possession of the token", async () => {
      const f = await fixture();
      const created = await f.service.createInvitation(f.actor, {
        collectionId: f.collection,
        expectedRevision: 0,
        target: { kind: "USER", userId: f.recipient },
        role: "VIEWER",
      });
      await db.user.update({ where: { id: f.recipient }, data: { emailVerified: false } });
      await expect(
        f.service.acceptInvitation({ userId: f.recipient }, { token: created.token }),
      ).rejects.toMatchObject({ code: "INVITATION_VERIFICATION_REQUIRED" });
      expect(await db.collectionMember.count({ where: { collectionId: f.collection } })).toBe(0);
    });
    it("does not re-add membership when a consumed invitation is replayed after removal", async () => {
      const f = await fixture();
      const created = await f.service.createInvitation(f.actor, {
        collectionId: f.collection,
        expectedRevision: 0,
        target: { kind: "USER", userId: f.recipient },
        role: "VIEWER",
      });
      await f.service.acceptInvitation({ userId: f.recipient }, { token: created.token });
      await createMembershipService(db).removeMember(f.actor, {
        collectionId: f.collection,
        userId: f.recipient,
        expectedRevision: 1,
      });
      await expect(
        f.service.acceptInvitation({ userId: f.recipient }, { token: created.token }),
      ).rejects.toMatchObject({ code: "INVITATION_MEMBERSHIP_CONFLICT" });
      expect(await db.collectionMember.count({ where: { collectionId: f.collection } })).toBe(0);
    });
    it("stores only the token hash and hides tokens from the authorized pending list", async () => {
      const f = await fixture();
      const created = await f.service.createInvitation(f.actor, {
        collectionId: f.collection,
        expectedRevision: 0,
        target: { kind: "EMAIL", email: f.email },
        role: "VIEWER",
      });
      const [stored] = await db.$queryRaw<
        { tokenHash: string }[]
      >`SELECT "tokenHash" FROM "CollectionInvitation" WHERE id=${created.invitation.id}::uuid`;
      expect(stored!.tokenHash).toBe(createHash("sha256").update(created.token).digest("hex"));
      const listed = await f.service.getPendingInvitations(f.actor, f.collection);
      expect(listed.invitations).toHaveLength(1);
      expect(JSON.stringify(listed)).not.toContain(created.token);
      expect(JSON.stringify(listed)).not.toContain(stored!.tokenHash);
      await expect(
        f.service.getPendingInvitations({ userId: f.outsider }, f.collection),
      ).rejects.toMatchObject({ code: "INVITATION_NOT_FOUND" });
    });
    it("revokes a link without changing membership and rejects its later use", async () => {
      const f = await fixture();
      const created = await f.service.createInvitation(f.actor, {
        collectionId: f.collection,
        expectedRevision: 0,
        target: { kind: "EMAIL", email: f.email },
        role: "EDITOR",
      });
      await f.service.revokeInvitation(f.actor, {
        collectionId: f.collection,
        invitationId: created.invitation.id,
        expectedRevision: 0,
      });
      await expect(
        f.service.acceptInvitation({ userId: f.recipient }, { token: created.token }),
      ).rejects.toMatchObject({ code: "INVITATION_REVOKED" });
      expect(await db.collectionMember.count({ where: { collectionId: f.collection } })).toBe(0);
    });
    it("serializes simultaneous acceptance without duplicating membership or revisions", async () => {
      const f = await fixture();
      const created = await f.service.createInvitation(f.actor, {
        collectionId: f.collection,
        expectedRevision: 0,
        target: { kind: "USER", userId: f.recipient },
        role: "EDITOR",
      });
      const results = await Promise.all(
        [1, 2].map(() =>
          f.service.acceptInvitation({ userId: f.recipient }, { token: created.token }),
        ),
      );
      expect(results.map((result) => result.alreadyAccepted).sort()).toEqual([false, true]);
      expect(
        await db.collectionMember.count({
          where: { collectionId: f.collection, userId: f.recipient },
        }),
      ).toBe(1);
      expect(
        (await createMembershipService(db).getMembershipState(f.actor, f.collection)).revision,
      ).toBe(1);
    });
    it("checks current inviter authority after demotion rather than trusting an issued role", async () => {
      const f = await fixture(),
        members = createMembershipService(db);
      await members.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.recipient,
        role: "ADMIN",
        expectedRevision: 0,
      });
      await expect(
        f.service.createInvitation(
          { userId: f.recipient },
          {
            collectionId: f.collection,
            expectedRevision: 1,
            target: { kind: "USER", userId: f.outsider },
            role: "ADMIN",
          },
        ),
      ).rejects.toMatchObject({ code: "INVITATION_FORBIDDEN" });
      const created = await f.service.createInvitation(
        { userId: f.recipient },
        {
          collectionId: f.collection,
          expectedRevision: 1,
          target: { kind: "USER", userId: f.outsider },
          role: "EDITOR",
        },
      );
      await members.changeRole(f.actor, {
        collectionId: f.collection,
        userId: f.recipient,
        role: "VIEWER",
        expectedRevision: 1,
      });
      await expect(
        f.service.acceptInvitation({ userId: f.outsider }, { token: created.token }),
      ).rejects.toMatchObject({ code: "INVITATION_FORBIDDEN" });
      await expect(
        f.service.createInvitation(
          { userId: f.recipient },
          {
            collectionId: f.collection,
            expectedRevision: 2,
            target: { kind: "USER", userId: f.outsider },
            role: "VIEWER",
          },
        ),
      ).rejects.toMatchObject({ code: "INVITATION_FORBIDDEN" });
    });
    it("rejects an actual expired stored invitation using the database clock", async () => {
      const f = await fixture(),
        token = randomBytes(32).toString("base64url");
      await db.$executeRaw`INSERT INTO "CollectionInvitation" (id,"collectionId","creatorUserId","targetKind","targetEmail",role,"tokenHash","createdAt","expiresAt")
      VALUES (${randomUUID()}::uuid,${f.collection}::uuid,${f.owner},'EMAIL',${f.email},'VIEWER',${createHash("sha256").update(token).digest("hex")},timezone('UTC',clock_timestamp())-interval '2 hours',timezone('UTC',clock_timestamp())-interval '1 hour')`;
      await expect(
        f.service.acceptInvitation({ userId: f.recipient }, { token }),
      ).rejects.toMatchObject({ code: "INVITATION_EXPIRED" });
      expect(await db.collectionMember.count({ where: { collectionId: f.collection } })).toBe(0);
    });
    it("never overwrites a different existing membership through an invitation", async () => {
      const f = await fixture();
      const created = await f.service.createInvitation(f.actor, {
        collectionId: f.collection,
        expectedRevision: 0,
        target: { kind: "USER", userId: f.recipient },
        role: "ADMIN",
      });
      await createMembershipService(db).addMember(f.actor, {
        collectionId: f.collection,
        userId: f.recipient,
        role: "VIEWER",
        expectedRevision: 0,
      });
      await expect(
        f.service.acceptInvitation({ userId: f.recipient }, { token: created.token }),
      ).rejects.toMatchObject({ code: "INVITATION_MEMBERSHIP_CONFLICT" });
      expect(
        (
          await db.collectionMember.findUniqueOrThrow({
            where: { collectionId_userId: { collectionId: f.collection, userId: f.recipient } },
          })
        ).role,
      ).toBe("VIEWER");
    });
    it("erases pending email invitations when the intended account is deleted", async () => {
      const f = await fixture();
      const created = await f.service.createInvitation(f.actor, {
        collectionId: f.collection,
        expectedRevision: 0,
        target: { kind: "EMAIL", email: f.email },
        role: "VIEWER",
      });
      await db.user.delete({ where: { id: f.recipient } });
      expect(
        await db.$queryRaw`SELECT id FROM "CollectionInvitation" WHERE id=${created.invitation.id}::uuid`,
      ).toEqual([]);
      expect(await db.collection.count({ where: { id: f.collection } })).toBe(1);
    });
    it("rejects owner-role injection and stale membership decisions", async () => {
      const f = await fixture();
      await expect(
        f.service.createInvitation(f.actor, {
          collectionId: f.collection,
          expectedRevision: 0,
          target: { kind: "EMAIL", email: f.email },
          role: "OWNER",
        }),
      ).rejects.toMatchObject({ code: "INVITATION_INVALID" });
      await createMembershipService(db).addMember(f.actor, {
        collectionId: f.collection,
        userId: f.outsider,
        role: "VIEWER",
        expectedRevision: 0,
      });
      await expect(
        f.service.createInvitation(f.actor, {
          collectionId: f.collection,
          expectedRevision: 0,
          target: { kind: "EMAIL", email: f.email },
          role: "EDITOR",
        }),
      ).rejects.toMatchObject({ code: "INVITATION_CONFLICT" });
    });

    it("bounds pending invitations and rejects duplicate active targets", async () => {
      const f = await fixture();
      const request = {
        collectionId: f.collection,
        expectedRevision: 0,
        target: { kind: "EMAIL", email: f.email },
        role: "VIEWER",
      };
      await f.service.createInvitation(f.actor, request);
      await expect(f.service.createInvitation(f.actor, request)).rejects.toMatchObject({
        code: "INVITATION_CONFLICT",
      });
      for (let i = 1; i < 20; i++)
        await f.service.createInvitation(f.actor, {
          ...request,
          target: { kind: "EMAIL", email: `quota-${i}@example.invalid` },
        });
      await expect(
        f.service.createInvitation(f.actor, {
          ...request,
          target: { kind: "EMAIL", email: "over-limit@example.invalid" },
        }),
      ).rejects.toMatchObject({ code: "INVITATION_LIMIT_EXCEEDED" });
      expect(
        (await f.service.getPendingInvitations(f.actor, f.collection)).invitations,
      ).toHaveLength(20);
    });
    it("retains the exact maximum lifetime from one database-issued UTC anchor", async () => {
      const f = await fixture();
      const created = await f.service.createInvitation(f.actor, {
        collectionId: f.collection,
        expectedRevision: 0,
        target: { kind: "USER", userId: f.recipient },
        role: "EDITOR",
        expiresInSeconds: 1209600,
      });
      const [row] = await db.$queryRaw<
        { seconds: bigint }[]
      >`SELECT extract(epoch FROM ("expiresAt"-"createdAt"))::bigint AS seconds FROM "CollectionInvitation" WHERE id=${created.invitation.id}::uuid`;
      expect(row!.seconds).toBe(1209600n);
    });
    it("rejects raw consumption without the actual resulting membership", async () => {
      const f = await fixture();
      const created = await f.service.createInvitation(f.actor, {
        collectionId: f.collection,
        expectedRevision: 0,
        target: { kind: "USER", userId: f.recipient },
        role: "EDITOR",
      });
      await expect(
        db.$transaction(async (tx) => {
          await tx.$executeRaw`UPDATE "CollectionInvitation" SET "acceptedAt"=date_trunc('milliseconds',timezone('UTC',clock_timestamp())),"acceptedByUserId"=${f.recipient} WHERE id=${created.invitation.id}::uuid`;
        }),
      ).rejects.toMatchObject({
        cause: { code: "23514" },
        message: "Invitation acceptance must create its actual membership",
      });
      expect(
        (await f.service.getPendingInvitations(f.actor, f.collection)).invitations,
      ).toHaveLength(1);
    });
    it("rejects a changed email and preserves immutable recipient, role and token identity", async () => {
      const f = await fixture();
      const created = await f.service.createInvitation(f.actor, {
        collectionId: f.collection,
        expectedRevision: 0,
        target: { kind: "EMAIL", email: f.email },
        role: "EDITOR",
      });
      await db.user.update({
        where: { id: f.recipient },
        data: { email: `changed-${f.recipient}@example.invalid` },
      });
      await expect(
        f.service.acceptInvitation({ userId: f.recipient }, { token: created.token }),
      ).rejects.toMatchObject({ code: "INVITATION_RECIPIENT_MISMATCH" });
      await expect(
        db.$executeRaw`UPDATE "CollectionInvitation" SET "targetEmail"='forged@example.invalid' WHERE id=${created.invitation.id}::uuid`,
      ).rejects.toMatchObject({ meta: { driverAdapterError: { cause: { code: "23514" } } } });
      await expect(
        db.$executeRaw`UPDATE "CollectionInvitation" SET role='ADMIN' WHERE id=${created.invitation.id}::uuid`,
      ).rejects.toMatchObject({ meta: { driverAdapterError: { cause: { code: "23514" } } } });
    });
    it("does not preserve an old Owner's Admin grant after ownership transfer", async () => {
      const f = await fixture();
      const created = await f.service.createInvitation(f.actor, {
        collectionId: f.collection,
        expectedRevision: 0,
        target: { kind: "USER", userId: f.outsider },
        role: "ADMIN",
      });
      const members = createMembershipService(db);
      await members.addMember(f.actor, {
        collectionId: f.collection,
        userId: f.recipient,
        role: "EDITOR",
        expectedRevision: 0,
      });
      await members.transferOwnership(f.actor, {
        collectionId: f.collection,
        newOwnerId: f.recipient,
        expectedRevision: 1,
        confirmPrivateTransfer: true,
      });
      await expect(
        f.service.acceptInvitation({ userId: f.outsider }, { token: created.token }),
      ).rejects.toMatchObject({ code: "INVITATION_FORBIDDEN" });
      expect(
        await db.collectionMember.count({
          where: { collectionId: f.collection, userId: f.outsider },
        }),
      ).toBe(0);
    });

    it.each(["EMAIL", "USER"] as const)(
      "revokes an unconsumed %s invitation when the member is explicitly removed",
      async (kind) => {
        const f = await fixture();
        const created = await f.service.createInvitation(f.actor, {
          collectionId: f.collection,
          expectedRevision: 0,
          target: kind === "EMAIL" ? { kind, email: f.email } : { kind, userId: f.recipient },
          role: "VIEWER",
        });
        const members = createMembershipService(db);
        await members.addMember(f.actor, {
          collectionId: f.collection,
          userId: f.recipient,
          role: "VIEWER",
          expectedRevision: 0,
        });
        await members.removeMember(f.actor, {
          collectionId: f.collection,
          userId: f.recipient,
          expectedRevision: 1,
        });
        await expect(
          f.service.acceptInvitation({ userId: f.recipient }, { token: created.token }),
        ).rejects.toMatchObject({ code: "INVITATION_REVOKED" });
        expect(
          await db.collectionMember.count({
            where: { collectionId: f.collection, userId: f.recipient },
          }),
        ).toBe(0);
        expect((await members.getMembershipState(f.actor, f.collection)).revision).toBe(2);
      },
    );

    it("keeps the pending-invitation cap under concurrent Owner/Admin creation", async () => {
      const f = await fixture();
      await createMembershipService(db).addMember(f.actor, {
        collectionId: f.collection,
        userId: f.recipient,
        role: "ADMIN",
        expectedRevision: 0,
      });
      for (let i = 0; i < 19; i++)
        await f.service.createInvitation(f.actor, {
          collectionId: f.collection,
          expectedRevision: 1,
          target: { kind: "EMAIL", email: `race-quota-${i}@example.invalid` },
          role: "VIEWER",
        });
      const outcomes = await Promise.allSettled(
        [f.actor, { userId: f.recipient }].map((actor, i) =>
          f.service.createInvitation(actor, {
            collectionId: f.collection,
            expectedRevision: 1,
            target: { kind: "EMAIL", email: `last-slot-${i}@example.invalid` },
            role: "VIEWER",
          }),
        ),
      );
      expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const failure = outcomes.find((result) => result.status === "rejected");
      expect(failure?.status).toBe("rejected");
      if (failure?.status === "rejected")
        expect(failure.reason).toMatchObject({ code: "INVITATION_LIMIT_EXCEEDED" });
      expect(
        (await f.service.getPendingInvitations(f.actor, f.collection)).invitations,
      ).toHaveLength(20);
    });
    it("does not consume a token at membership capacity and can accept after a genuine slot is freed", async () => {
      const f = await fixture(),
        ids = Array.from({ length: 198 }, () => randomUUID());
      await db.user.createMany({
        data: ids.map((id) => ({
          id,
          name: "Own capacity fixture",
          email: `${id}@example.invalid`,
          emailVerified: true,
        })),
      });
      await db.collectionMember.createMany({
        data: [...ids, f.outsider].map((userId) => ({
          collectionId: f.collection,
          userId,
          role: "VIEWER" as const,
        })),
      });
      const created = await f.service.createInvitation(f.actor, {
        collectionId: f.collection,
        expectedRevision: 0,
        target: { kind: "USER", userId: f.recipient },
        role: "VIEWER",
      });
      await expect(
        f.service.acceptInvitation({ userId: f.recipient }, { token: created.token }),
      ).rejects.toMatchObject({ code: "INVITATION_LIMIT_EXCEEDED" });
      expect(
        (await f.service.getPendingInvitations(f.actor, f.collection)).invitations,
      ).toHaveLength(1);
      await createMembershipService(db).removeMember(f.actor, {
        collectionId: f.collection,
        userId: f.outsider,
        expectedRevision: 0,
      });
      await expect(
        f.service.acceptInvitation({ userId: f.recipient }, { token: created.token }),
      ).resolves.toMatchObject({ role: "VIEWER", alreadyAccepted: false });
      expect(await db.collectionMember.count({ where: { collectionId: f.collection } })).toBe(199);
      expect(
        (await db.collection.findUniqueOrThrow({ where: { id: f.collection } }))
          .collaborationRevision,
      ).toBe(2);
    });
    it("rolls back a token that expires during the real acceptance transaction with a closed expiry result", async () => {
      const f = await fixture(),
        id = randomUUID(),
        token = randomBytes(32).toString("base64url");
      await db.$executeRaw`INSERT INTO "CollectionInvitation" (id,"collectionId","creatorUserId","targetKind","targetUserId",role,"tokenHash","createdAt","expiresAt") VALUES (${id}::uuid,${f.collection}::uuid,${f.owner},'USER',${f.recipient},'VIEWER',${createHash("sha256").update(token).digest("hex")},timezone('UTC',clock_timestamp())-interval '1 minute',timezone('UTC',clock_timestamp())+interval '500 milliseconds')`;
      let entered!: () => void, release!: () => void;
      const ready = new Promise<void>((resolve) => (entered = resolve)),
        blocked = new Promise<void>((resolve) => (release = resolve));
      const hooked: MembershipDatabase = {
        $transaction: (work, options) =>
          db.$transaction(
            async (tx) =>
              work({
                $queryRaw: async <R>(query: Prisma.Sql) => {
                  const rows = await tx.$queryRaw<R>(query);
                  if (query.sql.includes('FROM "CollectionInvitation" WHERE id=')) {
                    expect((rows as { expired: boolean }[])[0]!.expired).toBe(false);
                    entered();
                    await blocked;
                  }
                  return rows;
                },
              }),
            options,
          ),
      };
      const attempt = createInvitationService(hooked).acceptInvitation(
        { userId: f.recipient },
        { token },
      );
      const result = attempt.then(
        (value) => ({ ok: true as const, value }),
        (error) => ({ ok: false as const, error }),
      );
      try {
        await ready;
        await vi.waitFor(
          async () => {
            const [row] = await db.$queryRaw<
              { expired: boolean }[]
            >`SELECT "expiresAt"<=timezone('UTC',clock_timestamp()) AS expired FROM "CollectionInvitation" WHERE id=${id}::uuid`;
            expect(row!.expired).toBe(true);
          },
          { timeout: 1500, interval: 20 },
        );
        release();
        const outcome = await result;
        expect(outcome.ok).toBe(false);
        if (!outcome.ok) expect(outcome.error).toMatchObject({ code: "INVITATION_EXPIRED" });
        expect(await db.collectionMember.count({ where: { collectionId: f.collection } })).toBe(0);
        expect(
          (await db.collection.findUniqueOrThrow({ where: { id: f.collection } }))
            .collaborationRevision,
        ).toBe(0);
      } finally {
        release();
        await result;
      }
    });

    it("maps the actual database expiry guard even when expiry happens inside the consuming SQL statement", async () => {
      const f = await fixture(),
        id = randomUUID(),
        token = randomBytes(32).toString("base64url");
      await db.$executeRaw`INSERT INTO "CollectionInvitation" (id,"collectionId","creatorUserId","targetKind","targetUserId",role,"tokenHash","createdAt","expiresAt") VALUES (${id}::uuid,${f.collection}::uuid,${f.owner},'USER',${f.recipient},'VIEWER',${createHash("sha256").update(token).digest("hex")},timezone('UTC',clock_timestamp())-interval '1 minute',timezone('UTC',clock_timestamp())+interval '200 milliseconds')`;
      await db.$executeRawUnsafe(
        `CREATE FUNCTION fixture_invitation_expiry_delay() RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN PERFORM pg_sleep(0.35); RETURN NEW; END $body$`,
      );
      await db.$executeRawUnsafe(
        `CREATE TRIGGER a_fixture_invitation_expiry_delay BEFORE UPDATE ON "CollectionInvitation" FOR EACH ROW WHEN (NEW.id='${id}'::uuid AND NEW."acceptedAt" IS NOT NULL AND OLD."acceptedAt" IS NULL) EXECUTE FUNCTION fixture_invitation_expiry_delay()`,
      );
      try {
        await expect(
          f.service.acceptInvitation({ userId: f.recipient }, { token }),
        ).rejects.toMatchObject({ code: "INVITATION_EXPIRED" });
        expect(await db.collectionMember.count({ where: { collectionId: f.collection } })).toBe(0);
        expect(
          (await db.collection.findUniqueOrThrow({ where: { id: f.collection } }))
            .collaborationRevision,
        ).toBe(0);
      } finally {
        await db.$executeRawUnsafe(
          'DROP TRIGGER a_fixture_invitation_expiry_delay ON "CollectionInvitation"',
        );
        await db.$executeRawUnsafe("DROP FUNCTION fixture_invitation_expiry_delay()");
      }
    });
  },
);
