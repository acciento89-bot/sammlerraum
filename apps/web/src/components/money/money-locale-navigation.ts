import { LegacyMoneyIdSchema } from "@sammlerraum/contracts/legacy-money";
/** Only route identity survives a locale change. Monetary drafts stay in private memory. */
export function moneyLocaleHref(
  pathname: string,
  language: "de" | "en",
  search: string,
): string | null {
  if (language !== "de" && language !== "en") return null;
  if (pathname.length > 256 || !/^\/(de|en)\//u.test(pathname)) return null;
  const path = pathname.slice(3);
  if (path === "/items/new") {
    const params = new URLSearchParams(search.length <= 4096 ? search : "");
    const collection =
      params.getAll("collectionId").length === 1
        ? LegacyMoneyIdSchema.safeParse(params.get("collectionId"))
        : null;
    return `/${language}/items/new${collection?.success ? `?collectionId=${collection.data}` : ""}`;
  }
  const item = path.match(/^\/items\/([^/]+)$/u);
  if (item) {
    const id = LegacyMoneyIdSchema.safeParse(item[1]);
    return id.success ? `/${language}/items/${id.data}` : null;
  }
  if (["/catalog", "/catalog/proposals", "/catalog/moderation"].includes(path))
    return `/${language}${path}`;
  const catalog = path.match(/^\/catalog\/([^/]+)$/u);
  if (catalog) {
    const id = LegacyMoneyIdSchema.safeParse(catalog[1]);
    return id.success ? `/${language}/catalog/${id.data}` : null;
  }
  return null;
}
