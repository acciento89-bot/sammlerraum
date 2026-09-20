import { describe, expect, it, vi } from "vitest";

import { createSmtpEmailSender } from "./email";

describe("SMTP email sender", () => {
  it("uses authenticated SMTP without logging message secrets", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "provider-message-id" });
    const createTransport = vi.fn().mockReturnValue({ sendMail });
    const sender = createSmtpEmailSender(
      {
        SMTP_HOST: "smtp.example.test",
        SMTP_PORT: 465,
        SMTP_SECURE: true,
        SMTP_USER: "smtp-user",
        SMTP_PASSWORD: "smtp-password",
        SMTP_FROM: "Sammlerraum <noreply@example.test>",
      },
      createTransport,
    );

    await sender({
      to: "collector@example.test",
      subject: "Verify your Sammlerraum email",
      text: "https://example.test/verify?token=raw-secret-token",
    });

    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.example.test",
      port: 465,
      secure: true,
      auth: { user: "smtp-user", pass: "smtp-password" },
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: "Sammlerraum <noreply@example.test>",
      to: "collector@example.test",
      subject: "Verify your Sammlerraum email",
      text: "https://example.test/verify?token=raw-secret-token",
    });
  });
});
