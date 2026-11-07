import { createPrismaClient } from "./create-client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

type TestDatabaseOptions = {
  databaseUrl?: string;
  nodeEnv?: string;
  schema?: string;
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

  if (options.schema !== undefined) {
    const url = new URL(databaseUrl);
    if (
      !/^legacy_money_store_[0-9a-f_]+$/u.test(options.schema) ||
      url.searchParams.get("options") !== `-c search_path=${options.schema},pg_catalog`
    ) {
      throw new Error("Owned test schema must match the raw connection search path");
    }
    // Prisma's ORM namespace is independent of the raw pg search_path. Set both
    // explicitly for owned native fixtures; production client creation is unchanged.
    return new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }, { schema: options.schema }),
    });
  }

  return createPrismaClient(databaseUrl);
}
