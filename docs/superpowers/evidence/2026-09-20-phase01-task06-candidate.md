# Task 6 report — Docker Compose and CI

Status: **implementation candidate ready; task remains incomplete pending remote Docker/PostgreSQL CI and independent review.**

## Scope implemented

- Added production multi-stage `Dockerfile.web` and `Dockerfile.worker` using Node `24.19.0` and pnpm `10.17.1`.
- Both clean image builds run frozen installation and explicit Prisma generation with a fake build-only database URL. The web image builds Next standalone output; the worker image starts `dist/worker.cjs`.
- Added production Compose services for PostgreSQL 17, web, and worker; persistent `sammlerraum-db`; shared persistent `sammlerraum-uploads`; database, web, and worker healthchecks; no source bind mounts.
- Kept runtime application/database settings external to images and Compose source. No production credential is embedded.
- Added a secret/build-safe `.dockerignore` covering environment files, registry configuration, key/certificate material, secret directories, dependencies, and generated outputs.
- Added CI for pushes to `main` and `work/sammlerraum-v1`, and pull requests targeting `main`, matching Draft PR #1. CI installs frozen, generates Prisma, deploys migrations to PostgreSQL 17, runs test/lint/typecheck/build, runs live database-health and pg-boss singleton tests, verifies Compose, and builds both images.
- Added opt-in live integration tests for migrated Prisma health and pg-boss singleton reuse.
- Configured Next standalone output with the monorepo trace root.

## RED evidence

1. `bash scripts/verify-compose.sh` before Compose existed exited `127` because `docker` is unavailable. This is recorded in `task-6-compose-red.txt` as an environmental blocker and was **not** accepted as the behavioral RED.
2. Accepted behavioral RED: `CI=true corepack pnpm vitest run packages/testing/src/production-config.test.ts` failed 3/3 because `Dockerfile.web`, `docker-compose.yml`, and `.github/workflows/ci.yml` did not exist (`task-6-static-red.txt`).
3. Prisma clean-generation regression RED: the static test failed because the Dockerfiles invoked `prisma generate` without the fake URL required by `prisma.config.ts` (`task-6-prisma-generate-red.txt`).
4. Actual CI-trigger regression RED: the static test failed while the workflow still used `feature/**` instead of the active `work/sammlerraum-v1` to `main` flow (`task-6-ci-trigger-red.txt`).
5. Build-context secret regression RED: the static test failed because `.npmrc`, private-key patterns, and secret directories were not excluded (`task-6-dockerignore-red.txt`).

## GREEN evidence available locally

Fresh combined run is captured in `task-6-local-green.txt`:

- `CI=true corepack pnpm install --frozen-lockfile` — PASS with pnpm `10.17.1`; lockfile current.
- `CI=true corepack pnpm test` — PASS: 12 test files, 58 tests; the 2 PostgreSQL integration tests skipped because `RUN_DATABASE_INTEGRATION` was not enabled locally.
- `CI=true corepack pnpm lint` — PASS for all workspace packages/apps.
- `CI=true corepack pnpm typecheck` — PASS.
- `pnpm build` with documented fake build-only environment — PASS.
- Next standalone artifact exists at `apps/web/.next/standalone/apps/web/server.js`.
- Worker production artifact exists at `apps/worker/dist/worker.cjs`; a direct startup smoke reached controlled database startup failure rather than a missing bundle/runtime asset (`task-6-worker-bundle-smoke.txt`).
- `docker-compose.yml` and `.github/workflows/ci.yml` parse as YAML.
- `git diff --check` — PASS.
- Static production configuration test — PASS 3/3.

`corepack pnpm format` is not a required Task 6 gate and still reports the pre-existing `pnpm-workspace.yaml` formatting difference. Task 6 files pass the required package lint gate.

## Blockers requiring GitHub CI

Local evidence in `task-6-blockers.txt`:

- `docker` is not installed. `bash scripts/verify-compose.sh`, the web image build, and the worker image build each exit `127` (`docker: command not found`).
- `psql` is not installed and no PostgreSQL service is available. The real migration, database health, and pg-boss singleton integration gates cannot run locally.
- Required remote gates therefore remain: Compose rendering, `Dockerfile.web` build, `Dockerfile.worker` build, migration deploy against PostgreSQL 17, real health integration, and real pg-boss singleton integration.
- An independent review is still required after those remote results. Do not mark Task 6 complete before both CI and review pass.

