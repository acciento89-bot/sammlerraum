import { randomUUID, randomBytes, createHash } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { z } from "zod";
import {
  InvitationCreatedResponseSchema,
  InvitationListResponseSchema,
} from "@sammlerraum/contracts/collaboration";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import {
  createInvitationRouteDependencies,
  createInvitationRouteHandlers,
} from "./invitation-routes";
let isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>,
  db: ReturnType<typeof createTestDatabaseClient>;
const origin = "https://example.invalid";
const post = (body: unknown) =>
  new Request(origin + "/api/v1/invitations", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
async function fixture() {
  const owner = randomUUID(),
    recipient = randomUUID(),
    outsider = randomUUID();
  for (const id of [owner, recipient, outsider])
    await db.user.create({
      data: {
        id,
        name: "Own HTTP invitation fixture",
        email: `${id}@example.invalid`,
        emailVerified: true,
      },
    });
  const collection = await db.collection.create({
    data: { ownerId: owner, name: "Private HTTP invitations" },
  });
  // Fixture identities are explicit; real authority, roles and resulting membership come from PostgreSQL.
  const handlers = (userId: string) =>
    createInvitationRouteHandlers(
      createInvitationRouteDependencies(
        db,
        { api: { getSession: async () => ({ user: { id: userId } }) } },
        origin,
      ),
    );
  return { owner, recipient, outsider, collection: collection.id, handlers };
}
describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "real PostgreSQL invitation Request/Response handlers",
  () => {
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    it("creates, lists and accepts through fresh authenticated handlers without exposing the stored token hash", async () => {
      const f = await fixture(),
        owner = f.handlers(f.owner),
        recipient = f.handlers(f.recipient),
        outside = f.handlers(f.outsider);
      const created = await owner.POST(
        post({
          expectedRevision: 0,
          target: { kind: "EMAIL", email: `${f.recipient}@example.invalid` },
          role: "EDITOR",
        }),
        f.collection,
      );
      expect(created.status).toBe(201);
      expect(created.headers.get("cache-control")).toBe("no-store");
      expect(created.headers.get("x-request-id")).toBeTruthy();
      const body = InvitationCreatedResponseSchema.parse(await created.json());
      expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const pending = await owner.GET(new Request(origin + "/api/v1/invitations"), f.collection);
      expect(pending.status).toBe(200);
      const listed = InvitationListResponseSchema.parse(await pending.json());
      expect(listed.invitations).toHaveLength(1);
      expect(JSON.stringify(listed)).not.toMatch(/tokenHash|creatorUserId/);
      expect(JSON.stringify(listed)).not.toContain(body.token);
      const forbidden = await outside.GET(
        new Request(origin + "/api/v1/invitations"),
        f.collection,
      );
      expect(forbidden.status).toBe(404);
      expect(await forbidden.text()).not.toContain(`${f.recipient}@example.invalid`);
      const accepted = await recipient.ACCEPT(post({ token: body.token }));
      expect(accepted.status).toBe(200);
      expect(await accepted.json()).toMatchObject({
        collectionId: f.collection,
        role: "EDITOR",
        alreadyAccepted: false,
      });
      expect(
        (
          await db.collectionMember.findUniqueOrThrow({
            where: { collectionId_userId: { collectionId: f.collection, userId: f.recipient } },
          })
        ).role,
      ).toBe("EDITOR");
      expect(
        (await db.collection.findUniqueOrThrow({ where: { id: f.collection } }))
          .collaborationRevision,
      ).toBe(1);
      const editorGrant = await recipient.POST(
        post({ expectedRevision: 1, target: { kind: "USER", userId: f.outsider }, role: "ADMIN" }),
        f.collection,
      );
      expect(editorGrant.status).toBe(403);
    });
    it("binds revocation to the requested owned collection and immediately rejects the revoked token", async () => {
      const f = await fixture(),
        owner = f.handlers(f.owner),
        recipient = f.handlers(f.recipient);
      const response = await owner.POST(
          post({
            expectedRevision: 0,
            target: { kind: "USER", userId: f.recipient },
            role: "VIEWER",
          }),
          f.collection,
        ),
        created = InvitationCreatedResponseSchema.parse(await response.json());
      const another = await db.collection.create({
        data: { ownerId: f.owner, name: "Another owned collection" },
      });
      expect(
        (await owner.REVOKE(post({ expectedRevision: 0 }), another.id, created.invitation.id))
          .status,
      ).toBe(404);
      expect(
        (await owner.REVOKE(post({ expectedRevision: 0 }), f.collection, created.invitation.id))
          .status,
      ).toBe(200);
      const denied = await recipient.ACCEPT(post({ token: created.token }));
      expect(denied.status).toBe(410);
      expect(await denied.json()).toMatchObject({ error: { code: "INVITATION_REVOKED" } });
      expect(await db.collectionMember.count({ where: { collectionId: f.collection } })).toBe(0);
    });
    it("maps an actual stored expiration to a private non-cached error without changing membership", async () => {
      const f = await fixture(),
        token = randomBytes(32).toString("base64url");
      await db.$executeRaw`INSERT INTO "CollectionInvitation" (id,"collectionId","creatorUserId","targetKind","targetUserId",role,"tokenHash","createdAt","expiresAt") VALUES (${randomUUID()}::uuid,${f.collection}::uuid,${f.owner},'USER',${f.recipient},'VIEWER',${createHash("sha256").update(token).digest("hex")},timezone('UTC',clock_timestamp())-interval '2 hours',timezone('UTC',clock_timestamp())-interval '1 hour')`;
      const response = await f.handlers(f.recipient).ACCEPT(post({ token }));
      expect(response.status).toBe(410);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const body = z
        .object({
          error: z
            .object({ code: z.string(), message: z.string(), requestId: z.string() })
            .strict(),
        })
        .strict()
        .parse(await response.json());
      expect(body.error.code).toBe("INVITATION_EXPIRED");
      expect(JSON.stringify(body)).not.toContain(token);
      expect(JSON.stringify(body)).not.toContain(f.owner);
      expect(await db.collectionMember.count({ where: { collectionId: f.collection } })).toBe(0);
    });
  },
);
