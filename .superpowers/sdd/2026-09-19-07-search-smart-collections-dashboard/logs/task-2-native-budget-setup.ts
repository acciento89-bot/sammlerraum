import "../../../../vitest.setup";
import { expect } from "vitest";
import { createTestDatabaseClient } from "../../../../packages/db/src/test-database";

const supplied = process.env.SEARCH_BUDGET_DATABASE_URL;
if (!supplied) throw Error("Missing diagnostic database URL");
const parsed = new URL(supplied);
if (!['localhost','127.0.0.1','::1'].includes(parsed.hostname) || parsed.pathname !== '/sammlerraum_budget_20261018_test' || parsed.port !== '5432') throw Error("Diagnostic database URL rejected");
process.env.DATABASE_URL = supplied;
const client = createTestDatabaseClient();
try {
  const rows = await client.$queryRaw<Array<{ database: string; role: string }>>`SELECT current_database() AS database,current_user AS role`;
  if(rows.length!==1 || rows[0]?.database!=='sammlerraum_budget_20261018_test' || rows[0]?.role!=='test') throw Error("Diagnostic actual database identity rejected");
  console.info('BUDGET_DATABASE_IDENTITY',JSON.stringify({file:expect.getState().testPath,database:rows[0].database,role:rows[0].role}));
} finally { await client.$disconnect(); }
