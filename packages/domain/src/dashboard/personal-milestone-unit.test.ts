import { afterEach, describe, expect, it, vi } from "vitest";
import type { SearchDatabase } from "../search/search-read";
import type { Prisma } from "@sammlerraum/db/search-sql";
import { createPersonalMilestoneService } from "./personal-milestone-service";
const actor = { userId: "synthetic-owner" },
  input = { title: "Authored date", milestoneDate: "2026-11-05" };
const row = {
  id: "00000000-0000-4000-8000-000000000001",
  ...input,
  revision: 1,
  createdAt: new Date("2026-11-05T12:00:00.001Z"),
  updatedAt: new Date("2026-11-05T12:00:00.001Z"),
};
function database(
  overrides: { total?: unknown; rows?: unknown[]; clock?: unknown } = {},
): SearchDatabase {
  return {
    $transaction: async (work) =>
      work({
        $queryRaw: async <T>(query: Prisma.Sql) => {
          if (query.sql.includes("milestones:clock"))
            return [{ readAt: overrides.clock ?? row.createdAt }] as T;
          if (query.sql.includes("milestones:count"))
            return [{ total: overrides.total ?? 1n }] as T;
          if (query.sql.includes("milestones:page")) return (overrides.rows ?? [row]) as T;
          return [] as T;
        },
      }),
  };
}
afterEach(() => vi.restoreAllMocks());
describe("personal milestone closed failures (explicit driver simulations)", () => {
  it("rejects malformed retained projections, including a malformed sentinel, without repairing them", async () => {
    for (const rows of [
      [{ ...row, title: " Cafe\u0301 " }],
      [{ ...row, milestoneDate: "1900-02-29" }],
      [{ ...row, createdAt: new Date(NaN) }],
      [{ ...row, revision: 0 }],
      [],
    ])
      await expect(
        createPersonalMilestoneService(database({ rows })).listMilestones(actor),
      ).rejects.toMatchObject({ code: "SEARCH_INVARIANT" });
    await expect(
      createPersonalMilestoneService(
        database({ total: 2n, rows: [row, { ...row, title: "bad\n" }] }),
      ).listMilestones(actor, { limit: 1 }),
    ).rejects.toMatchObject({ code: "SEARCH_INVARIANT" });
  });
  it("never rounds unsafe counts or trusts malformed server clocks", async () => {
    for (const total of [-1n, 9007199254740992n, 1])
      await expect(
        createPersonalMilestoneService(database({ total })).listMilestones(actor),
      ).rejects.toMatchObject({ code: "SEARCH_INVARIANT" });
    await expect(
      createPersonalMilestoneService(database({ clock: new Date(NaN) })).listMilestones(actor),
    ).rejects.toMatchObject({ code: "SEARCH_INVARIANT" });
  });
  it("allocates one UUID across internal serialization retries, without claiming HTTP idempotency", async () => {
    let attempts = 0;
    const ids: string[] = [];
    const db: SearchDatabase = {
      $transaction: async (work) => {
        attempts++;
        const result = await work({
          $queryRaw: async <T>(query: Prisma.Sql) => {
            if (query.sql.includes("milestones:create")) {
              const id = String(query.values[0]);
              ids.push(id);
              return [{ ...row, id }] as T;
            }
            return [] as T;
          },
        });
        if (attempts === 1)
          throw {
            code: "P2010",
            meta: { driverAdapterError: { cause: { originalCode: "40001" } } },
          };
        return result;
      },
    };
    const saved = await createPersonalMilestoneService(db).createMilestone(actor, input);
    expect(attempts).toBe(2);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(1);
    expect(saved.id).toBe(ids[0]);
  });
  it("does not claim success if the overall budget expires after transaction settlement", async () => {
    let time = 0;
    vi.spyOn(performance, "now").mockImplementation(() => time);
    const db: SearchDatabase = {
      $transaction: async (work) => {
        const result = await work({
          $queryRaw: async <T>(query: Prisma.Sql) =>
            query.sql.includes("milestones:create")
              ? ([{ ...row, id: String(query.values[0]) }] as T)
              : ([] as T),
        });
        time = 12001;
        return result;
      },
    };
    await expect(
      createPersonalMilestoneService(db).createMilestone(actor, input),
    ).rejects.toMatchObject({ code: "SEARCH_UNAVAILABLE" });
  });
  it("closes dependency errors and malformed cursor data before private content can escape", async () => {
    let calls = 0;
    const db: SearchDatabase = {
      $transaction: async () => {
        calls++;
        throw Object.assign(new Error("private SQL and title"), { code: "P1001" });
      },
    };
    const s = createPersonalMilestoneService(db);
    await expect(s.listMilestones(actor, { cursor: "a" })).rejects.toMatchObject({
      code: "MILESTONE_INVALID",
    });
    expect(calls).toBe(0);
    try {
      await s.listMilestones(actor);
      throw Error("must reject");
    } catch (error) {
      expect(error).toMatchObject({ code: "SEARCH_UNAVAILABLE" });
      expect(String(error)).not.toContain("private SQL");
    }
  });
});
