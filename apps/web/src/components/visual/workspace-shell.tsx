"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, type ReactNode } from "react";
import { workspaceLinks, workspaceSection } from "./workspace-navigation";
import { Icon } from "./icon";
export function WorkspaceShell({ locale, children }: { locale: "de" | "en"; children: ReactNode }) {
  const t = useTranslations("Visual");
  const pathname = usePathname();
  const active = workspaceSection(pathname ?? "");
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [pathname]);
  const links = workspaceLinks(locale);
  const nav = (
    <nav aria-label={t("workspaceNavigation")} className="workspace-navigation">
      {(["collection", "community", "tools", "account"] as const).map((group) => (
        <div className="workspace-nav-group" key={group}>
          <p>{t(`groups.${group}`)}</p>
          {links
            .filter((link) => link.group === group)
            .map((link) => (
              <Link
                key={link.key}
                href={link.href}
                prefetch={false}
                aria-current={active === link.key ? "page" : undefined}
                onClick={() => {
                  if (menu.current) menu.current.open = false;
                }}
              >
                <Icon name={link.icon} />
                <span>{link.label}</span>
                {active === link.key && <span className="nav-current-dot" aria-hidden="true" />}
              </Link>
            ))}
        </div>
      ))}
    </nav>
  );
  return (
    <div className="workspace-layout">
      <aside className="workspace-sidebar">
        <div className="workspace-label">
          <span className="status-dot" />
          {t("yourSpace")}
        </div>
        {nav}
        <div className="workspace-private">
          <Icon name="lock" />
          <p>
            <strong>{t("privateTitle")}</strong>
            <span>{t("privateBody")}</span>
          </p>
        </div>
      </aside>
      <div className="workspace-main">
        <details ref={menu} className="workspace-mobile-menu">
          <summary>
            <Icon name="grid" />
            {links.find((link) => link.key === active)?.label ?? t("yourSpace")}
            <span>{t("menu")}</span>
          </summary>
          {nav}
        </details>
        {children}
      </div>
    </div>
  );
}
