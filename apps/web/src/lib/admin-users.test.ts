import { describe, expect, it, vi } from "vitest";
import { createAdminUsersHandler, berlinDayStart, requireAdmin } from "./admin-users";

function fixture(role: string | null = "ADMIN", verified = true) {
  const db = {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        emailVerified: verified,
        applicationRoleGrant: role ? { role } : null,
      }),
      count: vi.fn().mockResolvedValue(7),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(async (work: (tx: unknown) => unknown) => work(db)),
  };
  const getSession = vi.fn().mockResolvedValue({ user: { id: "owner" } });
  const handler = createAdminUsersHandler({
    db: db as never,
    getSession,
    appOrigin: "https://sammlerraum.de",
  });
  return { db, getSession, handler };
}
const request = (query = "") => new Request(`https://sammlerraum.de/api/v1/admin/users${query}`);

describe("private owner user directory", () => {
  it("denies anonymous access before reading users", async () => {
    const f = fixture();
    f.getSession.mockResolvedValue(null);
    expect((await f.handler(request())).status).toBe(401);
    expect(f.db.user.findMany).not.toHaveBeenCalled();
  });
  it.each([
    [null, true],
    ["MODERATOR", true],
    ["ADMIN", false],
  ])("denies role %s verified %s", async (role, verified) => {
    const f = fixture(role, verified);
    expect((await f.handler(request())).status).toBe(403);
    expect(f.db.user.count).not.toHaveBeenCalled();
    expect(f.db.user.findMany).not.toHaveBeenCalled();
  });
  it("honors a revoked grant on the next request", async () => {
    const f = fixture();
    expect((await f.handler(request())).status).toBe(200);
    f.db.user.findUnique.mockResolvedValue({ emailVerified: true, applicationRoleGrant: null });
    expect((await f.handler(request())).status).toBe(403);
  });
  it("returns uncached bounded search and no credentials", async () => {
    const f = fixture();
    const response = await f.handler(request("?q=Alex&page=2&verified=yes"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const args = f.db.user.findMany.mock.calls[0]![0];
    expect(args.skip).toBe(25);
    expect(args.take).toBe(25);
    expect(args.where.emailVerified).toBe(true);
    expect(args.select).toEqual({
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      createdAt: true,
    });
    expect(args.where.OR[0].name.contains).toBe("Alex");
    expect(await response.json()).toMatchObject({
      page: 2,
      pageSize: 25,
      matched: 7,
      summary: { total: 7 },
    });
  });
  it.each([
    "?page=-1",
    "?page=5000",
    "?q=a&q=b",
    "?verified=maybe",
    `?q=${"x".repeat(121)}`,
    "?token=oops",
  ])("rejects invalid query %s", async (query) => {
    const f = fixture();
    expect((await f.handler(request(query))).status).toBe(400);
    expect(f.db.user.findMany).not.toHaveBeenCalled();
  });
  it("rejects foreign origins", async () => {
    const f = fixture();
    expect(
      (await f.handler(new Request(request(), { headers: { origin: "https://evil.example" } })))
        .status,
    ).toBe(403);
    expect(f.getSession).not.toHaveBeenCalled();
  });
  it("rejects a deleted account", async () => {
    const f = fixture();
    f.db.user.findUnique.mockResolvedValue(null);
    await expect(requireAdmin(f.db as never, "owner")).rejects.toMatchObject({ status: 403 });
  });
});
describe("Berlin reporting dates", () => {
  it("uses Berlin midnight, including summer and winter", () => {
    expect(berlinDayStart(new Date("2026-11-11T00:30:00Z")).toISOString()).toBe(
      "2026-11-10T23:00:00.000Z",
    );
    expect(berlinDayStart(new Date("2026-07-11T12:00:00Z")).toISOString()).toBe(
      "2026-07-10T22:00:00.000Z",
    );
  });
  it("uses calendar days across DST, not multiples of 24 hours", () => {
    expect(berlinDayStart(new Date("2026-03-29T12:00:00Z")).toISOString()).toBe(
      "2026-03-28T23:00:00.000Z",
    );
    expect(berlinDayStart(new Date("2026-10-25T12:00:00Z")).toISOString()).toBe(
      "2026-10-24T22:00:00.000Z",
    );
    expect(berlinDayStart(new Date("2026-03-31T12:00:00Z"), -6).toISOString()).toBe(
      "2026-03-24T23:00:00.000Z",
    );
  });
});
