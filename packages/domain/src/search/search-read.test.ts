import { afterEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@sammlerraum/db/search-sql";
import { runSearchRead, type SearchDatabase } from "./search-read";
import { checkedSearchTotal } from "./item-search-service";
import { isReadDependencyFailure } from "../api/read-dependency-errors";
afterEach(() => vi.restoreAllMocks());
describe("search read processing budgets", () => {
  it("rejects count overflow without rounding", () => {
    expect(checkedSearchTotal(9007199254740991n)).toBe(Number.MAX_SAFE_INTEGER);
    for (const value of [-1n, 9007199254740992n])
      expect(() => checkedSearchTotal(value)).toThrow("SEARCH_INVARIANT");
  });
  it("does not return work after the transaction's budget expired", async () => {
    let time = 0;
    vi.spyOn(performance, "now").mockImplementation(() => time);
    const database: SearchDatabase = {
      $transaction: async (work) => work({ $queryRaw: async <T>() => [] as T }),
    };
    await expect(
      runSearchRead(database, async () => {
        time = 5001;
        return "late";
      }),
    ).rejects.toMatchObject({ code: "SEARCH_UNAVAILABLE" });
  });
  it("accounts for acquisition against the total budget", async () => {
    let time = 0;
    vi.spyOn(performance, "now").mockImplementation(() => time);
    let calls = 0;
    const database: SearchDatabase = {
      $transaction: async (work, options) => {
        expect(options.maxWait).toBe(2000);
        time = 11999;
        return work({
          $queryRaw: async <T>() => {
            calls++;
            time = 12001;
            return [] as T;
          },
        });
      },
    };
    await expect(runSearchRead(database, async () => "partial")).rejects.toMatchObject({
      code: "SEARCH_UNAVAILABLE",
    });
    expect(calls).toBe(1);
  });
  it("restarts the entire transaction for at most three recognized serialization failures", async () => {
    let attempts = 0,
      works = 0;
    const database: SearchDatabase = {
      $transaction: async (work) => {
        attempts++;
        await work({ $queryRaw: async <T>() => [] as T });
        throw { code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "40001" } } } };
      },
    };
    await expect(
      runSearchRead(database, async () => {
        works++;
        return "uncommitted";
      }),
    ).rejects.toMatchObject({ code: "SEARCH_UNAVAILABLE" });
    expect(attempts).toBe(3);
    expect(works).toBe(3);
  });
  it("does not retry once overall time is spent, or retry arbitrary database errors", async () => {
    let time = 0,
      attempts = 0;
    vi.spyOn(performance, "now").mockImplementation(() => time);
    const database: SearchDatabase = {
      $transaction: async () => {
        attempts++;
        time = 12001;
        throw { code: "40001" };
      },
    };
    await expect(runSearchRead(database, async () => "partial")).rejects.toMatchObject({
      code: "SEARCH_UNAVAILABLE",
    });
    expect(attempts).toBe(1);
    expect(isReadDependencyFailure({ message: "57014 fake secret" })).toBe(false);
    await expect(
      runSearchRead(
        {
          $transaction: async () => {
            throw { message: "secret" };
          },
        },
        async () => "partial",
      ),
    ).rejects.toMatchObject({ code: "SEARCH_INVARIANT" });
  });
  it("checks remaining budget after SQL and before subsequent SQL", async () => {
    let time = 0,
      statements = 0;
    vi.spyOn(performance, "now").mockImplementation(() => time);
    const database: SearchDatabase = {
      $transaction: async (work) =>
        work({
          $queryRaw: async <T>(sql: Prisma.Sql) => {
            statements++;
            if (sql.text === "SELECT 1") time = 5001;
            return [] as T;
          },
        }),
    };
    await expect(
      runSearchRead(database, async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT 1`);
        return tx.$queryRaw(Prisma.sql`SELECT 2`);
      }),
    ).rejects.toMatchObject({ code: "SEARCH_UNAVAILABLE" });
    expect(statements).toBe(3);
  });
});
