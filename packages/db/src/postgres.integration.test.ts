import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "./create-client";
import { checkDatabaseHealth } from "./health";

const runIntegration = process.env.RUN_DATABASE_INTEGRATION === "1";
const databaseUrl = process.env.DATABASE_URL ?? "";
const prisma = runIntegration ? createPrismaClient(databaseUrl) : undefined;

describe.runIf(runIntegration)("PostgreSQL integration", () => {
  beforeAll(async () => {
    await prisma?.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("reports a migrated PostgreSQL database as healthy", async () => {
    await expect(checkDatabaseHealth(prisma!)).resolves.toEqual({ ok: true });
    await expect(prisma!.systemMetadata.count()).resolves.toBeGreaterThanOrEqual(0);
  });
});