## Handoff

No local commit or remote mutation was made by the implementer. The controller should refresh the staged snapshot, create the candidate checkpoint on `work/sammlerraum-v1`, let Draft PR #1 run CI, and return CI/review findings for any required RED→GREEN fix.

## Independent-review fix pass

The first independent review requested three Important fixes. All three were reproduced together in `task-6-review-fix-red.txt`: 3 focused tests failed for upload-path coherence, worker health-port coherence, and the public Next origin build contract.

- Compose now sets `UPLOADS_DIR: /data/uploads` for both web and worker, exactly matching both shared-volume mount targets. `.env.example` identifies its uploads value as the local-process path and documents the fixed Compose container path.
- Compose now fixes `WORKER_HEALTH_PORT` to `3001`, matching the worker health probe URL.
- `Dockerfile.web` now requires `NEXT_PUBLIC_APP_ORIGIN` as a build argument, rejects an empty value, and uses it during `next build`. Compose passes the deployment value through `build.args` and no longer presents the inlined public value as mutable runtime environment.
- CI uses the deliberate non-production build value `https://example.invalid`, passes it to the web Docker build, and runs the workspace build step with `NODE_ENV: production`.

Focused verification after the fixes:

- `CI=true corepack pnpm vitest run packages/testing/src/production-config.test.ts` — PASS, 5/5.
- `CI=true corepack pnpm lint` — PASS.
- `CI=true corepack pnpm typecheck` — PASS.
- `NODE_ENV=production ... corepack pnpm build` with fake build-only values — PASS.
- Compose and workflow YAML parse — PASS.
- `git diff --check` — PASS.

The combined affected-gate output is in `task-6-review-fix-green.txt`. Docker/PostgreSQL blockers and the requirement for a clean follow-up review plus GitHub CI remain unchanged.


# Task 6 review

## Verdict

**APPROVED AS A CODE CANDIDATE, CONDITIONAL ON THE REMAINING REMOTE GATES.** No blocking or non-blocking code findings remain in the reviewed scope. Task 6 is not complete until GitHub CI validates Docker and PostgreSQL behavior.

## Review-fix assessment

The three findings from the first review are resolved:

- `docker-compose.yml:32,37,63,67` now fixes both applications' `UPLOADS_DIR` at `/data/uploads`, exactly matching the shared named-volume mount. `.env.example:3` clarifies that its different path applies to a local process rather than a Compose container.
- `docker-compose.yml:65,74` now fixes both the worker listener and health probe at internal port 3001, eliminating the configurable-port mismatch.
- `Dockerfile.web:8,13,16` now requires a non-empty `NEXT_PUBLIC_APP_ORIGIN` build argument and supplies it to `next build`. `docker-compose.yml:22-23` wires the deployment value into the image build and no longer presents that inlined value as mutable runtime configuration. `.github/workflows/ci.yml:63` supplies the deliberate non-production `https://example.invalid` value for the clean CI image build.

`packages/testing/src/production-config.test.ts:35-71` covers all three regressions directly, including exact upload-path alignment, fixed worker-port alignment, the required web build argument, removal of the hardcoded loopback origin, Compose build-argument wiring, and the explicit CI value.

## Spec and quality assessment

- **Clean-image Prisma generation:** Pass by inspection. Both Dockerfiles install from the frozen lockfile and provide the build-only datasource required by `packages/db/prisma.config.ts` before generation.
- **Next standalone runtime:** Pass by inspection and supplied artifact evidence. The runtime copies the standalone tree and `.next/static` into the paths expected by `apps/web/server.js`; the application has no `public` tree requiring another copy.
- **Worker CJS runtime:** Pass for the available local scope. The generated bundle contains the Prisma client and WASM payload, and the supplied smoke reaches controlled database startup failure rather than a missing module or runtime asset.
- **Secrets and mounts:** Pass. No production credential or source bind mount is embedded. `.dockerignore` excludes environment, registry, key/certificate, secret-directory, dependency, and generated-output material. PostgreSQL and actual application uploads use persistent named volumes.
- **CI workflow:** Pass by inspection. Push and pull-request branches match the active repository flow. Service credentials, workflow `DATABASE_URL`, and the Vitest setup URL agree. Migrations precede opt-in live integration tests. The workspace production build overrides the job-level test environment with `NODE_ENV: production`, and both clean image builds remain explicit gates.

