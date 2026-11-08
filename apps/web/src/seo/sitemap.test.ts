import { describe, expect, it } from "vitest";
import { buildMarketingSitemap, sitemapIndexXml, sitemapUrlsXml, buildRobots } from "./sitemap";
describe("public sitemap and robots protocol", () => {
  it("includes only registered canonical bilingual marketing routes, never fake modified dates", () => {
    const rows = buildMarketingSitemap("https://sammlerraum.de");
    expect(rows.map((r) => r.url)).toEqual([
      "https://sammlerraum.de/de",
      "https://sammlerraum.de/en",
      "https://sammlerraum.de/de/funktionen",
      "https://sammlerraum.de/en/features",
      "https://sammlerraum.de/de/preise",
      "https://sammlerraum.de/en/pricing",
      "https://sammlerraum.de/de/sammeln/sammelkarten",
      "https://sammlerraum.de/en/collecting/trading-cards",
      "https://sammlerraum.de/de/sammeln/muenzen",
      "https://sammlerraum.de/en/collecting/coins",
      "https://sammlerraum.de/de/sammeln/uhren",
      "https://sammlerraum.de/en/collecting/watches",
      "https://sammlerraum.de/de/sammeln/schallplatten",
      "https://sammlerraum.de/en/collecting/vinyl",
      "https://sammlerraum.de/de/sammeln/comics",
      "https://sammlerraum.de/en/collecting/comics",
      "https://sammlerraum.de/de/sammeln/briefmarken",
      "https://sammlerraum.de/en/collecting/stamps",
    ]);
    expect(rows.every((r) => !r.lastModified && r.alternates?.languages?.en)).toBe(true);
  });
  it("escapes XML values, preserves reciprocal language attributes and actual timestamps", () => {
    const xml = sitemapUrlsXml([
      {
        url: "https://sammlerraum.de/de/@a?x=1&y=2",
        lastModified: new Date("2026-01-02T03:04:05Z"),
        alternates: {
          languages: {
            "de-DE": "https://sammlerraum.de/de/@a",
            en: "https://sammlerraum.de/en/@a",
            "x-default": "https://sammlerraum.de/de/@a",
          },
        },
      },
    ]);
    expect(xml).toContain("?x=1&amp;y=2");
    expect(xml).toContain('hreflang="en"');
    expect(xml).toContain("2026-01-02T03:04:05.000Z");
    expect(sitemapIndexXml(["https://sammlerraum.de/sitemaps/marketing"])).toContain(
      "<sitemapindex",
    );
  });
  it("blocks private and token namespaces without blocking opted-in collector routes", () => {
    const rules = buildRobots("https://sammlerraum.de"),
      serialized = JSON.stringify(rules);
    for (const path of [
      "/api/",
      "/share/",
      "/invite/",
      "/de/account/",
      "/en/account/",
      "/de/search",
      "/en/login",
    ])
      expect(serialized).toContain(path);
    expect(serialized).not.toContain("/@");
    expect(rules.sitemap).toBe("https://sammlerraum.de/sitemap.xml");
  });
  it("rejects malformed origins rather than publishing private origin data", () => {
    for (const origin of ["https://secret:token@sammlerraum.de", "https://sammlerraum.de/private"])
      expect(() => buildMarketingSitemap(origin)).toThrow();
  });
});
