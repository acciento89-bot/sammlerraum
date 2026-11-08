import { describe, expect, it } from "vitest";
import type { PublicSeoPage } from "@sammlerraum/domain/seo/public-page-query";
import {
  websiteJsonLd,
  profilePageJsonLd,
  collectionPageJsonLd,
  publicItemJsonLd,
  breadcrumbJsonLd,
  serializeJsonLd,
} from "./structured-data";
import { buildItemOgModel, buildCategoryOgModel } from "./social-preview";
import { CATEGORY_PAGES } from "./category-pages";
const origin = "https://sammlerraum.de",
  fixture: PublicSeoPage = {
    kind: "profile",
    title: "Public collector",
    description: "Public biography",
    profile: { handle: "collector", displayName: "Public name", bio: "Public biography" },
    publicLocale: "en",
    paths: { de: "/de/@collector", en: "/en/@collector" },
    updatedAt: new Date("2026-01-02"),
    indexability: { index: true, reason: "INDEXABLE" },
  };
describe("factual safe structured data and deterministic branded previews", () => {
  it("represents the real application/operator without inventing ratings, prices, offers or search actions", () => {
    const value = websiteJsonLd(origin),
      json = JSON.stringify(value);
    expect(json).toContain('"Organization"');
    expect(json).toContain('"WebSite"');
    expect(json).toContain('"WebApplication"');
    expect(json).toContain("Kamilunavo");
    expect(json).not.toMatch(
      /aggregateRating|reviewCount|ratingValue|offers|price|availability|award|SearchAction/u,
    );
  });
  it("emits public-safe ProfilePage/CollectionPage/WebPage types only for opted-in pages", () => {
    expect(profilePageJsonLd(fixture, origin)).toMatchObject({
      "@type": "ProfilePage",
      url: origin + fixture.paths.en,
    });
    expect(collectionPageJsonLd({ ...fixture, kind: "collection" }, origin)).toMatchObject({
      "@type": "CollectionPage",
    });
    expect(publicItemJsonLd({ ...fixture, kind: "item" }, origin)).toMatchObject({
      "@type": "WebPage",
    });
    for (const factory of [profilePageJsonLd, collectionPageJsonLd, publicItemJsonLd])
      expect(
        factory({ ...fixture, indexability: { index: false, reason: "PROFILE_OPT_OUT" } }, origin),
      ).toBeNull();
    expect(JSON.stringify(publicItemJsonLd({ ...fixture, kind: "item" }, origin))).not.toMatch(
      /Product|offers|price|availability|rating/u,
    );
  });
  it("builds actual preferred-locale breadcrumb hierarchy without query or token identities", () => {
    const page = {
      ...fixture,
      kind: "item" as const,
      paths: {
        de: "/de/@collector/collection-123/items/456",
        en: "/en/@collector/collection-123/items/456",
      },
    };
    const value = breadcrumbJsonLd(page, origin);
    expect(value).toMatchObject({ "@type": "BreadcrumbList" });
    expect(JSON.stringify(value)).toContain(origin + "/en/@collector/collection-123");
    expect(JSON.stringify(value)).not.toContain("/de/");
  });
  it("escapes script terminators and HTML-sensitive characters while retaining valid JSON content", () => {
    const malicious = { name: '</script><script>alert("x")</script>&\u2028\u2029' };
    const value = serializeJsonLd(malicious);
    expect(value).not.toMatch(/[<>&\u2028\u2029]/u);
    expect(JSON.parse(value)).toEqual(malicious);
  });
  it("never fetches or embeds user media: item and missing/private resources use branded fallback", () => {
    for (const page of [
      fixture,
      { ...fixture, indexability: { index: false, reason: "PROFILE_OPT_OUT" as const } },
      null,
    ]) {
      const model = buildItemOgModel(page, "de");
      expect(model.imageKind).toBe("BRANDED_FALLBACK");
      expect(JSON.stringify(model)).not.toContain("/api/");
      expect(model.title).toBe("Sammlerraum");
    }
  });
  it("uses distinct deterministic translated category preview models with no external asset fetch", () => {
    const a = buildCategoryOgModel(CATEGORY_PAGES[0]!, "de"),
      b = buildCategoryOgModel(CATEGORY_PAGES[1]!, "en");
    expect(a.subtitle).not.toBe(b.subtitle);
    expect(a.imageKind).toBe("BRANDED_FALLBACK");
    expect(b.title).toBe("Sammlerraum");
  });
});