## Verification status

Fresh rereview verification passed: `CI=true corepack pnpm vitest run packages/testing/src/production-config.test.ts` reports 1 file and 5/5 tests passing, and `git diff --cached --check` exits 0. I did not repeat broad suites.

Docker and PostgreSQL remain unavailable locally. Compose rendering under Docker, both clean image builds, migration deployment, live database health, live pg-boss singleton behavior, and container startup/health remain **pending GitHub CI validation**. That pending live validation is not a code defect, but this approval must not be treated as a completed Task 6 claim.


## Final gate completion

# Task 6 review

## Verdict

**APPROVED.** No blocking or non-blocking findings remain in the reviewed scope, and all required local and remote gates have now passed for reviewed commit `79b0f55`.

## Review-fix assessment

The three findings from the first review are resolved:

- `docker-compose.yml:32,37,63,67` now fixes both applications' `UPLOADS_DIR` at `/data/uploads`, exactly matching the shared named-volume mount. `.env.example:3` clarifies that its different path applies to a local process rather than a Compose container.
- `docker-compose.yml:65,74` now fixes both the worker listener and health probe at internal port 3001, eliminating the configurable-port mismatch.
- `Dockerfile.web:8,13,16` now requires a non-empty `NEXT_PUBLIC_APP_ORIGIN` build argument and supplies it to `next build`. `docker-compose.yml:22-23` wires the deployment value into the image build and no longer presents that inlined value as mutable runtime configuration. `.github/workflows/ci.yml:63` supplies the deliberate non-production `https://example.invalid` value for the clean CI image build.

`packages/testing/src/production-config.test.ts:35-71` covers all three regressions directly, including exact upload-path alignment, fixed worker-port alignment, the required web build argument, removal of the hardcoded loopback origin, Compose build-argument wiring, and the explicit CI value.

## Spec and quality assessment

- **Clean-image Prisma generation:** Pass by inspection. Both Dockerfiles install from the frozen lockfile and provide the build-only datasource required by `packages/db/prisma.config.ts` before generation.
- **Next standalone runtime:** Pass by inspection and supplied artifact evidence. The runtime copies the standalone tree and `.next/static` into the paths expected by `apps/web/server.js`; the application has no `public` tree requiring another copy.
- **Worker CJS runtime:** Pass for the available local scope. The generated bundle contains the Prisma client and WASM payload, and the supplied smoke reaches controlled database startup failure rather than a missing module or runtime asset.
- **Secrets and mounts:** Pass. No production credential or source bind mount is embedded. `.dockerignore` excludes environment, registry, key/certificate, secret-directory, dependency, and generated-output material. PostgreSQL and actual application uploads use persistent named volumes.
- **CI workflow:** Pass by inspection. Push and pull-request branches match the active repository flow. Service credentials, workflow `DATABASE_URL`, and the Vitest setup URL agree. Migrations precede opt-in live integration tests. The workspace production build overrides the job-level test environment with `NODE_ENV: production`, and both clean image builds remain explicit gates.

## Verification status

Fresh rereview verification passed: `CI=true corepack pnpm vitest run packages/testing/src/production-config.test.ts` reports 1 file and 5/5 tests passing, and `git diff --cached --check` exits 0. I did not repeat broad suites.

GitHub Actions run [35515621740](https://github.com/acciento89-bot/sammlerraum/actions/runs/35515621740), job `106090953281`, completed successfully for reviewed commit `79b0f55`. Its successful steps covered the frozen install, Prisma generation, PostgreSQL 17 migration deployment, full test/lint/typecheck/production-build sequence, live database-health and pg-boss singleton integration tests, Compose verification, and both clean Docker image builds. The remote run used the same reviewed code, so all Task 6 gates are satisfied.

CI logs confirmed60 unit/static tests +2 live database/queue tests. Phase01 complete.
