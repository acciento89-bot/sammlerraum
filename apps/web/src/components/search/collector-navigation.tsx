"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
export function CollectorNavigation({
  locale,
  current = "search",
}: {
  locale: string;
  current?: "search" | "saved" | "dashboard";
}) {
  const t = useTranslations("Search");
  return (
    <nav className="management-nav" aria-label={t("navigation")}>
      <Link href={`/${locale}/collections`} prefetch={false}>
        {t("collections")}
      </Link>
      <Link href={`/${locale}/catalog`} prefetch={false}>
        {t("catalog")}
      </Link>
      <Link
        href={`/${locale}/search`}
        prefetch={false}
        aria-current={current === "search" ? "page" : undefined}
      >
        {t("navSearch")}
      </Link>
      <Link
        href={`/${locale}/dashboard`}
        prefetch={false}
        aria-current={current === "dashboard" ? "page" : undefined}
      >
        {t("navDashboard")}
      </Link>
      <Link
        href={`/${locale}/smart-collections`}
        prefetch={false}
        aria-current={current === "saved" ? "page" : undefined}
      >
        {t("navSaved")}
      </Link>
      <Link href={`/${locale}/account/profile`} prefetch={false}>
        {t("account")}
      </Link>
    </nav>
  );
}
