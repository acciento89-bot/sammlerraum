import { describe, expect, it } from "vitest";

import { selectLocale } from "./routing";

describe("selectLocale", () => {
  it("uses the explicit locale cookie before the browser language", () => {
    expect(selectLocale("en", "de-DE,de;q=0.9")).toBe("en");
  });

  it("uses the first supported language from Accept-Language", () => {
    expect(selectLocale(undefined, "fr-CH, en;q=0.9, de;q=0.8")).toBe("en");
  });

  it("falls back to German for missing or unsupported preferences", () => {
    expect(selectLocale("fr", "fr-CH, it;q=0.8")).toBe("de");
    expect(selectLocale(undefined, null)).toBe("de");
  });
});
