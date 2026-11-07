import { z } from "zod";
import { EmailSendError, type EmailProvider } from "@sammlerraum/email/types";
import { renderNotificationEmail } from "@sammlerraum/email/templates";
export const NOTIFICATION_EMAIL_JOB = "notification.send-email";
export type NotificationEmailRepository = {
  claim(deliveryId: string): Promise<{ state: string; token?: string }>;
  beginSend(
    deliveryId: string,
    token: string,
  ): Promise<{ state: string; message?: { to: string; type: string; locale: "de" | "en" } }>;
  markSent(deliveryId: string, token: string, providerMessageId: string): Promise<void>;
  markFailure(
    deliveryId: string,
    token: string,
    outcome: "NOT_ACCEPTED" | "UNKNOWN",
  ): Promise<void>;
};
const payload = z.object({ deliveryId: z.uuid().transform((v) => v.toLowerCase()) }).strict();
export function createSendEmailJob(
  repo: NotificationEmailRepository,
  provider: EmailProvider,
  config: { appOrigin: string },
) {
  return async (input: unknown, signal?: AbortSignal) => {
    const { deliveryId } = payload.parse(input);
    if (signal?.aborted) return;
    let claim: Awaited<ReturnType<typeof repo.claim>>;
    try {
      claim = await repo.claim(deliveryId);
    } catch {
      throw Error("Notification delivery unavailable");
    }
    if (claim.state !== "CLAIMED" || !claim.token) return;
    const token = claim.token;
    if (signal?.aborted) return;
    let begun: Awaited<ReturnType<typeof repo.beginSend>>;
    try {
      begun = await repo.beginSend(deliveryId, token);
    } catch {
      throw Error("Notification delivery preparation failed");
    }
    if (begun.state !== "SENDING" || !begun.message) return;
    let providerMessageId: string;
    try {
      const content = renderNotificationEmail(begun.message, config.appOrigin);
      const result = await provider.send(
        {
          deliveryId,
          to: begun.message.to,
          ...content,
          messageId: `<${deliveryId}.notifications@${new URL(config.appOrigin).hostname}>`,
        },
        signal ? { signal } : {},
      );
      providerMessageId = result.providerMessageId;
    } catch (error) {
      try {
        await repo.markFailure(
          deliveryId,
          token,
          error instanceof EmailSendError ? error.outcome : "UNKNOWN",
        );
      } catch {
        throw Error("Notification outcome persistence failed");
      }
      return;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await repo.markSent(deliveryId, token, providerMessageId);
        return;
      } catch {
        if (attempt === 2) throw Error("Notification acknowledgement persistence failed");
      }
    }
  };
}
