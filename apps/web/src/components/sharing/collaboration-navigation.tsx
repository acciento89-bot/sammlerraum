"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
export function CollaborationNavigation({
  locale,
  collectionId,
  current,
  ownerView = false,
}: {
  locale: string;
  collectionId?: string;
  current: "members" | "sharing" | "audit" | "workspace";
  ownerView?: boolean;
}) {
  const t = useTranslations("Collaboration");
  return (
    <nav className="management-nav" aria-label={t("navigation")}>
      <Link href={`/${locale}/collections`}>{t("collections")}</Link>
      {collectionId && (
        <>
          <Link
            href={`/${locale}/collections/${collectionId}/workspace`}
            aria-current={current === "workspace" ? "page" : undefined}
          >
            {t("collection")}
          </Link>
          <Link
            href={`/${locale}/collections/${collectionId}/members`}
            aria-current={current === "members" ? "page" : undefined}
          >
            {t("members")}
          </Link>
          {ownerView && (
            <Link
              href={`/${locale}/collections/${collectionId}/sharing`}
              aria-current={current === "sharing" ? "page" : undefined}
            >
              {t("sharing")}
            </Link>
          )}
        </>
      )}
      {(ownerView || current === "audit" || !collectionId) && (
        <Link
          href={`/${locale}/audit${collectionId ? `?resourceType=COLLECTION&resourceId=${collectionId}` : ""}`}
          aria-current={current === "audit" ? "page" : undefined}
        >
          {t("audit")}
        </Link>
      )}
    </nav>
  );
}
