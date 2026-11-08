"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
export function CollectorNavigation({
  locale,
  current = "search",
}: {
  locale: string;
  current?: "search" | "saved" | "dashboard" | "milestones" | "shared";
}) {
  const t = useTranslations("Search");
  const collaboration = useTranslations("Collaboration");
  const community = useTranslations("Community");
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
        href={`/${locale}/shared-search`}
        prefetch={false}
        aria-current={current === "shared" ? "page" : undefined}
      >
        {t("navShared")}
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
      <Link href={`/${locale}/community`} prefetch={false}>
        {community("community")}
      </Link>
      <Link href={`/${locale}/wishlist`} prefetch={false}>
        {community("wishlist")}
      </Link>
      <Link href={`/${locale}/notifications`} prefetch={false}>
        {community("notifications")}
      </Link>
      <Link href={`/${locale}/audit`}>{collaboration("audit")}</Link>
      <Link href={`/${locale}/account/profile`} prefetch={false}>
        {t("account")}
      </Link>
    </nav>
  );
}
