import { serverEnv } from "@sammlerraum/config/server";
import { MoneyConsumerProvider } from "../../../../components/search/money-consumer-context";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { auth } from "../../../../lib/auth";
import { SearchPage } from "../../../../components/search/search-page";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function CollectorDashboardPage({
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
  return (
    <MoneyConsumerProvider enabled={serverEnv.MONEY_CANONICAL_CONSUMERS_ENABLED}>
      <SearchPage
        key={`${session.user.id}:dashboard`}
        view="dashboard"
        locale={locale}
        actor={session.user.id}
      />
    </MoneyConsumerProvider>
  );
}
