import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = "acciento89-bot/sammlerraum";
export const requiredSteps = Object.freeze([
  "Lint workspace",
  "Build workspace",
  "Verify complete native V1 without skipped tests",
  "Verify scoped shared-search cookie privacy and responsive repair",
  "Verify compiled photo analysis confirmation in both languages and screen sizes",
  "Verify compiled billing in both languages and screen sizes with offline SDK transport",
  "Verify complete V1 permission matrix through actual cookie sessions",
  "Verify complete V1 collector flows in DE and EN on desktop and mobile",
  "Verify actual PostgreSQL17 database and media recovery",
  "Verify immutable production-like stack, real recovered app and non-destructive restart",
]);
export function validateGate(run, jobs, sha) {
  if (run.head_sha !== sha || run.status !== "completed" || run.conclusion !== "success")
    throw Error("Exact source CI is not successfully complete");
  const verify = jobs.find((job) => job.name === "verify");
  if (!verify || verify.status !== "completed" || verify.conclusion !== "success")
    throw Error("Required verify job did not succeed");
  for (const name of requiredSteps) {
    const step = verify.steps?.find((step) => step.name === name);
    if (!step || step.conclusion !== "success" || step.status !== "completed")
      throw Error("Mandatory release stage missing, failed or skipped");
  }
}
function cli(tool, args) {
  return execFileSync(tool, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 30000,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
const api = (path) => JSON.parse(cli("gh", ["api", `repos/${repo}/${path}`]));
async function main() {
  if (process.argv.includes("--help")) {
    console.log(
      "release-gate.sh [--run-id ID]: waits for complete exact committed source CI and all mandatory gates; never deploys or activates providers",
    );
    return;
  }
  const sha = cli("git", ["rev-parse", "HEAD"]);
  if (!/^[a-f0-9]{40}$/.test(sha) || cli("git", ["status", "--porcelain"]))
    throw Error("Commit and preserve all source/evidence changes before exact-source gate");
  let run;
  const index = process.argv.indexOf("--run-id");
  if (index >= 0) {
    const id = process.argv[index + 1];
    if (!/^[0-9]+$/.test(id ?? "")) throw Error("Valid explicit run ID required");
    run = api(`actions/runs/${id}`);
  } else {
    const candidates = api(
      `actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=20`,
    ).workflow_runs;
    run =
      candidates.find(
        (candidate) => candidate.head_sha === sha && candidate.status !== "completed",
      ) ?? candidates.find((candidate) => candidate.head_sha === sha);
    if (!run) {
      const branch = "work/sammlerraum-v1";
      if (api(`git/ref/heads/${branch}`).object.sha !== sha)
        throw Error("Current committed source must first be saved to the existing draft branch");
      cli("gh", [
        "workflow",
        "run",
        "ci.yml",
        "--repo",
        repo,
        "--ref",
        branch,
        "-f",
        `expected_sha=${sha}`,
      ]);
      for (let attempt = 0; attempt < 12 && !run; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        run = api(
          `actions/workflows/ci.yml/runs?head_sha=${sha}&event=workflow_dispatch&per_page=20`,
        ).workflow_runs.find((candidate) => candidate.head_sha === sha);
      }
    }
  }
  if (!run || run.head_sha !== sha) throw Error("No exact-source workflow run found");
  console.log(`Checking exact source ${sha.slice(0, 12)}; CI run ${run.id}`);
  const deadline = Date.now() + 6 * 60 * 60 * 1000;
  while (run.status !== "completed" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 15000));
    run = api(`actions/runs/${run.id}`);
    if (run.head_sha !== sha) throw Error("CI source changed");
  }
  const jobs = api(`actions/runs/${run.id}/jobs?per_page=100`).jobs;
  validateGate(run, jobs, sha);
  const directory = resolve(root, ".superpowers/sdd/2026-09-19-13-integration-hardening-release");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(
    resolve(directory, `release-gate-${sha}.json`),
    JSON.stringify(
      {
        source: sha,
        run: run.id,
        url: run.html_url,
        checkedAt: new Date().toISOString(),
        mandatoryStages: requiredSteps,
        conclusion: "success",
        scope: "Code/test/container gates only; no production/provider/SEO ownership claim",
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  console.log(
    "PASS: exact-source mandatory release gates. Production and provider authorization remain separate.",
  );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(() => {
    console.error("Release gate refused, failed or timed out; no deployment started");
    process.exitCode = 1;
  });
