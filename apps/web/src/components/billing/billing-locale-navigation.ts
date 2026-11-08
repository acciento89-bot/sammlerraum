/** No retained query can grant plan state or introduce a foreign subject. */
export function billingLocaleHref(pathname: string, locale: string): string | null {
  if (
    !["de", "en"].includes(locale) ||
    !/^\/(?:de|en)\/(?:pricing|account\/billing)$/u.test(pathname)
  )
    return null;
  return "/" + locale + pathname.slice(3);
}
