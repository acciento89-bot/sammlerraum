import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { publicBillingCatalog } from "../../../lib/billing-ui-runtime";
import { PricePlans } from "../../../components/billing/price-plans";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: "de" | "en" }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, catalog] = await Promise.all([getTranslations("Billing"), publicBillingCatalog()]);
  return (
    <section className="account-shell billing-shell">
      <p className="eyebrow">{t("eyebrow")}</p>
      <h1>{t("pricingTitle")}</h1>
      <p className="form-intro">{t("pricingIntro")}</p>
      <PricePlans locale={locale} policy={catalog.policy} offers={catalog.offers} />
      <p>
        <Link href={`/${locale}/account/billing`}>{t("viewAccount")}</Link>
      </p>
    </section>
  );
}
