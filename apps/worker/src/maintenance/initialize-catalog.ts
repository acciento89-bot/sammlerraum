import { createPrismaClient } from "@sammlerraum/db/create-client";
import { initializeCatalogDefinitions } from "@sammlerraum/domain/catalog/initialize-catalog";
async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply") || args.length > 1)
    throw new Error("Usage: catalog:init [--apply]. Default: dry-run. No startup invocation.");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for this explicit operator action");
  const db = createPrismaClient(databaseUrl);
  try {
    const result = await initializeCatalogDefinitions(db, { apply: args.includes("--apply") });
    process.stdout.write(
      `${result.applied ? "Applied atomically" : "Dry-run: no definitions written"}\n`,
    );
    for (const action of result.actions) process.stdout.write(`${action.key}: ${action.action}\n`);
  } finally {
    await db.$disconnect();
  }
}
void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Initializer failed"}\n`);
  process.exitCode = 1;
});
