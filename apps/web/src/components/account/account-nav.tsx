"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { clearMoneyDrafts } from "../money/legacy-money-draft";
import { clearSearchSession } from "../search/search-url-state";
import { authClient } from "../../lib/auth-client";

export function AccountNav({ locale }: { locale: string }) {
  const t = useTranslations("Account");
  const search = useTranslations("Search");
  const router = useRouter();
  return (
    <nav className="account-nav" aria-label={t("nav")}>
      <a href={`/${locale}/search`}>{search("navSearch")}</a>
      <a href={`/${locale}/dashboard`}>{search("navDashboard")}</a>
      <a href={`/${locale}/account/profile`}>{t("profile")}</a>
      <a href={`/${locale}/account/security`}>{t("security")}</a>
      <a href={`/${locale}/account/billing`}>{t("billing")}</a>
      <button
        onClick={async () => {
          clearSearchSession();
          clearMoneyDrafts();
          await authClient.signOut();
          router.push(`/${locale}/login`);
        }}
      >
        {t("signOut")}
      </button>
    </nav>
  );
}
