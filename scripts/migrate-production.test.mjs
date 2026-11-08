import { test } from "node:test";
import assert from "node:assert/strict";
import { migrationPreconditions } from "./migrate-production.mjs";
const scratch = {
  DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/owned_test",
  MIGRATION_MODE: "scratch",
  SAMMLERRAUM_MIGRATION_APPROVED_SHA: "a".repeat(40),
};
test("migration requires exact reviewed source, isolated scratch target or production recovery receipt", () => {
  assert.doesNotThrow(() => migrationPreconditions(scratch));
  for (const patch of [
    { SAMMLERRAUM_MIGRATION_APPROVED_SHA: "main" },
    { DATABASE_URL: "postgresql://test:test@db/production" },
    { MIGRATION_MODE: "production" },
  ]) {
    assert.throws(() => migrationPreconditions({ ...scratch, ...patch }));
  }
  assert.doesNotThrow(() =>
    migrationPreconditions({
      ...scratch,
      MIGRATION_MODE: "production",
      SAMMLERRAUM_BACKUP_MANIFEST_SHA256: "b".repeat(64),
    }),
  );
});

test("resolves the installed executable from Prisma's bin manifest rather than its non-executable package main", async () => {
  const { resolvePrismaCLI } = await import("./migrate-production.mjs");
  assert.equal(typeof resolvePrismaCLI, "function");
  const { existsSync } = await import("node:fs");
  assert.equal(existsSync(resolvePrismaCLI()), true);
  assert.match(resolvePrismaCLI(), /[/\\]build[/\\]index[.]js$/u);
});
