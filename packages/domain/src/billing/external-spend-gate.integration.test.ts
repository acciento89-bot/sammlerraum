import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createLegacyMoneyTestSchema } from "@sammlerraum/db/test-legacy-money-schema";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";

describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")(
  "aggregate external-service spend fence",
  () => {
    const cleanups: (() => Promise<void>)[] = [];
    afterEach(async () => {
      for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    });
    async function fixture() {
      const path = "./external-spend-gate";
      const module = await import(path).catch(() => null);
      expect(module?.createExternalSpendGate, "actual persisted spend fence must exist").toBeTypeOf(
        "function",
      );
      const isolated = await createLegacyMoneyTestSchema();
      cleanups.push(() => isolated.cleanup());
      const db = createTestDatabaseClient({
        databaseUrl: isolated.databaseUrl,
        schema: isolated.schema,
      });
      cleanups.push(() => db.$disconnect());
      const make = (providerId = "openai", monthlyLimitCents = 25, fixedMonthlyCostCents = 5) =>
        module!.createExternalSpendGate(db, {
          providerId,
          monthlyLimitCents,
          fixedMonthlyCostCents,
          callReservationCents: 10,
        });
      return { db, make };
    }
    it("shares one monthly ceiling across providers and reserves fixed fees first", async () => {
      const { make } = await fixture();
      expect(await make("openai").reserve(randomUUID())).toBe(true);
      expect(await make("market").reserve(randomUUID())).toBe(true);
      expect(await make("openai").reserve(randomUUID())).toBe(false);
    });
    it("admits only the affordable number of concurrent outbound calls", async () => {
      const { make } = await fixture();
      const results = await Promise.all(
        Array.from({ length: 12 }, () => make().reserve(randomUUID())),
      );
      expect(results.filter(Boolean)).toHaveLength(2);
    });
    it("does not authorize a second HTTP attempt using the same reservation key", async () => {
      const { make } = await fixture(),
        key = randomUUID();
      expect(await make().reserve(key)).toBe(true);
      expect(await make().reserve(key)).toBe(false);
      expect(await make().reserve(randomUUID())).toBe(true);
      expect(await make().reserve(randomUUID())).toBe(false);
    });
    it("retains uncertain costs across restart and cannot raise the month's existing ceiling", async () => {
      const { make } = await fixture();
      expect(await make().reserve(randomUUID())).toBe(true);
      expect(await make("market", 2500, 0).reserve(randomUUID())).toBe(true);
      expect(await make("openai", 2500, 0).reserve(randomUUID())).toBe(false);
    });
    it("counts increased fixed fees and fails closed without an affordable call", async () => {
      const { make } = await fixture();
      expect(await make().reserve(randomUUID())).toBe(true);
      expect(await make("market", 25, 16).reserve(randomUUID())).toBe(false);
      expect(await make("openai", 25, 0).reserve(randomUUID())).toBe(false);
    });
    it("rejects an operator policy beyond the approved total or malformed call identity", async () => {
      const { make } = await fixture();
      expect(() => make("openai", 2501)).toThrow();
      await expect(make().reserve("private arbitrary content")).rejects.toThrow();
    });
  },
);
