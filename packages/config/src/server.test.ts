import { describe, expect, it } from "vitest";

import { EnvironmentConfigurationError, parseServerEnv } from "./server";

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
