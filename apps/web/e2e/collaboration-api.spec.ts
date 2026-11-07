import { randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { createPrismaClient } from "@sammlerraum/db/create-client";
import { hashPassword } from "better-auth/crypto";
const enabled = process.env.RUN_AUTH_E2E === "1",
  url = process.env.DATABASE_URL ?? "";
if (enabled && !new URL(url).pathname.endsWith("_test"))
  throw Error("Guarded invitation test database required");
const db = createPrismaClient(url),
  origin = "http://localhost:3000";
test("compiled invitation routes use real isolated cookie sessions and current database roles", async ({
  playwright,
}) => {
  test.skip(!enabled, "Owned local authentication fixture only");
  const ids = [randomUUID(), randomUUID(), randomUUID()],
    password = "own-invitation-cookie-test-password";
  const contexts: APIRequestContext[] = [];
  try {
    for (const id of ids) {
      await db.user.create({
        data: {
          id,
          name: "Own invitation API fixture",
          email: `${id}@example.invalid`,
          emailVerified: true,
          accounts: {
            create: {
              id: randomUUID(),
              accountId: id,
              providerId: "credential",
              password: await hashPassword(password),
            },
          },
        },
      });
      const context = await playwright.request.newContext({
        baseURL: origin,
        extraHTTPHeaders: { origin },
      });
      contexts.push(context);
      const signed = await context.post("/api/auth/sign-in/email", {
        data: { email: `${id}@example.invalid`, password },
      });
      expect(signed.status()).toBe(200);
    }
    const owner = contexts[0]!,
      recipient = contexts[1]!,
      outsider = contexts[2]!;
    const collection = await db.collection.create({
      data: { ownerId: ids[0]!, name: "Actual compiled invitation API" },
    });
    const endpoint = `/api/v1/collections/${collection.id}/invitations`;
    const created = await owner.post(endpoint, {
      data: {
        expectedRevision: 0,
        target: { kind: "EMAIL", email: `${ids[1]}@example.invalid` },
        role: "VIEWER",
      },
    });
    expect(created.status()).toBe(201);
    expect(created.headers()["cache-control"]).toBe("no-store");
    const body = await created.json();
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const listing = await owner.get(endpoint);
    expect(listing.status()).toBe(200);
    const pending = await listing.json();
    expect(pending.invitations).toHaveLength(1);
    expect(JSON.stringify(pending)).not.toContain(body.token);
    expect(JSON.stringify(pending)).not.toContain("tokenHash");
    const wrong = await outsider.post("/api/v1/invitations/accept", {
      data: { token: body.token },
    });
    expect(wrong.status()).toBe(403);
    expect((await wrong.json()).error.code).toBe("INVITATION_RECIPIENT_MISMATCH");
    expect((await outsider.get(endpoint)).status()).toBe(404);
    const accepted = await recipient.post("/api/v1/invitations/accept", {
      data: { token: body.token },
    });
    expect(accepted.status()).toBe(200);
    expect(await accepted.json()).toMatchObject({
      collectionId: collection.id,
      role: "VIEWER",
      alreadyAccepted: false,
    });
    expect(
      (
        await recipient.post(endpoint, {
          data: { expectedRevision: 1, target: { kind: "USER", userId: ids[2] }, role: "ADMIN" },
        })
      ).status(),
    ).toBe(403);
    const second = await owner.post(endpoint, {
      data: { expectedRevision: 1, target: { kind: "USER", userId: ids[2] }, role: "VIEWER" },
    });
    expect(second.status()).toBe(201);
    const revoked = await second.json();
    expect(
      (
        await owner.post(`${endpoint}/${revoked.invitation.id}/revoke`, {
          data: { expectedRevision: 1 },
        })
      ).status(),
    ).toBe(200);
    const denied = await outsider.post("/api/v1/invitations/accept", {
      data: { token: revoked.token },
    });
    expect(denied.status()).toBe(410);
    expect((await denied.json()).error.code).toBe("INVITATION_REVOKED");
    expect(await db.collectionMember.count({ where: { collectionId: collection.id } })).toBe(1);
  } finally {
    await Promise.all(contexts.map((context) => context.dispose()));
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
