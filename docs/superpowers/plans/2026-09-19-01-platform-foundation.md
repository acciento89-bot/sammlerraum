# Platform Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Create the production-grade Sammlerraum workspace, web/worker processes, PostgreSQL foundation, shared contracts/config, i18n shell, queue abstraction, Docker setup, and CI.

**Architecture:** Use a pnpm workspace with `apps/web`, `apps/worker`, and shared packages. Prisma owns the PostgreSQL connection and migrations. The web and worker are separate runtime processes but consume the same domain/config/database packages.

**Tech Stack:** Node.js 24 LTS, pnpm 10, Next.js 16, React 19, TypeScript, Prisma 7, PostgreSQL 17, Zod, pg-boss, next-intl, Vitest, Playwright, Docker Compose, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-19-sammlerraum-design.md`

## Global Constraints

- DE and EN exist from the first render.
- PostgreSQL is the source of truth and initial queue backend.
- Web and worker must each expose a health signal.
- Production data lives in persistent volumes.
- No business logic is introduced in this plan beyond health/config/queue primitives.

## Review Focus

1. Missing or malformed environment variables fail at startup with a controlled configuration error.
2. German and English routes render the same shell without hard-coded locale assumptions.
3. Database loss/unavailability makes health degraded rather than falsely healthy.
4. Queue retries do not require a second infrastructure service.
5. Docker rebuild/redeploy leaves PostgreSQL and upload volumes intact.

---

### Task 1: Scaffold the workspace and test harness

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.nvmrc`
- Create: `tsconfig.base.json`
- Create: `vitest.workspace.ts`
- Create: `apps/web/package.json`
- Create: `apps/worker/package.json`
- Create: `packages/config/package.json`
- Create: `packages/contracts/package.json`
- Create: `packages/db/package.json`
- Create: `packages/queue/package.json`
- Create: `packages/domain/package.json`
- Create: `packages/testing/package.json`

**Interfaces:**
- Consumes: none.
- Produces: workspace package names `@sammlerraum/config`, `@sammlerraum/contracts`, `@sammlerraum/db`, `@sammlerraum/queue`, `@sammlerraum/domain`, `@sammlerraum/testing`.

- [x] **Step 1: Write the failing workspace smoke test**

Create `packages/testing/src/workspace.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

describe("workspace", () => {
  it("contains web and worker applications", () => {
    expect(existsSync(resolve(process.cwd(), "apps/web/package.json"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "apps/worker/package.json"))).toBe(true);
  });
});
```

- [x] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run packages/testing/src/workspace.test.ts`  
Expected: FAIL because the workspace/package files do not exist yet.

- [x] **Step 3: Create the workspace manifests**

Root `package.json` must include:

```json
{
  "name": "sammlerraum",
  "private": true,
  "packageManager": "pnpm@10.17.1",
  "engines": { "node": ">=24.0.0" },
  "scripts": {
    "build": "pnpm -r build",
    "test": "vitest run",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "dev:web": "pnpm --filter @sammlerraum/web dev",
    "dev:worker": "pnpm --filter @sammlerraum/worker dev"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "vitest": "^3.2.0"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*
```

`.nvmrc`:

```text
24
```

Create package manifests with the exact package names listed under **Produces** plus `@sammlerraum/web` and `@sammlerraum/worker`.

- [x] **Step 4: Install dependencies and run the smoke test**

Run: `pnpm install && pnpm vitest run packages/testing/src/workspace.test.ts`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml .nvmrc tsconfig.base.json vitest.workspace.ts apps packages
git commit -m "chore: scaffold Sammlerraum workspace"
```

---

### Task 2: Add validated environment configuration

**Files:**
- Create: `packages/config/src/server.ts`
- Create: `packages/config/src/client.ts`
- Create: `packages/config/src/server.test.ts`
- Create: `.env.example`

**Interfaces:**
- Consumes: Zod.
- Produces: `parseServerEnv(input): ServerEnv`, `serverEnv`, `clientEnv`.

- [x] **Step 1: Write failing config tests**

```ts
import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./server";

describe("parseServerEnv", () => {
  it("rejects missing database configuration", () => {
    expect(() => parseServerEnv({ NODE_ENV: "test" })).toThrow(/DATABASE_URL/);
  });

  it("accepts the required foundation environment", () => {
    expect(parseServerEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/sammlerraum",
      APP_ORIGIN: "http://localhost:3000",
      UPLOADS_DIR: "/tmp/sammlerraum-uploads"
    }).APP_ORIGIN).toBe("http://localhost:3000");
  });
});
```

- [x] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/config/src/server.test.ts`  
Expected: FAIL because `parseServerEnv` does not exist.

- [x] **Step 3: Implement server config**

```ts
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  APP_ORIGIN: z.string().url(),
  UPLOADS_DIR: z.string().min(1),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info")
});

