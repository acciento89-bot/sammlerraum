import { randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { createPrismaClient } from "@sammlerraum/db/create-client";
import { createItemService } from "@sammlerraum/domain/items/item-service";
import { hashPassword } from "better-auth/crypto";
import { credentialRateLimitFixture } from "./support/credential-rate-limit-fixture";
const enabled = process.env.RUN_AUTH_E2E === "1",
  databaseUrl = process.env.DATABASE_URL ?? "",
  origin = "http://localhost:3000";
if (enabled && !new URL(databaseUrl).pathname.endsWith("_test"))
  throw Error("Owned community browser database required");
test("compiled community endpoints bind real cookies, enforce current public visibility and block cleanup", async ({
  playwright,
}) => {
  test.skip(!enabled, "Owned local auth fixtures only");
  const db = createPrismaClient(databaseUrl),
    ids = [randomUUID(), randomUUID()],
    contexts: APIRequestContext[] = [],
    addresses: Awaited<ReturnType<typeof credentialRateLimitFixture>>[] = [],
    password = "own-community-cookie-test-password";
  try {
    for (const id of ids) {
      await db.user.create({
        data: {
          id,
          name: "Own community cookie fixture",
          email: `${id}@example.invalid`,
          emailVerified: true,
          profile: {
            create: {
              handle: `u_${id.replaceAll("-", "").slice(0, 20)}`,
              displayName: "Community cookie display",
            },
          },
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
        }),
        address = await credentialRateLimitFixture(db);
      contexts.push(context);
      addresses.push(address);
      expect(
        (
          await context.post("/api/auth/sign-in/email", {
            headers: { "x-forwarded-for": address.ip },
            data: { email: `${id}@example.invalid`, password },
          })
        ).status(),
      ).toBe(200);
    }
    const actor = contexts[0]!,
      owner = contexts[1]!,
      c = await db.collection.create({
        data: { ownerId: ids[1]!, name: "Own public cookie collection", visibility: "PUBLIC" },
      }),
      item = await createItemService(db, ids[1]!).createItem({
        collectionId: c.id,
        title: "Visible cookie community item",
        visibility: "PUBLIC",
        privateNotes: "never-cookie-community-private",
      });
    expect(
      (await actor.post("/api/v1/community/follows", { data: { userId: ids[1] } })).status(),
    ).toBe(200);
    expect(
      (
        await actor.post("/api/v1/community/favorites", { data: { type: "ITEM", id: item.id } })
      ).status(),
    ).toBe(200);
    expect(
      (
        await actor.post("/api/v1/community/favorites", {
          data: { type: "ITEM", id: item.id, actorId: ids[1] },
        })
      ).status(),
    ).toBe(400);
    const response = await actor.get("/api/v1/community/favorites");
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    const listing = await response.json();
    expect(listing.favorites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: item.id, title: "Visible cookie community item" }),
      ]),
    );
    expect(JSON.stringify(listing)).not.toMatch(
      /never-cookie-community-private|privateNotes|purchaseAmountMinor|@example.invalid/,
    );
    expect((await owner.get("/api/v1/community/favorites")).status()).toBe(200);
    expect((await (await owner.get("/api/v1/community/favorites")).json()).favorites).toEqual([]);
    await createItemService(db, ids[1]!).updateItem(item.id, { visibility: "PRIVATE" });
    expect((await (await actor.get("/api/v1/community/favorites")).json()).favorites).toEqual([]);
    expect(
      (
        await actor.delete("/api/v1/community/favorites", { data: { type: "ITEM", id: item.id } })
      ).status(),
    ).toBe(200);
    await createItemService(db, ids[1]!).updateItem(item.id, { visibility: "PUBLIC" });
    expect(
      (
        await actor.post("/api/v1/community/favorites", { data: { type: "ITEM", id: item.id } })
      ).status(),
    ).toBe(200);
    await db.userBlock.create({ data: { blockerId: ids[1]!, blockedId: ids[0]! } });
    expect(
      (await actor.post("/api/v1/community/follows", { data: { userId: ids[1] } })).status(),
    ).toBe(403);
    expect(
      (
        await actor.post("/api/v1/community/favorites", { data: { type: "ITEM", id: item.id } })
      ).status(),
    ).toBe(403);
    expect((await (await actor.get("/api/v1/community/favorites")).json()).favorites).toEqual([]);
    expect((await (await actor.get("/api/v1/community/follows")).json()).follows).toEqual([]);
  } finally {
    for (const context of contexts) await context.dispose();
    await db.user.deleteMany({ where: { id: { in: ids } } });
    for (const address of addresses) await address.cleanup();
    await db.$disconnect();
  }
});
