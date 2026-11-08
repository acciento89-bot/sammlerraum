import { describe, expect, it } from "vitest";
import { marketingMetadata, siteOrigin } from "./page-metadata";
describe("intentional reciprocal public marketing metadata", () => {
  it.each(["home", "features", "pricing"] as const)(
    "gives %s reciprocal canonical/hreflang and complete actual-language social metadata",
    (key) => {
      for (const locale of ["de", "en"] as const) {
        const m = marketingMetadata(key, locale, "https://sammlerraum.de");
        expect(m.alternates?.languages).toMatchObject({
          "de-DE": expect.stringMatching(/^\/de/u),
          en: expect.stringMatching(/^\/en/u),
          "x-default": expect.stringMatching(/^\/de/u),
        });
        expect(m.alternates?.canonical).toBe(
          m.alternates?.languages?.[locale === "de" ? "de-DE" : "en"],
        );
        expect(m.title).toBeTruthy();
        expect(m.description).toBeTruthy();
        expect(m.robots).toMatchObject({ index: true, follow: true });
        expect(m.openGraph).toMatchObject({
          type: "website",
          siteName: "Sammlerraum",
          url: expect.stringMatching(/^https:\/\/sammlerraum[.]de\//u),
          images: expect.any(Array),
        });
        expect(m.twitter).toMatchObject({ card: "summary_large_image", images: expect.any(Array) });
      }
    },
  );
  it("uses the configured runtime origin, not an invented build host", () => {
    expect(marketingMetadata("pricing", "de", "https://sammlerraum.de").alternates).toMatchObject({
      canonical: "/de/preise",
      languages: { "de-DE": "/de/preise", en: "/en/pricing", "x-default": "/de/preise" },
    });
    expect(
      new URL(String(marketingMetadata("home", "en", "https://preview.example.test").metadataBase))
        .origin,
    ).toBe("https://preview.example.test");
  });
  it("rejects origins with credentials, private path/query, non-web scheme or fragments", () => {
    for (const origin of [
      "https://u:secret@example.test",
      "https://example.test/private",
      "https://example.test?token=private",
      "file:///private",
      "https://example.test/#secret",
    ])
      expect(() => siteOrigin(origin)).toThrow();
  });
});
