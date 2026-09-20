import { createPrismaClient } from "./create-client";

type TestDatabaseOptions = {
  databaseUrl?: string;
  nodeEnv?: string;
};

export function createTestDatabaseClient(options: TestDatabaseOptions = {}) {
  if (process.env.NODE_ENV === "production" || options.nodeEnv === "production") {
    throw new Error("Test database clients cannot be created in production");
  }

  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to create a test database client");
  }

  const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
  if (!databaseName.endsWith("_test")) {
    throw new Error("Refusing to connect: DATABASE_URL must name a test database");
  }

  return createPrismaClient(databaseUrl);
}
