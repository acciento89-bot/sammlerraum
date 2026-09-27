"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { authClient } from "../../lib/auth-client";

export function AccountNav({ locale }: { locale: string }) {
  const t = useTranslations("Account");
  const router = useRouter();
  return (
    <nav className="account-nav" aria-label={t("nav")}>
      <a href={`/${locale}/account/profile`}>{t("profile")}</a>
      <a href={`/${locale}/account/security`}>{t("security")}</a>
      <button
        onClick={async () => {
          await authClient.signOut();
          router.push(`/${locale}/login`);
        }}
      >
        {t("signOut")}
      </button>
    </nav>
  );
}