export type ServerEnv = z.infer<typeof schema>;

export function parseServerEnv(input: Record<string, string | undefined>): ServerEnv {
  return schema.parse(input);
}

export const serverEnv = parseServerEnv(process.env);
```

`.env.example` must contain non-secret examples for `DATABASE_URL`, `APP_ORIGIN`, `UPLOADS_DIR`, and `LOG_LEVEL`.

- [x] **Step 4: Run tests**

Run: `pnpm vitest run packages/config/src/server.test.ts`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/config .env.example
git commit -m "feat: add validated environment configuration"
```

---

### Task 3: Establish Prisma/PostgreSQL and database health

**Files:**
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/health.ts`
- Create: `packages/db/src/health.test.ts`
- Create: `packages/db/src/test-database.ts`

**Interfaces:**
- Consumes: `DATABASE_URL`.
- Produces: `prisma`, `checkDatabaseHealth(): Promise<{ ok: boolean }>`.

- [x] **Step 1: Write failing health test**

```ts
import { describe, expect, it, vi } from "vitest";
import { checkDatabaseHealth } from "./health";

describe("checkDatabaseHealth", () => {
  it("reports a failed query as unhealthy", async () => {
    const db = { $queryRaw: vi.fn().mockRejectedValue(new Error("offline")) };
    await expect(checkDatabaseHealth(db as never)).resolves.toEqual({ ok: false });
  });
});
```

- [x] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/db/src/health.test.ts`  
Expected: FAIL because `checkDatabaseHealth` does not exist.

- [x] **Step 3: Implement the database package**

`schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model SystemMetadata {
  key       String   @id
  value     String
  updatedAt DateTime @updatedAt
}
```

`health.ts`:

```ts
type Queryable = { $queryRaw: (query: TemplateStringsArray) => Promise<unknown> };

export async function checkDatabaseHealth(db: Queryable): Promise<{ ok: boolean }> {
  try {
    await db.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
```

Generate the Prisma client and create the initial migration.

- [x] **Step 4: Run tests and migration validation**

Run:
```bash
pnpm --filter @sammlerraum/db prisma generate
pnpm --filter @sammlerraum/db prisma validate
pnpm vitest run packages/db/src/health.test.ts
```

Expected: all PASS.

- [x] **Step 5: Commit**

```bash
git add packages/db
git commit -m "feat: establish PostgreSQL foundation"
```

---

### Task 4: Add queue abstraction and worker runtime

**Files:**
- Create: `packages/queue/src/types.ts`
- Create: `packages/queue/src/pg-boss-queue.ts`
- Create: `packages/queue/src/pg-boss-queue.test.ts`
- Create: `apps/worker/src/main.ts`
- Create: `apps/worker/src/health.ts`

**Interfaces:**
- Consumes: PostgreSQL connection.
- Produces:
  - `QueueClient.enqueue<T>(name: string, payload: T, options?: EnqueueOptions): Promise<string>`
  - `WorkerRegistry.register<T>(name: string, handler: JobHandler<T>): void`

- [x] **Step 1: Write the failing queue contract test**

```ts
import { describe, expect, it } from "vitest";
import { InMemoryQueueClient } from "./testing/in-memory-queue";

describe("QueueClient", () => {
  it("deduplicates a job when a singleton key is reused", async () => {
    const queue = new InMemoryQueueClient();
    const first = await queue.enqueue("image.process", { id: "a" }, { singletonKey: "image:a" });
    const second = await queue.enqueue("image.process", { id: "a" }, { singletonKey: "image:a" });
    expect(second).toBe(first);
  });
});
```

- [x] **Step 2: Run and confirm failure**

Run: `pnpm vitest run packages/queue/src/pg-boss-queue.test.ts`  
Expected: FAIL because queue interfaces/testing implementation do not exist.

- [x] **Step 3: Implement interfaces and pg-boss adapter**

```ts
export type EnqueueOptions = {
  singletonKey?: string;
  retryLimit?: number;
  priority?: number;
};

export interface QueueClient {
  enqueue<T>(name: string, payload: T, options?: EnqueueOptions): Promise<string>;
}

export type JobHandler<T> = (payload: T) => Promise<void>;
```

