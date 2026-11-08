import { NotificationTypeSchema } from "@sammlerraum/contracts/notifications";
export function renderNotificationEmail(
  input: { type: string; locale: "de" | "en" },
  appOrigin: string,
) {
  const type = NotificationTypeSchema.parse(input.type),
    origin = new URL(appOrigin);
  if (
    !["https:", "http:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw Error("Invalid application origin");
  const security = type === "SECURITY_ALERT",
    de = input.locale === "de";
  const subject = security
    ? de
      ? "Sicherheitshinweis für dein Sammlerraum-Konto"
      : "Security notice for your Sammlerraum account"
    : de
      ? "Neue Aktivität bei Sammlerraum"
      : "New activity on Sammlerraum";
  const text = security
    ? de
      ? "Bitte prüfe die Sicherheit deines Sammlerraum-Kontos."
      : "Please review the security of your Sammlerraum account."
    : de
      ? "In deinem Sammlerraum-Konto gibt es eine neue Benachrichtigung. Öffne dein Konto, um die aktuellen Details zu sehen."
      : "You have a new notification in your Sammlerraum account. Open your account to view the current details.";
  return {
    subject,
    text:
      text +
      "\n\n" +
      new URL(`/${input.locale}/${security ? "account/security" : "notifications"}`, origin).href,
  };
}
