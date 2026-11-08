import { test } from "node:test";
import assert from "node:assert/strict";
import { requiredSteps, validateGate } from "./release-gate.mjs";
const sha = "a".repeat(40),
  run = { head_sha: sha, status: "completed", conclusion: "success" };
const job = () => ({
  name: "verify",
  status: "completed",
  conclusion: "success",
  steps: requiredSteps.map((name) => ({ name, status: "completed", conclusion: "success" })),
});
test("accepts only exact successful source and every executed mandatory stage", () => {
  assert.doesNotThrow(() => validateGate(run, [job()], sha));
  for (const patch of [
    { head_sha: "b".repeat(40) },
    { status: "in_progress" },
    { conclusion: "failure" },
  ])
    assert.throws(() => validateGate({ ...run, ...patch }, [job()], sha));
  for (const conclusion of ["skipped", "failure", null]) {
    const j = job();
    j.steps[0].conclusion = conclusion;
    assert.throws(() => validateGate(run, [j], sha));
  }
  const j = job();
  j.steps.pop();
  assert.throws(() => validateGate(run, [j], sha));
  assert.throws(() => validateGate(run, [], sha));
});
