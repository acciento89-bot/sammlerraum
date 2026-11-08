import { describe, expect, it } from "vitest";
import type { PublicSeoPage } from "@sammlerraum/domain/seo/public-page-query";
import { publicPageMetadata } from "./public-page-metadata";
const fixture: PublicSeoPage = {
  kind: "item",
  title: "Public collectible",
  description: "Public description",
  profile: { handle: "collector", displayName: "Public name", bio: null },
  publicLocale: "en",
  paths: {
    de: "/de/@collector/collection-123/items/456",
    en: "/en/@collector/collection-123/items/456",
  },
  updatedAt: new Date("2026-01-02"),
  indexability: { index: true, reason: "INDEXABLE" },
};
describe("safe public collector metadata", () => {
  it("uses one preferred-locale identity, reciprocal alternate chrome and branded images in both locales", () => {
    for (const locale of ["de", "en"] as const) {
      const m = publicPageMetadata(fixture, locale, "https://sammlerraum.de");
      expect(m.alternates).toMatchObject({
        canonical: fixture.paths.en,
        languages: {
          "de-DE": fixture.paths.de,
          en: fixture.paths.en,
          "x-default": fixture.paths.de,
        },
      });
      expect(m.robots).toMatchObject({ index: true, follow: true });
      expect(m.openGraph).toMatchObject({
        url: "https://sammlerraum.de" + fixture.paths.en,
        images: [{ url: `https://sammlerraum.de/${locale}/opengraph-image` }],
      });
      expect(JSON.stringify(m)).not.toContain("/api/v1/media/");
    }
  });
  it("keeps opted-out human-visible pages noindex and absent pages private", () => {
    expect(
      publicPageMetadata(
        { ...fixture, indexability: { index: false, reason: "PROFILE_OPT_OUT" } },
        "de",
        "https://sammlerraum.de",
      ).robots,
    ).toMatchObject({ index: false });
    const absent = publicPageMetadata(null, "en", "https://sammlerraum.de");
    expect(absent.robots).toMatchObject({ index: false, follow: false });
    expect(absent.alternates).toBeUndefined();
    expect(absent.title).not.toContain(fixture.title);
  });
});
