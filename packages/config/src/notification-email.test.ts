import { describe, it, expect } from "vitest";
import { parseNotificationEmailEnv, parseServerEnv } from "./server";
const base = {
  DATABASE_URL: "postgresql://test:test@localhost:5432/owned_test",
  APP_ORIGIN: "https://example.invalid",
  UPLOADS_DIR: "/tmp/owned-uploads",
};
describe("explicit notification mail activation", () => {
  it("keeps notification SMTP disabled without requesting new credentials", () => {
    expect(parseServerEnv(base).NOTIFICATION_EMAIL_ENABLED).toBe(false);
    expect(parseNotificationEmailEnv(base)).toBeNull();
  });
  it("requires an explicit complete configuration when enabled and never prints credential values", () => {
    expect(() =>
      parseNotificationEmailEnv({ ...base, NOTIFICATION_EMAIL_ENABLED: "true" }),
    ).toThrow(/SMTP_HOST/);
    try {
      parseNotificationEmailEnv({
        ...base,
        NOTIFICATION_EMAIL_ENABLED: "true",
        SMTP_HOST: "smtp.example.invalid",
        SMTP_PORT: "private-invalid-port-sentinel",
        SMTP_PASSWORD: "private-password-sentinel",
      });
      throw Error("Expected invalid config");
    } catch (e) {
      expect(String(e)).toContain("SMTP_PORT");
      expect(String(e)).not.toMatch(/private-invalid-port-sentinel|private-password-sentinel/);
    }
  });
  it("accepts verified TLS settings without enabling external service by default", () => {
    expect(
      parseNotificationEmailEnv({
        ...base,
        NOTIFICATION_EMAIL_ENABLED: "true",
        SMTP_HOST: "smtp.example.invalid",
        SMTP_PORT: "587",
        SMTP_SECURE: "false",
        SMTP_USER: "own-user",
        SMTP_PASSWORD: "own-secret",
        SMTP_FROM: "Sammlerraum <notice@example.invalid>",
      }),
    ).toMatchObject({ SMTP_PORT: 587, SMTP_SECURE: false });
  });
});
