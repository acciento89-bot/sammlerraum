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

const mediaLimit = (maximum: number, fallback: number) =>
  z.coerce.number().int().min(1).max(maximum).default(fallback);

const providerFlag = () =>
  z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true");
const providerCredential = () =>
  z
    .string()
    .min(1)
    .max(4096)
    .refine(
      (value) => /^[\x20-\x7e]+$/u.test(value) && value.trim() === value,
      "invalid credential",
    )
    .optional();
const providerBudget = (maximum: number) => z.coerce.number().int().min(0).max(maximum).default(0);
const schema = z
  .object({
    SCRYDEX_ENABLED: providerFlag(),
    SCRYDEX_POLICY_APPROVED: providerFlag(),
    SCRYDEX_API_KEY: providerCredential(),
    SCRYDEX_TEAM_ID: providerCredential(),
    SCRYDEX_HOURLY_CALL_BUDGET: providerBudget(60),
    SCRYDEX_DAILY_CALL_BUDGET: providerBudget(500),
    PRICECHARTING_ENABLED: providerFlag(),
    PRICECHARTING_POLICY_APPROVED: providerFlag(),
    PRICECHARTING_API_TOKEN: providerCredential(),
    PRICECHARTING_HOURLY_CALL_BUDGET: providerBudget(60),
    PRICECHARTING_DAILY_CALL_BUDGET: providerBudget(500),
    MARKET_SYNC_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    MARKET_SYNC_INTERVAL_MS: z.coerce.number().int().min(60000).max(3600000).default(60000),
    MARKET_SYNC_BATCH_SIZE: mediaLimit(32, 32),
    MARKET_SYNC_MAX_PENDING: mediaLimit(256, 256),
    MEDIA_RETENTION_HOURS: mediaLimit(87600, 168),
    MEDIA_CLEANUP_INTERVAL_MS: mediaLimit(86400000, 60000),
    MEDIA_CLEANUP_BATCH_SIZE: mediaLimit(1000, 100),
    STORAGE_TEMP_MAX_AGE_HOURS: mediaLimit(87600, 24),
    MEDIA_MAX_IMAGE_BYTES: mediaLimit(100 * 1024 * 1024, 20 * 1024 * 1024),
    MEDIA_MAX_DOCUMENT_BYTES: mediaLimit(100 * 1024 * 1024, 25 * 1024 * 1024),
    MEDIA_MAX_IMAGE_PIXELS: mediaLimit(100_000_000, 40_000_000),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().transform(postgresUrl),
    APP_ORIGIN: z.string().transform(applicationOrigin),
    UPLOADS_DIR: z.string().min(1).refine(isAbsolute, "must be an absolute path"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  })
  .superRefine((env, context) => {
    for (const provider of ["SCRYDEX", "PRICECHARTING"] as const) {
      if (!env[`${provider}_ENABLED`]) continue;
      const valid =
        env.MARKET_SYNC_ENABLED &&
        env[`${provider}_POLICY_APPROVED`] &&
        env[`${provider}_HOURLY_CALL_BUDGET`] > 0 &&
        env[`${provider}_DAILY_CALL_BUDGET`] > 0 &&
        (provider === "SCRYDEX"
          ? env.SCRYDEX_API_KEY && env.SCRYDEX_TEAM_ID
          : env.PRICECHARTING_API_TOKEN);
      if (!valid)
        context.addIssue({
          code: "custom",
          path: [`${provider}_ENABLED`],
          message: "incomplete provider configuration",
        });
    }
  });

const authSchema = z.object({
  APP_ORIGIN: z.string().transform(applicationOrigin),
  BETTER_AUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  APPLE_CLIENT_ID: z.string().min(1),
  APPLE_CLIENT_SECRET: z.string().min(1),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535),
  SMTP_SECURE: z.enum(["true", "false"]).transform((value) => value === "true"),
  SMTP_USER: z.string().min(1),
  SMTP_PASSWORD: z.string().min(1),
  SMTP_FROM: z.string().min(3),
});

export type ServerEnv = z.infer<typeof schema>;
export type AuthEnv = z.infer<typeof authSchema>;

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

export function parseAuthEnv(input: Record<string, string | undefined>): AuthEnv {
  const result = authSchema.safeParse(input);
  if (result.success) {
    return result.data;
  }

  const invalidVariables = [
    ...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? "environment"))),
  ];
  throw new EnvironmentConfigurationError(invalidVariables);
}

export const serverEnv = parseServerEnv(process.env);
