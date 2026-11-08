/** Closed anonymous-resource routes only; arbitrary query and hash values never cross locales. */
export function publicCollectorLocaleHref(path: string, locale: string, search = "") {
  if (locale !== "de" && locale !== "en") return null;
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const route = new RegExp(
    `^/(de|en)(/@[a-z0-9][a-z0-9-]{2,63}(?:/collection-${uuid}(?:/items/${uuid})?)?)$`,
    "u",
  ).exec(path);
  if (!route) return null;
  const query = new URLSearchParams(search),
    cursors = query.getAll("afterId");
  const cursor =
    cursors.length === 1 &&
    new RegExp(`^${uuid}$`, "u").test(cursors[0]!) &&
    !route[2]!.includes("/items/")
      ? `?afterId=${cursors[0]}`
      : "";
  return `/${locale}${route[2]}${cursor}`;
}
