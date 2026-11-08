export type WorkspaceLocale = "de" | "en";
const sections = [
  ["dashboard", "Übersicht", "Dashboard", "home", "collection"],
  ["collections", "Meine Sammlungen", "My collections", "grid", "collection"],
  ["search", "Suche", "Search", "search", "collection"],
  ["smart-collections", "Smart Collections", "Smart collections", "spark", "collection"],
  ["catalog", "Referenzkatalog", "Reference catalog", "book", "collection"],
  ["community", "Entdecken", "Discover", "compass", "community"],
  ["wishlist", "Wunschliste & Tausch", "Wishlist & trading", "heart", "community"],
  ["notifications", "Benachrichtigungen", "Notifications", "bell", "community"],
  ["shared-search", "Geteilte Sammlungen", "Shared collections", "users", "tools"],
  ["imports", "Importieren", "Import", "upload", "tools"],
  ["exports", "Exporte & Berichte", "Exports & reports", "download", "tools"],
  ["insurance", "Versicherung", "Insurance", "shield", "tools"],
  ["milestones", "Meilensteine", "Milestones", "star", "tools"],
  ["audit", "Verlauf", "History", "clock", "tools"],
  ["profile", "Mein Profil", "My profile", "user", "account"],
  ["security", "Sicherheit", "Security", "lock", "account"],
  ["billing", "Free & Premium", "Free & Premium", "spark", "account"],
] as const;
export type WorkspaceSection = (typeof sections)[number][0];
export type IconName = (typeof sections)[number][3] | "arrow" | "plus" | "check" | "layers";
export function workspaceLinks(locale: WorkspaceLocale) {
  return sections.map(([key, de, en, icon, group]) => ({
    key,
    label: locale === "de" ? de : en,
    icon,
    group,
    href: `/${locale}/${group === "account" ? "account/" : ""}${key}`,
  }));
}
export function workspaceSection(path: string): WorkspaceSection | null {
  const parts = path.split(/[?#]/u)[0]!.split("/").filter(Boolean);
  if (parts[0] !== "de" && parts[0] !== "en") return null;
  if (parts[1] === "items" || parts[1] === "locations") return "collections";
  if (parts[1] === "account") {
    return ["profile", "security", "billing"].includes(parts[2] ?? "")
      ? (parts[2] as WorkspaceSection)
      : null;
  }
  return sections.some(([key, , , , group]) => key === parts[1] && group !== "account")
    ? (parts[1] as WorkspaceSection)
    : null;
}
