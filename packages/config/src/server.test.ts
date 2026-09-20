import { describe, expect, it } from "vitest";

import { EnvironmentConfigurationError, parseAuthEnv, parseServerEnv } from "./server";

const validEnvironment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/sammlerraum",
  APP_ORIGIN: "http://localhost:3000",
  UPLOADS_DIR: "/tmp/sammlerraum-uploads",
};

describe("parseServerEnv", () => {
  it("rejects missing database configuration", () => {
    expect(() => parseServerEnv({ NODE_ENV: "test" })).toThrow(/DATABASE_URL/);
  });

  it("accepts the required foundation environment", () => {
    expect(parseServerEnv(validEnvironment)).toEqual({
      ...validEnvironment,
      LOG_LEVEL: "info",
      WORKER_HEALTH_PORT: 3001,
    });
  });

  it.each(["0", "65536", "3.5", "not-a-port"])(
    "rejects invalid WORKER_HEALTH_PORT %s",
    (WORKER_HEALTH_PORT) => {
      expect(() => parseServerEnv({ ...validEnvironment, WORKER_HEALTH_PORT })).toThrow(
        EnvironmentConfigurationError,
      );
    },
  );

  it.each([
    ["NODE_ENV", "staging"],
    ["DATABASE_URL", "mysql://user:pass@localhost:3306/sammlerraum"],
    ["DATABASE_URL", "postgresql:///sammlerraum"],
    ["APP_ORIGIN", "ftp://localhost:3000"],
    ["APP_ORIGIN", "http://user:pass@localhost:3000"],
    ["APP_ORIGIN", "http://localhost:3000/app"],
    ["APP_ORIGIN", "http://localhost:3000?preview=true"],
    ["APP_ORIGIN", "http://localhost:3000#preview"],
    ["UPLOADS_DIR", "relative/uploads"],
    ["LOG_LEVEL", "verbose"],
  ])("rejects an invalid %s value", (variable, value) => {
    expect(() => parseServerEnv({ ...validEnvironment, [variable]: value })).toThrow(
      EnvironmentConfigurationError,
    );
  });

  it("normalizes APP_ORIGIN to its origin", () => {
    expect(
      parseServerEnv({ ...validEnvironment, APP_ORIGIN: "https://example.com/" }).APP_ORIGIN,
    ).toBe("https://example.com");
  });

  it("reports invalid variable names without exposing values", () => {
    const secret = "postgresql://admin:do-not-leak@/sammlerraum";

    expect.assertions(4);
    try {
      parseServerEnv({ ...validEnvironment, DATABASE_URL: secret, LOG_LEVEL: "trace" });
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentConfigurationError);
      expect(error).toMatchObject({ invalidVariables: ["DATABASE_URL", "LOG_LEVEL"] });
      expect((error as Error).message).toContain("DATABASE_URL, LOG_LEVEL");
      expect((error as Error).message).not.toContain(secret);
    }
  });
});

describe("parseAuthEnv", () => {
  const validAuthEnvironment = {
    APP_ORIGIN: "https://example.test",
    BETTER_AUTH_SECRET: "test-secret-that-is-at-least-thirty-two-characters",
    GOOGLE_CLIENT_ID: "google-client-id",
    GOOGLE_CLIENT_SECRET: "google-client-secret",
    APPLE_CLIENT_ID: "apple-client-id",
    APPLE_CLIENT_SECRET: "apple-client-secret",
    SMTP_HOST: "smtp.example.test",
    SMTP_PORT: "587",
    SMTP_SECURE: "false",
    SMTP_USER: "smtp-user",
    SMTP_PASSWORD: "smtp-password",
    SMTP_FROM: "Sammlerraum <noreply@example.test>",
  };

  it("requires provider, auth-secret, and SMTP delivery configuration", () => {
    expect(parseAuthEnv(validAuthEnvironment)).toEqual({
      ...validAuthEnvironment,
      SMTP_PORT: 587,
      SMTP_SECURE: false,
    });

    for (const key of Object.keys(validAuthEnvironment)) {
      const invalid = { ...validAuthEnvironment, [key]: undefined };
      expect(() => parseAuthEnv(invalid)).toThrow(key);
    }
  });

  it("never exposes auth or SMTP secret values in validation errors", () => {
    const secret = "too-short";

    expect(() =>
      parseAuthEnv({ ...validAuthEnvironment, BETTER_AUTH_SECRET: secret }),
    ).toThrowError(expect.objectContaining({ message: expect.not.stringContaining(secret) }));
  });
});
