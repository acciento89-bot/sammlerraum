import { randomUUID } from "node:crypto";
/** Synthetic collector content only. Identities are registered through the actual UI. */
export function v1Seed(locale: "de" | "en") {
  const key = randomUUID().replaceAll("-", "");
  return {
    key,
    email: `v1-${key}@example.test`,
    password: "owned-complete-v1-cookie-fixture-password",
    name: locale === "de" ? "V1 Sammlerin" : "V1 collector",
    handle: `v1-${key.slice(0, 20)}`,
    referenceKey: `v1_${key}`,
    collection: locale === "de" ? "Atelier-Sammlung" : "Studio collection",
    item: locale === "de" ? "Grüne Atelier-Vase" : "Green studio vase",
    importItem: locale === "de" ? "Importierte Schale" : "Imported bowl",
    location: locale === "de" ? "Private Vitrine" : "Private display cabinet",
    savedSearch: locale === "de" ? "Meine Atelierstücke" : "My studio objects",
    privateNote: `private-v1-note-${key}`,
    artwork:
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#f5ecdc"/><ellipse cx="320" cy="390" rx="145" ry="18" fill="#d7d0bd"/><path d="M240 150Q200 390 320 385Q440 390 400 150Z" fill="#397b69"/><ellipse cx="320" cy="150" rx="80" ry="21" fill="#23594b"/><path d="M255 220H385M250 245H390" stroke="#dec68d" stroke-width="8"/></svg>',
  };
}
