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
    process.env.NODE_ENV = "production";
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
});
