import { EnvironmentConfigurationError } from "./errors";
import { parseBillingPolicyEnv, parseBillingContextEnv } from "./billing";
export { EnvironmentConfigurationError } from "./errors";
export { parseBillingPolicyEnv, parseBillingContextEnv } from "./billing";
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
    AI_ANALYSIS_ENABLED: providerFlag(),
    AI_OPENAI_API_KEY: providerCredential(),
    AI_OPENAI_MODEL: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/u)
      .optional(),
    AI_MONTHLY_REQUEST_LIMIT: providerBudget(10000),
    NOTIFICATION_EMAIL_ENABLED: providerFlag(),
    MONEY_AUTHORING_ENABLED: providerFlag(),
    MONEY_CANONICAL_CONSUMERS_ENABLED: providerFlag(),
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
    IMPORT_MAX_BYTES: mediaLimit(20 * 1024 * 1024, 20 * 1024 * 1024),
    IMPORT_MAX_ROWS: mediaLimit(10000, 10000),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().transform(postgresUrl),
    APP_ORIGIN: z.string().transform(applicationOrigin),
    UPLOADS_DIR: z.string().min(1).refine(isAbsolute, "must be an absolute path"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  })
  .superRefine((env, context) => {
    if (
      env.AI_ANALYSIS_ENABLED &&
      !(env.AI_OPENAI_API_KEY && env.AI_OPENAI_MODEL && env.AI_MONTHLY_REQUEST_LIMIT > 0)
    )
      context.addIssue({
        code: "custom",
        path: ["AI_ANALYSIS_ENABLED"],
        message: "incomplete AI configuration",
      });

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

/** Separate worker SMTP validation; no Google/Apple credential dependency and disabled by default. */
export function parseNotificationEmailEnv(input: Record<string, string | undefined>) {
  const enabled = providerFlag().safeParse(input.NOTIFICATION_EMAIL_ENABLED);
  if (!enabled.success) throw new EnvironmentConfigurationError(["NOTIFICATION_EMAIL_ENABLED"]);
  if (!enabled.data) return null;
  const smtp = z
    .object({
      APP_ORIGIN: z.string().transform(applicationOrigin),
      SMTP_HOST: z
        .string()
        .min(1)
        .max(253)
        .refine((v) => !/[\s/?#@]/u.test(v)),
      SMTP_PORT: z.coerce.number().int().min(1).max(65535),
      SMTP_SECURE: z.enum(["true", "false"]).transform((v) => v === "true"),
      SMTP_USER: z.string().min(1).max(4096),
      SMTP_PASSWORD: z.string().min(1).max(4096),
      SMTP_FROM: z
        .string()
        .min(3)
        .max(254)
        .refine((v) => v.includes("@") && !/[\r\n]/u.test(v)),
    })
    .safeParse(input);
  if (!smtp.success)
    throw new EnvironmentConfigurationError([
      ...new Set(smtp.error.issues.map((i) => String(i.path[0]))),
    ]);
  return smtp.data;
}

/** Payment I/O activation is independent of required domain quotas. Disabled deployments use no keys. */
export function parseBillingProviderEnv(input: Record<string, string | undefined>) {
  const flag = providerFlag().safeParse(input.BILLING_ENABLED);
  if (!flag.success) throw new EnvironmentConfigurationError(["BILLING_ENABLED"]);
  if (!flag.data) return null;
  const parsed = z
    .object({
      STRIPE_SECRET_KEY: z
        .string()
        .min(12)
        .max(4096)
        .regex(/^(?:rk|sk)_(?:test|live)_[A-Za-z0-9_]+$/u),
      STRIPE_WEBHOOK_SECRET: z
        .string()
        .min(8)
        .max(4096)
        .regex(/^whsec_[A-Za-z0-9_]+$/u),
      STRIPE_PREMIUM_MONTHLY_PRICE_ID: z
        .string()
        .max(255)
        .regex(/^price_[A-Za-z0-9_]+$/u),
      STRIPE_PREMIUM_YEARLY_PRICE_ID: z
        .string()
        .max(255)
        .regex(/^price_[A-Za-z0-9_]+$/u),
      APP_ORIGIN: z.string().transform(applicationOrigin),
    })
    .safeParse(input);
  if (!parsed.success)
    throw new EnvironmentConfigurationError([
      ...new Set(parsed.error.issues.map((i) => String(i.path[0]))),
    ]);
  const p = parsed.data,
    url = new URL(p.APP_ORIGIN);
  if (p.STRIPE_PREMIUM_MONTHLY_PRICE_ID === p.STRIPE_PREMIUM_YEARLY_PRICE_ID)
    throw new EnvironmentConfigurationError(["STRIPE_PREMIUM_YEARLY_PRICE_ID"]);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new EnvironmentConfigurationError(["APP_ORIGIN"]);
  parseBillingPolicyEnv(input);
  const context = parseBillingContextEnv(input),
    liveMode = /^(?:rk|sk)_live_/u.test(p.STRIPE_SECRET_KEY);
  if (liveMode !== context.liveMode)
    throw new EnvironmentConfigurationError(["STRIPE_SECRET_KEY", "BILLING_ENVIRONMENT"]);
  return {
    liveMode,
    apiKey: p.STRIPE_SECRET_KEY,
    webhookSecret: p.STRIPE_WEBHOOK_SECRET,
    monthlyPriceId: p.STRIPE_PREMIUM_MONTHLY_PRICE_ID,
    yearlyPriceId: p.STRIPE_PREMIUM_YEARLY_PRICE_ID,
    appOrigin: p.APP_ORIGIN,
  };
}
