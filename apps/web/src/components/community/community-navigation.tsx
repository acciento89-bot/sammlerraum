"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
export function CommunityNavigation({
  locale,
  current,
  moderator = false,
}: {
  locale: string;
  current: "community" | "wishlist" | "notifications" | "moderation";
  moderator?: boolean;
}) {
  const t = useTranslations("Community");
  return (
    <nav className="community-navigation" aria-label="Community">
      <Link href={`/${locale}/collections`} prefetch={false}>
        ← {t("collections")}
      </Link>
      {(
        ["community", "wishlist", "notifications", ...(moderator ? ["moderation"] : [])] as const
      ).map((key) => (
        <Link
          key={key}
          href={`/${locale}/${key === "moderation" ? "community/moderation" : key}`}
          prefetch={false}
          aria-current={current === key ? "page" : undefined}
        >
          {t(key)}
        </Link>
      ))}
    </nav>
  );
}
export function CommunityHero({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string;
  title: string;
  intro: string;
}) {
  return (
    <header className="community-hero">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{intro}</p>
      </div>
      <span className="community-seal" aria-hidden="true">
        ✦
      </span>
    </header>
  );
}
