import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { createAdminUsersHandler, type adminUsers } from "./admin-users";

type Listing = Awaited<ReturnType<typeof adminUsers>>;
const listing = async (response: Response) => (await response.json()) as Listing;

const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const prefix = `admin_${randomUUID().replaceAll("-", "")}`;
const owner = `${prefix}_owner`;
let actor: string | null = owner;
const handler = () =>
  createAdminUsersHandler({
    db: db!,
    appOrigin: "http://localhost:3000",
    getSession: async () => (actor ? { user: { id: actor } } : null),
  });
const request = (query = "") =>
  new Request(`http://localhost:3000/api/v1/admin/users?q=${prefix}${query}`);

describe.runIf(enabled)("owner administration with real PostgreSQL authority", () => {
  beforeAll(async () => {
    await db!.user.createMany({
      data: Array.from({ length: 27 }, (_, i) => ({
        id: i === 0 ? owner : `${prefix}_${i}`,
        name: `${prefix} user ${i}`,
        email: `${prefix}_${i}@example.test`,
        emailVerified: i % 2 === 0,
        createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)),
      })),
    });
    await db!.applicationRoleGrant.create({
      data: {
        userId: owner,
        role: "ADMIN",
        grantedBy: "synthetic-test",
        reason: "Owned admin fixture",
      },
    });
  });
  afterAll(async () => {
    if (!db) return;
    await db.applicationRoleGrant.deleteMany({ where: { userId: owner } });
    await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
    await db.$disconnect();
  });
  it("reads only the public account projection and paginates deterministic filtered rows", async () => {
    const first = await handler()(request());
    expect(first.status).toBe(200);
    const firstData = await listing(first);
    expect(firstData.matched).toBe(27);
    expect(firstData.users).toHaveLength(25);
    expect(Object.keys(firstData.users[0]!).sort()).toEqual([
      "createdAt",
      "email",
      "emailVerified",
      "id",
      "name",
    ]);
    const second = await listing(await handler()(request("&page=2")));
    expect(second.users).toHaveLength(2);
    const ids = [...firstData.users, ...second.users].map((user: { id: string }) => user.id);
    expect(new Set(ids).size).toBe(27);
    expect((await listing(await handler()(request("&verified=yes")))).matched).toBe(14);
    expect((await listing(await handler()(request("&verified=no")))).matched).toBe(13);
  });
  it("refuses unverified admins and respects role revocation in the actual database", async () => {
    await db!.user.update({ where: { id: owner }, data: { emailVerified: false } });
    expect((await handler()(request())).status).toBe(403);
    await db!.user.update({ where: { id: owner }, data: { emailVerified: true } });
    await db!.applicationRoleGrant.update({
      where: { userId: owner },
      data: { role: "MODERATOR" },
    });
    expect((await handler()(request())).status).toBe(403);
    await db!.applicationRoleGrant.delete({ where: { userId: owner } });
    expect((await handler()(request())).status).toBe(403);
    actor = null;
    expect((await handler()(request())).status).toBe(401);
  });
});
