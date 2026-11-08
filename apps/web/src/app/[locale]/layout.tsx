import type { Metadata } from "next";
import { siteOrigin } from "../../seo/page-metadata";
import Link from "next/link";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { SiteHeader } from "../../components/visual/site-header";
import { routing } from "../../i18n/routing";
import { legalHref } from "../../seo/legal-routes";
import "../globals.css";
import "../collector-design.css";
import "../collector-hub.css";

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "Shell" });
  return {
    metadataBase: siteOrigin(),
    title: t("brand"),
    description: t("tagline"),
    robots: { index: false, follow: false },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const [messages, t] = await Promise.all([getMessages(), getTranslations("Shell")]);

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <a className="skip-link" href="#main-content">
            {t("home")}
          </a>
          <SiteHeader locale={locale} />
          <main id="main-content">{children}</main>
          <footer className="site-footer">
            <p>{t("footer")}</p>
            <nav aria-label={t("legalInformation")}>
              <Link href={legalHref(locale, "privacy")}>{t("privacy")}</Link>
              {" · "}
              <Link href={legalHref(locale, "imprint")}>{t("imprint")}</Link>
            </nav>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
