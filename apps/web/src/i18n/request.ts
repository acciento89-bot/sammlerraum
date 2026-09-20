import { getRequestConfig } from "next-intl/server";

import de from "../../messages/de.json";
import en from "../../messages/en.json";
import { defaultLocale, locales, type Locale } from "./routing";

const messages = { de, en };

export default getRequestConfig(async ({ requestLocale }) => {
  const requestedLocale = await requestLocale;
  const locale: Locale = locales.some((candidate) => candidate === requestedLocale)
    ? (requestedLocale as Locale)
    : defaultLocale;

  return { locale, messages: messages[locale] };
});