The pg-boss adapter maps `singletonKey` to pg-boss singleton behavior and defaults `retryLimit` to 5.

- [x] **Step 4: Add worker startup and run tests**

`apps/worker/src/main.ts` starts the queue, registers handlers from a registry, logs readiness, and exits non-zero on unrecoverable startup configuration/database errors.

Run: `pnpm vitest run packages/queue`  
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/queue apps/worker
git commit -m "feat: add PostgreSQL queue and worker runtime"
```

---

### Task 5: Add Next.js shell, i18n, request IDs, and health

**Files:**
- Create: `apps/web/src/app/[locale]/layout.tsx`
- Create: `apps/web/src/app/[locale]/page.tsx`
- Create: `apps/web/src/app/api/health/route.ts`
- Create: `apps/web/src/i18n/routing.ts`
- Create: `apps/web/messages/de.json`
- Create: `apps/web/messages/en.json`
- Create: `apps/web/src/lib/request-id.ts`
- Create: `apps/web/src/app/api/health/route.test.ts`

**Interfaces:**
- Consumes: `checkDatabaseHealth`.
- Produces: locale-aware shell, `GET /api/health`, `getRequestId(headers): string`.

- [ ] **Step 1: Write the failing health tests**

```ts
import { describe, expect, it } from "vitest";
import { buildHealthPayload } from "./health";

describe("health payload", () => {
  it("is degraded when the database is unavailable", () => {
    expect(buildHealthPayload(false)).toEqual({
      status: "degraded",
      service: "sammlerraum-web",
      dependencies: { database: "down" }
    });
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `pnpm vitest run apps/web/src/app/api/health/route.test.ts`  
Expected: FAIL because health builder does not exist.

- [ ] **Step 3: Implement locale routing and health**

Use `next-intl` with supported locales exactly `["de", "en"]`. The root language selection redirects to a deterministic locale using explicit preference/cookie first and Accept-Language second.

Health returns HTTP 200 for healthy and HTTP 503 for degraded database state.

Request IDs use incoming `x-request-id` only when it matches `^[A-Za-z0-9._-]{1,128}$`; otherwise generate `crypto.randomUUID()`.

- [ ] **Step 4: Run focused tests and production build**

Run:
```bash
pnpm vitest run apps/web/src/app/api/health/route.test.ts
pnpm --filter @sammlerraum/web build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: add localized web shell and health endpoint"
```

---

### Task 6: Add Docker Compose and CI

**Files:**
- Create: `Dockerfile.web`
- Create: `Dockerfile.worker`
- Create: `docker-compose.yml`
- Create: `.dockerignore`
- Create: `.github/workflows/ci.yml`
- Create: `scripts/verify-compose.sh`

**Interfaces:**
- Consumes: web, worker, PostgreSQL, uploads path.
- Produces: reproducible `web`, `worker`, `db` services and persistent `sammlerraum-db`, `sammlerraum-uploads` volumes.

- [ ] **Step 1: Write the failing compose verification**

`scripts/verify-compose.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
docker compose config >/tmp/sammlerraum-compose.yml
grep -q "sammlerraum-db:" /tmp/sammlerraum-compose.yml
grep -q "sammlerraum-uploads:" /tmp/sammlerraum-compose.yml
grep -q "worker:" /tmp/sammlerraum-compose.yml
grep -q "web:" /tmp/sammlerraum-compose.yml
```

Run it before compose exists.  
Expected: FAIL.

- [ ] **Step 2: Create Dockerfiles and compose**

`docker-compose.yml` must include:

- PostgreSQL 17 with `sammlerraum-db:/var/lib/postgresql/data`.
- Web with `sammlerraum-uploads:/data/uploads`.
- Worker with the same uploads volume.
- Healthchecks for database and web.
- No source-code bind mounts in the production compose.

- [ ] **Step 3: Add CI workflow**

CI jobs run:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm typecheck
pnpm build
bash scripts/verify-compose.sh
docker build -f Dockerfile.web .
docker build -f Dockerfile.worker .
```

Use a PostgreSQL service for migration/integration checks.

- [ ] **Step 4: Run the same validation locally**

Run:
```bash
bash scripts/verify-compose.sh
pnpm test
pnpm typecheck
pnpm build
docker build -f Dockerfile.web .
docker build -f Dockerfile.worker .
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile.web Dockerfile.worker docker-compose.yml .dockerignore .github scripts
git commit -m "ci: add Docker and continuous integration foundation"
```
