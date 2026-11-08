"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LocaleNavigation } from "../search/locale-navigation";
import { workspaceSection } from "./workspace-navigation";
import { Icon } from "./icon";
export function SiteHeader({ locale }: { locale: "de" | "en" }) {
  const t = useTranslations("Shell"),
    hub = useTranslations("CollectorHub");
  const pathname = usePathname() ?? "";
  const privatePage = workspaceSection(pathname) !== null;
  const home = pathname === `/${locale}` || pathname === `/${locale}/`;
  return (
    <header
      className={`site-header collector-platform-header ${privatePage ? "workspace-header" : ""} ${home ? "public-hub-header" : ""}`}
    >
      <div className="header-inner">
        <Link className="brand" href={`/${locale}`} aria-label={t("home")}>
          <span className="brand-mark" aria-hidden="true">
            <svg width="38" height="42" viewBox="0 0 38 42" fill="none">
              <path
                d="m19 1 18 10-18 10L1 11z M1 14l16 9v18L1 32z M21 23l16-9v18l-16 9z"
                fill="currentColor"
              />
              <path d="m9 7 18 10" stroke="#16243b" strokeWidth="2.5" />
            </svg>
          </span>
          <span>
            <strong>{t("brand")}</strong>
            <small>{hub("sidebarFoot")}</small>
          </span>
        </Link>
        <Link
          className="hub-search"
          href={`/${locale}/search`}
          prefetch={false}
          aria-label={hub("searchLabel")}
        >
          <Icon name="search" />
          <span>{hub("globalSearch")}</span>
        </Link>
        <div className="header-tools">
          <LocaleNavigation locale={locale} />
          <Link
            className="header-notifications"
            href={`/${locale}/notifications`}
            prefetch={false}
            aria-label={hub("notifications")}
          >
            <Icon name="bell" />
          </Link>
          <Link
            className="header-account"
            href={`/${locale}/${privatePage ? "account/profile" : "login"}`}
            prefetch={false}
            aria-label={hub("account")}
          >
            <Icon name="user" />
          </Link>
        </div>
      </div>
    </header>
  );
}
