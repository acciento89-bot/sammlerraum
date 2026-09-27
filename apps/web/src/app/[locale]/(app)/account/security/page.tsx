import { prisma } from "@sammlerraum/db/client";
import {
  createSecurityService,
  type SecurityDatabase,
} from "@sammlerraum/domain/identity/security-service";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountNav } from "../../../../../components/account/account-nav";
import { PasskeyManager } from "../../../../../components/auth/passkey-manager";
import { auth } from "../../../../../lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function SecurityPage({
  params,
}: {
  params: Promise<{ locale: "de" | "en" }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session) redirect(`/${locale}/login`);
  const service = createSecurityService(prisma as unknown as SecurityDatabase);
  const [methods, sessions, t] = await Promise.all([
    service.listLoginMethods(session.user.id),
    service.listSessions(session.user.id, session.session.id),
    getTranslations("Security"),
  ]);
  return (
    <section className="account-shell">
      <AccountNav locale={locale} />
      <header className="account-heading">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1>{t("title")}</h1>
        <p className="form-intro">{t("intro")}</p>
      </header>
      <PasskeyManager
        email={session.user.email}
        initialFreshUntil={new Date(session.session.createdAt).getTime() + 5 * 60_000}
        locale={locale}
        initialMethods={methods}
        initialSessions={sessions.map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
          lastSeenAt: item.lastSeenAt.toISOString(),
        }))}
      />
    </section>
  );
}
