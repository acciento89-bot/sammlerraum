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
