import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
test("Lighthouse audits only owned loopback marketing paths with all four mandatory thresholds and no public upload", () => {
  const { ci } = require("../lighthouserc.cjs");
  assert.equal(ci.upload.target, "filesystem");
  assert.equal(ci.collect.numberOfRuns, 3);
  assert.deepEqual(
    ci.collect.url.map((value) => new URL(value).pathname),
    ["/de", "/en", "/de/funktionen", "/de/preise", "/de/sammeln/muenzen", "/en/collecting/coins"],
  );
  for (const value of ci.collect.url) {
    const u = new URL(value);
    assert.equal(u.origin, "http://localhost:3017");
    assert.equal(u.search, "");
    assert.equal(u.hash, "");
  }
  for (const [name, min] of [
    ["seo", 0.95],
    ["accessibility", 0.95],
    ["best-practices", 0.95],
    ["performance", 0.85],
  ]) {
    const [level, rule] = ci.assert.assertions["categories:" + name];
    assert.equal(level, "error");
    assert.equal(rule.minScore, min);
  }
  assert.match(ci.collect.startServerCommand, /start-seo-audit[.]mjs/u);
});
