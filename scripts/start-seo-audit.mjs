import { spawn } from "node:child_process";
import { ensureStandaloneAssets } from "./standalone-assets.mjs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  web = resolve(root, "apps/web");
const database = new URL(process.env.DATABASE_URL ?? "");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) ||
  !decodeURIComponent(database.pathname).endsWith("_test")
)
  throw Error("SEO audit requires an owned loopback test database configuration");
await ensureStandaloneAssets(web);
const child = spawn(process.execPath, [resolve(web, ".next/standalone/apps/web/server.js")], {
  cwd: web,
  env: {
    ...process.env,
    NODE_ENV: "production",
    HOSTNAME: "localhost",
    PORT: "3017",
    APP_ORIGIN: "http://localhost:3017",
    BILLING_ENABLED: "false",
    AI_ANALYSIS_ENABLED: "false",
  },
  stdio: "inherit",
});
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    stopping = true;
    child.kill(signal);
  });
child.on("error", () => {
  process.exitCode = 1;
});
child.on("exit", (code) => process.exit(stopping ? 0 : (code ?? 1)));
const deadline = Date.now() + 45000;
while (Date.now() < deadline) {
  try {
    const response = await fetch("http://localhost:3017/de", {
      signal: AbortSignal.timeout(2000),
      redirect: "error",
    });
    await response.arrayBuffer();
    if (response.status === 200) {
      console.log("SEO_AUDIT_READY");
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 250));
}
if (Date.now() >= deadline) {
  child.kill("SIGTERM");
  throw Error("SEO audit server did not become ready");
}
