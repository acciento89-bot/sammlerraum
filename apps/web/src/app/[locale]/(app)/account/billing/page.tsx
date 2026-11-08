import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "../../../../../lib/auth";
import {
  ownBillingOverview,
  publicBillingCatalog,
  billingPaymentActionsEnabled,
} from "../../../../../lib/billing-ui-runtime";
import { AccountNav } from "../../../../../components/account/account-nav";
import { BillingPanel } from "../../../../../components/billing/billing-panel";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: "de" | "en" }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session) redirect(`/${locale}/login`);
  const t = await getTranslations("Billing"),
    query = await searchParams;
  let overview = null;
  try {
    overview = await ownBillingOverview(session.user.id);
  } catch {
    /* Never replace a failed local read with invented Free data. */
  }
  const catalog = overview ? await publicBillingCatalog() : null;
  return (
    <section className="account-shell billing-shell">
      <AccountNav locale={locale} />
      <h1>{t("accountTitle")}</h1>
      {overview && catalog ? (
        <BillingPanel
          locale={locale}
          initial={overview}
          policy={catalog.policy}
          offers={catalog.offers}
          paymentsEnabled={billingPaymentActionsEnabled()}
          returned={query.checkout === "success"}
        />
      ) : (
        <div className="settings-card">
          <p role="status">{t("statusUnavailable")}</p>
        </div>
      )}
    </section>
  );
}
