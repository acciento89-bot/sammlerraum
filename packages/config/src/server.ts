import { isAbsolute } from "node:path";

import { z } from "zod";

function postgresUrl(value: string, context: z.RefinementCtx): string | never {
  try {
    const url = new URL(value);
    if ((url.protocol !== "postgres:" && url.protocol !== "postgresql:") || !url.hostname) {
      context.addIssue({ code: "custom", message: "must be a PostgreSQL URL with a host" });
      return z.NEVER;
    }
    return value;
  } catch {
    context.addIssue({ code: "custom", message: "must be a PostgreSQL URL with a host" });
    return z.NEVER;
  }
}

function applicationOrigin(value: string, context: z.RefinementCtx): string | never {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username !== "" ||
      url.password !== "" ||
      (url.pathname !== "" && url.pathname !== "/") ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      context.addIssue({ code: "custom", message: "must be an HTTP(S) origin" });
      return z.NEVER;
    }
    return url.origin;
  } catch {
    context.addIssue({ code: "custom", message: "must be an HTTP(S) origin" });
    return z.NEVER;
  }
}

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().transform(postgresUrl),
  APP_ORIGIN: z.string().transform(applicationOrigin),
  UPLOADS_DIR: z.string().min(1).refine(isAbsolute, "must be an absolute path"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
});

export type ServerEnv = z.infer<typeof schema>;

export class EnvironmentConfigurationError extends Error {
  readonly invalidVariables: readonly string[];

  constructor(invalidVariables: readonly string[]) {
    super(`Invalid environment configuration: ${invalidVariables.join(", ")}`);
    this.name = "EnvironmentConfigurationError";
    this.invalidVariables = invalidVariables;
  }
}

export function parseServerEnv(input: Record<string, string | undefined>): ServerEnv {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }

  const invalidVariables = [
    ...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? "environment"))),
  ];
  throw new EnvironmentConfigurationError(invalidVariables);
}

export const serverEnv = parseServerEnv(process.env);
