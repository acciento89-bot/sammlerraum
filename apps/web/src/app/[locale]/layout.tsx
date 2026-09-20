import type { Metadata } from "next";
import Link from "next/link";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { routing } from "../../i18n/routing";
import "../globals.css";

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
  return { title: t("brand"), description: t("tagline") };
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
          <header className="site-header">
            <div className="header-inner">
              <Link className="brand" href={`/${locale}`} aria-label={t("home")}>
                <span className="brand-mark" aria-hidden="true">
                  S
                </span>
                <span>
                  <strong>{t("brand")}</strong>
                  <small>{t("tagline")}</small>
                </span>
              </Link>
              <nav className="language-nav" aria-label={t("language")}>
                <Link href="/de" hrefLang="de" aria-current={locale === "de" ? "page" : undefined}>
                  {t("german")}
                </Link>
                <Link href="/en" hrefLang="en" aria-current={locale === "en" ? "page" : undefined}>
                  {t("english")}
                </Link>
              </nav>
            </div>
          </header>
          <main id="main-content">{children}</main>
          <footer className="site-footer">
            <p>{t("footer")}</p>
          </footer>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
