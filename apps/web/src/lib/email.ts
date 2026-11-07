import nodemailer from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export type EmailSender = (message: EmailMessage) => Promise<void>;

interface SmtpEnvironment {
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER: string;
  SMTP_PASSWORD: string;
  SMTP_FROM: string;
}

interface MailTransport {
  sendMail(message: EmailMessage & { from: string }): Promise<unknown>;
}

type TransportFactory = (options: {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  tls: { rejectUnauthorized: true };
  auth: { user: string; pass: string };
}) => MailTransport;

const defaultTransportFactory: TransportFactory = (options) => nodemailer.createTransport(options);

export function createSmtpEmailSender(
  env: SmtpEnvironment,
  createTransport: TransportFactory = defaultTransportFactory,
): EmailSender {
  const transport = createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    requireTLS: !env.SMTP_SECURE,
    tls: { rejectUnauthorized: true },
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
    },
  });

  return async (message) => {
    await transport.sendMail({
      from: env.SMTP_FROM,
      ...message,
    });
  };
}
