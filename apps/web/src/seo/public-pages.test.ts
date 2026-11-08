import { describe, expect, it } from "vitest";
import { PUBLIC_MARKETING_PAGES, marketingLocaleHref } from "./public-pages";
describe("bounded bilingual marketing registry", () => {
  it("lists only deliberate public home/features/pricing canonicals", () => {
    expect(PUBLIC_MARKETING_PAGES).toEqual({
      home: { de: "/de", en: "/en" },
      features: { de: "/de/funktionen", en: "/en/features" },
      pricing: { de: "/de/preise", en: "/en/pricing" },
    });
  });
  it("maps canonical and legacy marketing paths to the actual translated pair", () => {
    expect(marketingLocaleHref("/de/pricing", "de")).toBe("/de/preise");
    expect(marketingLocaleHref("/de/preise", "en")).toBe("/en/pricing");
    expect(marketingLocaleHref("/en/features", "de")).toBe("/de/funktionen");
    expect(marketingLocaleHref("/de", "en")).toBe("/en");
  });
  it("never treats private/token/query/foreign URLs as marketing navigation", () => {
    for (const path of [
      "/de/account/billing",
      "/share/private-token",
      "https://foreign.test/de",
      "/de/pricing?session=private",
      "/de/search",
    ])
      expect(marketingLocaleHref(path, "en")).toBeNull();
  });
});
