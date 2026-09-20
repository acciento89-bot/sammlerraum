import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

describe("production container configuration", () => {
  it("uses pinned Node and pnpm runtimes and packages built web and worker outputs", () => {
    const web = read("Dockerfile.web");
    const worker = read("Dockerfile.worker");

    for (const dockerfile of [web, worker]) {
      expect(dockerfile).toMatch(/FROM node:24\.\d+\.\d+-bookworm-slim/);
      expect(dockerfile).toContain("corepack prepare pnpm@10.17.1 --activate");
      expect(dockerfile).toContain("pnpm install --frozen-lockfile");
      expect(dockerfile).toMatch(
        /RUN DATABASE_URL=postgresql:\/\/build:build@127\.0\.0\.1:5432\/sammlerraum_build[\\\s]+pnpm --filter @sammlerraum\/db prisma generate/,
      );
      expect(dockerfile).not.toContain("COPY .env");
    }
    expect(web).toContain("server.js");
    expect(worker).toContain("dist/worker.cjs");
  });

  it("persists PostgreSQL and shares uploads without source bind mounts", () => {
    const compose = read("docker-compose.yml");

    expect(compose).toContain("postgres:17");
    expect(compose).toContain("sammlerraum-db:/var/lib/postgresql/data");
    expect(compose.match(/sammlerraum-uploads:\/data\/uploads/g)).toHaveLength(2);
    expect(compose).toMatch(/db:\s*[\s\S]*healthcheck:/);
    expect(compose).toMatch(/web:\s*[\s\S]*healthcheck:/);
    expect(compose).not.toMatch(/-\s*[.][/:]/);
  });

  it("runs required CI gates for feature branches and real PostgreSQL integration", () => {
    const workflow = read(".github/workflows/ci.yml");

    expect(workflow).toMatch(
      /push:\s*\n\s+branches:\s*\["main", "work\/sammlerraum-v1"\]/,
    );
    expect(workflow).toMatch(/pull_request:\s*\n\s+branches:\s*\["main"\]/);
    for (const command of [
      "pnpm install --frozen-lockfile",
      "pnpm test",
      "pnpm lint",
      "pnpm typecheck",
      "pnpm build",
      "bash scripts/verify-compose.sh",
      "docker build -f Dockerfile.web",
      "docker build -f Dockerfile.worker",
      "prisma migrate deploy",
    ]) {
      expect(workflow).toContain(command);
    }
    expect(workflow).toContain("postgres:17");
    expect(workflow).toContain("pg-boss singleton integration tests");
  });
});
