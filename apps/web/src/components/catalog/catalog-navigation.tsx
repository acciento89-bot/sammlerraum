"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { catalogRequest, type Locale } from "./catalog-client";
export function useCatalogCapability() {
  const [canModerate, setCanModerate] = useState(false);
  useEffect(() => {
    const control = new AbortController();
    void catalogRequest<{ canModerate: boolean }>(
      "/api/v1/catalog/capabilities",
      "GET",
      undefined,
      control.signal,
    )
      .then((body) => {
        if (!control.signal.aborted) setCanModerate(body.canModerate);
      })
      .catch(() => undefined);
    return () => control.abort();
  }, []);
  return canModerate;
}
export function CatalogNavigation({
  locale,
  canModerate,
}: {
  locale: Locale;
  canModerate: boolean;
}) {
  const t = useTranslations("Catalog");
  return (
    <nav className="management-nav catalog-nav" aria-label={t("navigation")}>
      <Link href={`/${locale}/collections`}>{t("collections")}</Link>
      <Link href={`/${locale}/catalog`}>{t("catalog")}</Link>
      <Link href={`/${locale}/catalog/proposals`}>{t("myProposals")}</Link>
      {canModerate && <Link href={`/${locale}/catalog/moderation`}>{t("reviewProposals")}</Link>}
    </nav>
  );
}
