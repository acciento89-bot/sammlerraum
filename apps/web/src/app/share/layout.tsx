import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { selectLocale } from "../../i18n/routing";
import "../globals.css";
export const metadata: Metadata = {
  title: "Sammlerraum · Geteilte Auswahl",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function ShareLayout({ children }: { children: ReactNode }) {
  const h = await headers(),
    cookie = h.get("cookie")?.match(/(?:^|;\s*)NEXT_LOCALE=(de|en)(?:;|$)/)?.[1];
  return (
    <html lang={selectLocale(cookie, h.get("accept-language"))}>
      <body>{children}</body>
    </html>
  );
}
