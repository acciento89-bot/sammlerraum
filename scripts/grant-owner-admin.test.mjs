import { test } from "node:test";
import assert from "node:assert/strict";
import { grantOwnerAdmin } from "./grant-owner-admin.mjs";

function fake(rows) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: sql.startsWith("SELECT") ? rows : [] };
    },
  };
}
test("refuses missing, ambiguous, and unverified identities without granting access", async () => {
  for (const rows of [
    [],
    [{ id: "a", emailVerified: false }],
    [
      { id: "a", emailVerified: true },
      { id: "b", emailVerified: true },
    ],
  ]) {
    const client = fake(rows);
    await assert.rejects(() => grantOwnerAdmin(client, "owner@example.test"));
    assert.equal(
      client.calls.some((c) => c.sql.includes("INSERT")),
      false,
    );
    assert.equal(client.calls.at(-1).sql, "ROLLBACK");
  }
});
test("locks verified identity and grants exactly that account with parameterized SQL", async () => {
  const client = fake([{ id: "owner-id", emailVerified: true }]);
  await grantOwnerAdmin(client, "OWNER@example.test");
  assert.match(client.calls.find((c) => c.sql.startsWith("SELECT")).sql, /FOR UPDATE/);
  assert.deepEqual(client.calls.find((c) => c.sql.startsWith("SELECT")).params, [
    "owner@example.test",
  ]);
  const insert = client.calls.find((c) => c.sql.includes("INSERT"));
  assert.equal(insert.params[0], "owner-id");
  assert.match(insert.sql, /ON CONFLICT/);
  assert.equal(client.calls.at(-1).sql, "COMMIT");
});
