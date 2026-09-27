import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

const runIntegration = process.env.RUN_DATABASE_INTEGRATION === "1";
const migrations = new URL("../prisma/migrations/", import.meta.url);

// Replay the published pre-media state in its own schema so we exercise the
// upgrade against a real dangling avatar UUID, without changing the CI DB.
describe.runIf(runIntegration)("media migration upgrade", () => {
  it("clears only legacy unsupported avatar pointers before enforcing the owned FK", async () => {
    const schema = `media_upgrade_${randomUUID().replaceAll("-", "_")}`;
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query("BEGIN");
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      const names = (await readdir(migrations)).filter((entry) => /^\d+_/.test(entry)).sort();
      const mediaMigration = "20260927140000_media_documents";
      expect(names).toContain(mediaMigration);
      for (const name of names) {
        if (name === mediaMigration) break;
        await client.query(await readFile(new URL(`${name}/migration.sql`, migrations), "utf8"));
      }
      const userId = randomUUID();
      const legacyId = randomUUID();
      await client.query(
        'INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt") VALUES ($1, $2, $3, false, now(), now())',
        [userId, "Legacy", `${userId}@example.test`],
      );
      await client.query(
        'INSERT INTO "UserProfile" ("userId", "handle", "displayName", "bio", "avatarAssetId", "updatedAt") VALUES ($1, $2, $3, $4, $5, now())',
        [userId, "legacy", "Preserved", "Bio stays", legacyId],
      );
      await client.query(
        await readFile(new URL(`${mediaMigration}/migration.sql`, migrations), "utf8"),
      );
      const result = await client.query(
        'SELECT "handle", "displayName", "bio", "avatarAssetId" FROM "UserProfile" WHERE "userId" = $1',
        [userId],
      );
      expect(result.rows[0]).toEqual({
        handle: "legacy",
        displayName: "Preserved",
        bio: "Bio stays",
        avatarAssetId: null,
      });
      await expect(
        client.query('UPDATE "UserProfile" SET "avatarAssetId" = $1 WHERE "userId" = $2', [
          legacyId,
          userId,
        ]),
      ).rejects.toMatchObject({ code: "23503" });
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
});
