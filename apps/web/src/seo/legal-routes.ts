import { isPublicLocale, type PublicLocale } from "./public-pages";

export type LegalDocumentKind = "privacy" | "imprint";

export function legalHref(locale: PublicLocale, document: LegalDocumentKind): string {
  return `/legal/${locale}/${document}`;
}

/** Separate from document copy so the client language navigation stays small. */
export function legalLocaleHref(path: string, locale: string): string | null {
  const match = /^\/legal\/(?:de|en)\/(privacy|imprint)$/u.exec(path);
  return match && isPublicLocale(locale) ? legalHref(locale, match[1] as LegalDocumentKind) : null;
}
