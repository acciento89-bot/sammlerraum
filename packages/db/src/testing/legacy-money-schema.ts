import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Client } from "pg";
/** Isolated native money fixture only; never production or a caller-selected schema. */
export async function createLegacyMoneyTestSchema(
  beforeMoneyMigration?: (client: Client) => Promise<void>,
) {
  if (process.env.NODE_ENV === "production") throw Error("Test schema forbidden in production");
  const base = process.env.DATABASE_URL;
  if (!base || !decodeURIComponent(new URL(base).pathname.slice(1)).endsWith("_test"))
    throw Error("Test database required");
  const schema = `legacy_money_store_${randomUUID().replaceAll("-", "_")}`;
  const client = new Client({ connectionString: base });
  await client.connect();
  try {
    const guard = (
      await client.query(
        "SELECT current_database() AS name,current_setting('server_version') AS version",
      )
    ).rows[0];
    if (!String(guard.name).endsWith("_test") || !String(guard.version).startsWith("17.11"))
      throw Error("Guarded PostgreSQL17.11 required");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query("BEGIN");
    await client.query(`SET LOCAL search_path TO "${schema}",pg_catalog`);
    const migrations = new URL("../../prisma/migrations/", import.meta.url);
    for (const name of (await readdir(migrations)).filter((n) => /^\d+_/.test(n)).sort()) {
      if (name === "20261106004500_legacy_money_provenance") await beforeMoneyMigration?.(client);
      await client.query(await readFile(new URL(`${name}/migration.sql`, migrations), "utf8"));
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    throw error;
  } finally {
    await client.end();
  }
  const url = new URL(base);
  url.searchParams.set("options", `-c search_path=${schema},pg_catalog`);
  return {
    schema,
    databaseUrl: url.toString(),
    async cleanup() {
      const own = new Client({ connectionString: base });
      await own.connect();
      try {
        await own.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await own.end();
      }
    },
  };
}
