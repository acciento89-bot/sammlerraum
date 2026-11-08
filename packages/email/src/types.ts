export interface EmailMessage {
  deliveryId: string;
  to: string;
  subject: string;
  text: string;
  messageId: string;
}
export interface EmailProvider {
  send(
    message: EmailMessage,
    options?: { signal?: AbortSignal },
  ): Promise<{ providerMessageId: string }>;
}
export class EmailSendError extends Error {
  constructor(readonly outcome: "NOT_ACCEPTED" | "UNKNOWN") {
    super("Email transport outcome: " + outcome);
    this.name = "EmailSendError";
  }
}
