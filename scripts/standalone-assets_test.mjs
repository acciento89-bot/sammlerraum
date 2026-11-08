import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureStandaloneAssets } from "./standalone-assets.mjs";
test("standalone audit serves exact public artwork and compiled static assets, reruns safely, rejects foreign target", async () => {
  const root = await mkdtemp(join(tmpdir(), "sammlerraum-assets-"));
  try {
    await mkdir(join(root, ".next/static"), { recursive: true });
    await mkdir(join(root, ".next/standalone/apps/web/.next"), { recursive: true });
    await mkdir(join(root, "public/art"), { recursive: true });
    await writeFile(join(root, "public/art/owned.webp"), "owned-art-bytes");
    await writeFile(join(root, ".next/static/compiled.js"), "compiled-code");
    await ensureStandaloneAssets(root);
    await ensureStandaloneAssets(root);
    assert.equal(
      await readFile(join(root, ".next/standalone/apps/web/public/art/owned.webp"), "utf8"),
      "owned-art-bytes",
    );
    assert.equal(
      await readFile(join(root, ".next/standalone/apps/web/.next/static/compiled.js"), "utf8"),
      "compiled-code",
    );
    await rm(join(root, ".next/standalone/apps/web/public"));
    await mkdir(join(root, ".next/standalone/apps/web/public"));
    await assert.rejects(ensureStandaloneAssets(root), /Unexpected standalone asset target/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
