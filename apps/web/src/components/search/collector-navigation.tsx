"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
export function CollectorNavigation({ locale }: { locale: string }) {
  const t = useTranslations("Search");
  return (
    <nav className="management-nav" aria-label={t("navigation")}>
      <Link href={`/${locale}/collections`} prefetch={false}>
        {t("collections")}
      </Link>
      <Link href={`/${locale}/catalog`} prefetch={false}>
        {t("catalog")}
      </Link>
      <Link href={`/${locale}/search`} prefetch={false} aria-current="page">
        {t("navSearch")}
      </Link>
      <Link href={`/${locale}/account/profile`} prefetch={false}>
        {t("account")}
      </Link>
    </nav>
  );
}
