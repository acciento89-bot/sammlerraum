import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "packages/db/package.json"));

export function resolvePrismaCLI() {
  const manifestPath = require.resolve("prisma/package.json");
  const manifest = require(manifestPath);
  const binary = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.prisma;
  if (typeof binary !== "string") throw new Error("Installed Prisma executable manifest missing");
  const executable = resolve(dirname(manifestPath), binary);
  if (!existsSync(executable)) throw new Error("Installed Prisma executable unavailable");
  return executable;
}

export function migrationPreconditions(env) {
  let database;
  try {
    database = new URL(env.DATABASE_URL);
  } catch {
    throw Error("Database configuration required");
  }
  if (!["postgres:", "postgresql:"].includes(database.protocol) || !database.hostname)
    throw Error("PostgreSQL configuration required");
  if (!/^[a-f0-9]{40}$/.test(env.SAMMLERRAUM_MIGRATION_APPROVED_SHA ?? ""))
    throw Error("Reviewed immutable source commit required");
  if (env.MIGRATION_MODE === "scratch") {
    if (!decodeURIComponent(database.pathname).endsWith("_test"))
      throw Error("Scratch database required");
  } else if (
    env.MIGRATION_MODE !== "production" ||
    !/^[a-f0-9]{64}$/.test(env.SAMMLERRAUM_BACKUP_MANIFEST_SHA256 ?? "")
  ) {
    throw Error("Explicit production mode and verified backup manifest digest required");
  }
}

async function migrate() {
  migrationPreconditions(process.env);
  const executable = resolvePrismaCLI();
  const { Client } = require("pg");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    query_timeout: 10000,
  });
  client.on("error", () => {});
  try {
    await client.connect();
    await client.query(
      "SELECT pg_advisory_lock(hashtextextended('sammlerraum-production-migration',0))",
    );
    // A separate, held session lock serializes deployment attempts. Prisma retains its own migration lock.
    const result = await new Promise((resolveResult, reject) => {
      const child = spawn(process.execPath, [executable, "migrate", "deploy"], {
        cwd: resolve(root, "packages/db"),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      // Consume without publishing Prisma connection diagnostics or any runtime secrets.
      child.stdout.resume();
      child.stderr.resume();
      let expired = false;
      const timer = setTimeout(() => {
        expired = true;
        child.kill("SIGTERM");
      }, 600000);
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolveResult(!expired && code === 0);
      });
    });
    if (!result) throw Error("Migration failed");
    console.log("Frozen database migrations completed for approved source");
  } finally {
    await client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrate().catch(() => {
    console.error("Migration refused or failed; keep application rollout stopped");
    process.exitCode = 1;
  });
}
