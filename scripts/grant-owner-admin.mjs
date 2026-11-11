import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Operator-only command. No HTTP route may invoke this function. */
export async function grantOwnerAdmin(client, email) {
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
    throw new Error("A valid owner email is required");
  await client.query("BEGIN");
  try {
    const { rows } = await client.query(
      'SELECT id, "emailVerified" FROM "user" WHERE lower(email) = $1 FOR UPDATE',
      [normalized],
    );
    if (rows.length !== 1 || rows[0].emailVerified !== true)
      throw new Error("Exactly one existing verified owner account is required");
    await client.query(
      `INSERT INTO "ApplicationRoleGrant" ("userId", role, "grantedBy", reason)
       VALUES ($1, 'ADMIN', 'owner-authorized-operator', 'Owner requested private user administration on 2026-11-11')
       ON CONFLICT ("userId") DO UPDATE SET role = 'ADMIN', "grantedBy" = EXCLUDED."grantedBy", reason = EXCLUDED.reason, "grantedAt" = now()
       WHERE "ApplicationRoleGrant".role <> 'ADMIN'`,
      [rows[0].id],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const email = process.argv[2];
  if (!email || !process.env.DATABASE_URL) {
    console.error(
      "Usage: node scripts/grant-owner-admin.mjs OWNER_EMAIL (with private DATABASE_URL)",
    );
    process.exitCode = 1;
  } else {
    const require = createRequire(new URL("../packages/db/package.json", import.meta.url));
    const { Client } = require("pg");
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
      query_timeout: 10000,
    });
    client.on("error", () => {});
    try {
      await client.connect();
      await grantOwnerAdmin(client, email);
      console.log("Verified owner ADMIN grant persisted.");
    } catch {
      console.error(
        "Owner grant failed; no account was created. Check the verified identity and private database access.",
      );
      process.exitCode = 1;
    } finally {
      await client.end();
    }
  }
}
