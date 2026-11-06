"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { parseSearchLocation } from "./search-url-state";
export function LocaleNavigation({ locale }: { locale: string }) {
  const t = useTranslations("Shell");
  const pathname = usePathname();
  const [suffix, setSuffix] = useState("");
  useEffect(() => {
    const update = () => {
      const parsed = parseSearchLocation(window.location.search, window.location.hash);
      setSuffix(
        parsed.kind === "token"
          ? `?q=${parsed.token}`
          : parsed.kind === "invalid"
            ? "?invalid"
            : "",
      );
    };
    update();
    window.addEventListener("popstate", update);
    window.addEventListener("sammlerraum:search-history", update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("sammlerraum:search-history", update);
    };
  }, [pathname]);
  const saved = /^\/(de|en)\/smart-collections(?:\/[0-9a-f-]+)?$/u.test(pathname ?? "");
  const milestones = /^\/(de|en)\/milestones$/u.test(pathname ?? "");
  const queryView = pathname?.match(/^\/(de|en)\/(search|dashboard)$/u)?.[2];
  return (
    <nav className="language-nav" aria-label={t("language")}>
      {(["de", "en"] as const).map((language) => (
        <Link
          key={language}
          href={
            queryView
              ? `/${language}/${queryView}${suffix}`
              : saved || milestones
                ? `/${language}${pathname!.slice(3)}`
                : `/${language}`
          }
          hrefLang={language}
          prefetch={false}
          aria-current={locale === language ? "page" : undefined}
        >
          {t(language === "de" ? "german" : "english")}
        </Link>
      ))}
    </nav>
  );
}
