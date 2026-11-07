import { describe, it, expect, vi } from "vitest";
import { createSmtpProvider } from "./smtp-provider";
import { renderNotificationEmail } from "./templates";
const env = {
  SMTP_HOST: "smtp.example.invalid",
  SMTP_PORT: 587,
  SMTP_SECURE: false,
  SMTP_USER: "owned-test-user",
  SMTP_PASSWORD: "owned-test-secret",
  SMTP_FROM: "Sammlerraum <notify@example.invalid>",
};
const message = {
  deliveryId: "owned-id",
  to: "collector@example.invalid",
  subject: "Owned subject",
  text: "Owned text",
  messageId: "<owned-id@example.invalid>",
};
describe("private SMTP adapter and localized templates", () => {
  it("requires verified TLS and bounds transport time without logging credentials", async () => {
    const transport = {
      sendMail: vi.fn(async () => ({ messageId: "provider-id" })),
      close: vi.fn(),
    };
    const factory = vi.fn(() => transport);
    expect(await createSmtpProvider(env, factory).send(message)).toEqual({
      providerMessageId: "provider-id",
    });
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        requireTLS: true,
        tls: { rejectUnauthorized: true },
        socketTimeout: 20000,
      }),
    );
    expect(transport.close).toHaveBeenCalledOnce();
  });
  it("distinguishes proven SMTP rejection from ambiguous lost acceptance", async () => {
    const transport = {
      sendMail: vi
        .fn()
        .mockRejectedValueOnce({ command: "RCPT TO", responseCode: 550 })
        .mockRejectedValueOnce({ command: "DATA", code: "ECONNRESET" }),
      close: vi.fn(),
    };
    const provider = createSmtpProvider(env, () => transport);
    await expect(provider.send(message)).rejects.toMatchObject({ outcome: "NOT_ACCEPTED" });
    await expect(provider.send(message)).rejects.toMatchObject({ outcome: "UNKNOWN" });
  });
  it("never starts transport on an already-aborted or header-injected request", async () => {
    const factory = vi.fn();
    const provider = createSmtpProvider(env, factory);
    await expect(provider.send(message, { signal: AbortSignal.abort() })).rejects.toMatchObject({
      outcome: "NOT_ACCEPTED",
    });
    await expect(
      provider.send({ ...message, to: "a@example.invalid\r\nBcc:other@example.invalid" }),
    ).rejects.toMatchObject({ outcome: "NOT_ACCEPTED" });
    expect(factory).not.toHaveBeenCalled();
  });
  it("settles an aborted in-flight transport as uncertain and removes its listener", async () => {
    const control = new AbortController();
    let reject!: (reason: unknown) => void;
    const transport = {
      sendMail: vi.fn(
        () =>
          new Promise<{ messageId: string }>((_resolve, r) => {
            reject = r;
          }),
      ),
      close: vi.fn(() => reject?.(Error("private-aborted-smtp-sentinel"))),
    };
    const pending = createSmtpProvider(env, () => transport).send(message, {
      signal: control.signal,
    });
    control.abort();
    await expect(pending).rejects.toMatchObject({ outcome: "UNKNOWN" });
    expect(transport.close).toHaveBeenCalled();
  });
  it.each(["de", "en"] as const)(
    "renders %s notices with only a generic subject and an authenticated own-app link",
    (locale) => {
      const rendered = renderNotificationEmail(
        { type: "COMMENT_RECEIVED", locale },
        "https://example.invalid",
      );
      expect(rendered.text).toContain(`https://example.invalid/${locale}/notifications`);
      expect(JSON.stringify(rendered)).not.toMatch(/commentId|privateNotes|reporter|purchase/);
      const security = renderNotificationEmail(
        { type: "SECURITY_ALERT", locale },
        "https://example.invalid",
      );
      expect(security.text).toContain(`/${locale}/account/security`);
    },
  );
});
