import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@sammlerraum/db/search-sql";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { runTransferTransaction } from "../collaboration/transfer-transaction";
import { runSearchRead } from "./search-read";
import { scopedReadBudgetDatabase } from "./scoped-read-budget";

describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "one scoped operation deadline across canonical preflight and read",
  () => {
    let db: ReturnType<typeof createTestDatabaseClient>;
    let isolated: Awaited<ReturnType<typeof createLegacyMoneyTestSchema>>;
    beforeAll(async () => {
      isolated = await createLegacyMoneyTestSchema();
      db = createTestDatabaseClient({ databaseUrl: isolated.databaseUrl, schema: isolated.schema });
    });
    afterAll(async () => {
      await db?.$disconnect();
      await isolated?.cleanup();
    });
    it("does not reset its outer deadline when a second real transaction begins", async () => {
      await db.$queryRaw(Prisma.sql`SELECT 1 AS warm_pool`);
      const bounded = scopedReadBudgetDatabase(db, 500),
        start = performance.now();
      await runTransferTransaction(bounded, async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT 1 AS ready FROM pg_sleep(0.3)`);
      });
      await expect(
        runSearchRead(bounded, async (tx) => {
          await tx.$queryRaw(Prisma.sql`SELECT 1 AS ready FROM pg_sleep(0.3)`);
          return "must not succeed";
        }),
      ).rejects.toMatchObject({ code: "MEMBERSHIP_UNAVAILABLE" });
      expect(performance.now() - start).toBeLessThan(1500);
    });
    it("can never create a larger budget than the production twelve-second maximum", () => {
      expect(() => scopedReadBudgetDatabase(db, 12001)).toThrow();
      expect(() => scopedReadBudgetDatabase(db, 0)).toThrow();
    });
  },
);
