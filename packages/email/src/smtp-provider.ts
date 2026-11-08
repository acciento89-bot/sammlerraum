import nodemailer from "nodemailer";
import { EmailSendError, type EmailProvider, type EmailMessage } from "./types";
export type SmtpConfiguration = {
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER: string;
  SMTP_PASSWORD: string;
  SMTP_FROM: string;
};
type Transport = {
  sendMail(input: EmailMessage & { from: string }): Promise<{ messageId?: string }>;
  close?(): void;
};
type TransportOptions = {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  tls: { rejectUnauthorized: true };
  auth: { user: string; pass: string };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
};
export function createSmtpProvider(
  env: SmtpConfiguration,
  createTransport: (options: TransportOptions) => Transport = (options) =>
    nodemailer.createTransport(options),
): EmailProvider {
  return {
    async send(message, { signal } = {}) {
      if (signal?.aborted) throw new EmailSendError("NOT_ACCEPTED");
      if (
        /[\r\n]/.test(message.to + message.subject + message.messageId + env.SMTP_FROM) ||
        !message.to.includes("@")
      )
        throw new EmailSendError("NOT_ACCEPTED");
      const transport = createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        requireTLS: !env.SMTP_SECURE,
        tls: { rejectUnauthorized: true },
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      });
      const abort = () => transport.close?.();
      signal?.addEventListener("abort", abort, { once: true });
      try {
        const result = await transport.sendMail({ from: env.SMTP_FROM, ...message });
        return { providerMessageId: result.messageId ?? message.messageId };
      } catch (error) {
        const value = error as { command?: unknown; responseCode?: unknown };
        const rejected =
          typeof value.responseCode === "number" &&
          value.responseCode >= 400 &&
          value.responseCode < 600;
        const beforeData =
          typeof value.command === "string" &&
          [
            "CONN",
            "EHLO",
            "HELO",
            "STARTTLS",
            "AUTH",
            "AUTH PLAIN",
            "AUTH LOGIN",
            "MAIL FROM",
            "RCPT TO",
          ].includes(value.command);
        throw new EmailSendError(
          !signal?.aborted && (rejected || beforeData) ? "NOT_ACCEPTED" : "UNKNOWN",
        );
      } finally {
        signal?.removeEventListener("abort", abort);
        transport.close?.();
      }
    },
  };
}
