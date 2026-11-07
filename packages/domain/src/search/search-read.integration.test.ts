import { afterAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@sammlerraum/db/create-client";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { Prisma } from "@sammlerraum/db/search-sql";
import { runSearchRead, type SearchDatabase } from "./search-read";
import { errorCode, isReadDependencyFailure } from "../api/read-dependency-errors";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
afterAll(async () => db?.$disconnect());
describe.runIf(enabled)("native search transaction dependency behavior", () => {
  it("configures actual RepeatableRead/UTC/statement/lock/transaction budgets", async () => {
    const rows = await runSearchRead(db!, (tx) =>
      tx.$queryRaw<
        {
          isolation: string;
          timezone: string;
          statement: string;
          lock: string;
          transaction: string;
        }[]
      >(
        Prisma.sql`SELECT current_setting('transaction_isolation') AS isolation,current_setting('TimeZone') AS timezone,current_setting('statement_timeout') AS statement,current_setting('lock_timeout') AS lock,current_setting('transaction_timeout') AS transaction`,
      ),
    );
    expect(rows[0]).toMatchObject({
      isolation: "repeatable read",
      timezone: "UTC",
      statement: "2s",
      lock: "500ms",
    });
    expect(rows[0]!.transaction).toMatch(/^(?:[1-4][0-9]{3}ms|5s)$/u);
  });
  it("settles a real statement timeout and maps captured installed-driver error", async () => {
    let captured: unknown;
    const wrapped: SearchDatabase = {
      $transaction: (work, options) =>
        db!.$transaction(
          (tx) =>
            work({
              $queryRaw: async <T>(sql: Prisma.Sql) => {
                try {
                  return await tx.$queryRaw<T>(sql);
                } catch (error) {
                  captured = error;
                  throw error;
                }
              },
            }),
          options,
        ),
    };
    const start = performance.now();
    await expect(
      runSearchRead(wrapped, (tx) => tx.$queryRaw(Prisma.sql`SELECT pg_sleep(3)`)),
    ).rejects.toMatchObject({ code: "SEARCH_UNAVAILABLE" });
    expect(performance.now() - start).toBeLessThan(5000);
    expect(errorCode(captured)).toBe("57014");
    expect(isReadDependencyFailure(captured)).toBe(true);
    console.info(
      "native search timeout mapping",
      JSON.stringify({
        outerCode: (captured as { code: string }).code,
        recognizedCode: errorCode(captured),
      }),
    );
  }, 7000);
  it("recognizes real serialization errors and retries exactly three transactions", async () => {
    let attempts = 0,
      captured: unknown;
    const wrapped: SearchDatabase = {
      $transaction: async (work, options) => {
        attempts++;
        return db!.$transaction(async (tx) => {
          try {
            return await work(tx);
          } catch (error) {
            captured = error;
            throw error;
          }
        }, options);
      },
    };
    await expect(
      runSearchRead(wrapped, (tx) =>
        tx.$queryRaw(
          Prisma.sql`DO $$ BEGIN RAISE EXCEPTION 'synthetic search serialization' USING ERRCODE='40001'; END $$`,
        ),
      ),
    ).rejects.toMatchObject({ code: "SEARCH_UNAVAILABLE" });
    expect(attempts).toBe(3);
    expect(errorCode(captured)).toBe("40001");
    console.info(
      "native search serialization mapping",
      JSON.stringify({
        outerCode: (captured as { code: string }).code,
        recognizedCode: errorCode(captured),
        attempts,
      }),
    );
  });
  it("maps actual lock timeout without returning a partial result", async () => {
    let release!: () => void, locked!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve)),
      ready = new Promise<void>((resolve) => (locked = resolve));
    const locker = db!.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(780714)::text`;
        locked();
        await held;
      },
      { timeout: 5000 },
    );
    await ready;
    try {
      await expect(
        runSearchRead(db!, (tx) =>
          tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(780714)::text`),
        ),
      ).rejects.toMatchObject({ code: "SEARCH_UNAVAILABLE" });
    } finally {
      release();
      await locker;
    }
  });
  it("bounds real exhausted pool acquisition and closes the installed driver failure", async () => {
    const pool = createPrismaClient(process.env.DATABASE_URL!, { bounded: true });
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let acquired = 0,
      ready!: () => void;
    const allReady = new Promise<void>((resolve) => (ready = resolve));
    const lockers = Array.from({ length: 10 }, () =>
      pool.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT 1`;
          if (++acquired === 10) ready();
          await held;
        },
        { maxWait: 2000, timeout: 10000 },
      ),
    );
    await allReady;
    let captured: unknown;
    const wrapped: SearchDatabase = {
      $transaction: async (work, options) => {
        try {
          return await pool.$transaction(work, options);
        } catch (error) {
          captured = error;
          throw error;
        }
      },
    };
    const start = performance.now();
    try {
      await expect(
        runSearchRead(wrapped, (tx) => tx.$queryRaw(Prisma.sql`SELECT 1`)),
      ).rejects.toMatchObject({ code: "SEARCH_UNAVAILABLE" });
      expect(performance.now() - start).toBeLessThan(5000);
      expect(isReadDependencyFailure(captured)).toBe(true);
      console.info(
        "native search pool mapping",
        JSON.stringify({
          outerCode: (captured as { code?: string }).code,
          recognizedCode: errorCode(captured),
        }),
      );
    } finally {
      release();
      await Promise.all(lockers);
      await pool.$disconnect();
    }
  }, 10000);
});
