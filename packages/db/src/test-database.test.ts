import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
  vi.resetModules();
});

describe("createTestDatabaseClient", () => {
  it("imports without loading the production environment", async () => {
    delete process.env.APP_ORIGIN;
    delete process.env.DATABASE_URL;
    delete process.env.UPLOADS_DIR;
    vi.resetModules();

    const module = await import("@sammlerraum/db/test-database");

    expect(module.createTestDatabaseClient).toBeTypeOf("function");
  });

  it("rejects production mode", async () => {
    const { createTestDatabaseClient } = await import("@sammlerraum/db/test-database");

    expect(() =>
      createTestDatabaseClient({
        databaseUrl: "postgresql://test:test@localhost:5432/sammlerraum_test",
        nodeEnv: "production",
      }),
    ).toThrow(/production/i);
  });

  it("rejects an actual production process despite a test override", async () => {
    Object.assign(process.env, { NODE_ENV: "production" });
    const { createTestDatabaseClient } = await import("@sammlerraum/db/test-database");

    expect(() =>
      createTestDatabaseClient({
        databaseUrl: "postgresql://test:test@localhost:5432/sammlerraum_test",
        nodeEnv: "test",
      }),
    ).toThrow(/production/i);
  });

  it("rejects a database without a test name", async () => {
    const { createTestDatabaseClient } = await import("@sammlerraum/db/test-database");

    expect(() =>
      createTestDatabaseClient({
        databaseUrl: "postgresql://test:test@localhost:5432/sammlerraum",
        nodeEnv: "test",
      }),
    ).toThrow(/test database/i);
  });
  it("rejects an isolated schema that does not match the raw connection search path", async () => {
    const { createTestDatabaseClient } = await import("@sammlerraum/db/test-database");
    expect(() =>
      createTestDatabaseClient({
        databaseUrl: "postgresql://test:test@localhost:5432/sammlerraum_test",
        schema: "legacy_money_store_1234_abcd",
      }),
    ).toThrow(/schema/i);
  });
  it("never accepts public or an arbitrary schema as an isolated native fixture", async () => {
    const { createTestDatabaseClient } = await import("@sammlerraum/db/test-database");
    expect(() =>
      createTestDatabaseClient({
        databaseUrl:
          "postgresql://test:test@localhost:5432/sammlerraum_test?options=-c%20search_path%3Dpublic%2Cpg_catalog",
        schema: "public",
      }),
    ).toThrow(/schema/i);
  });
});

describe.runIf(process.env.RUN_DATABASE_INTEGRATION === "1")("isolated native ORM schema", () => {
  it("reads the same owned test schema through ORM and raw SQL", async () => {
    const { randomUUID } = await import("node:crypto");
    const { createLegacyMoneyTestSchema } = await import("./testing/legacy-money-schema");
    const { createTestDatabaseClient } = await import("@sammlerraum/db/test-database");
    const isolated = await createLegacyMoneyTestSchema();
    const db = createTestDatabaseClient({
      databaseUrl: isolated.databaseUrl,
      schema: isolated.schema,
    });
    try {
      const id = randomUUID();
      await db.$queryRaw`INSERT INTO "user" (id,name,email,"emailVerified","createdAt","updatedAt") VALUES (${id},'Isolated synthetic ORM',${`${id}@example.invalid`},false,now(),now()) RETURNING id`;
      expect(await db.user.findUnique({ where: { id }, select: { id: true, name: true } })).toEqual(
        { id, name: "Isolated synthetic ORM" },
      );
      expect(await db.$queryRaw`SELECT id FROM public."user" WHERE id=${id}`).toEqual([]);
    } finally {
      await db.$disconnect();
      await isolated.cleanup();
    }
  });
});
