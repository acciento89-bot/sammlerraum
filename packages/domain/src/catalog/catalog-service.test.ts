import { describe, expect, it } from "vitest";

import { catalogTextForLocale, serializeCatalogSnapshot } from "./catalog-service";

describe("authored catalog snapshots", () => {
  it("uses explicit authored translations with primary-language fallback", () => {
    const text = {
      language: "pl",
      title: "Moneta",
      description: "Opis",
      translations: [{ language: "de", title: "Münze", description: "Beschreibung" }],
    };
    expect(catalogTextForLocale(text, "de")).toEqual({
      title: "Münze",
      description: "Beschreibung",
    });
    expect(catalogTextForLocale(text, "en")).toEqual({ title: "Moneta", description: "Opis" });
  });

  it("serializes nested canonical data deterministically without losing decimal precision", () => {
    expect(
      serializeCatalogSnapshot({
        b: [{ z: "12345678901234567890.123456789012345678", a: false }],
        a: 1,
      }),
    ).toBe('{"a":1,"b":[{"a":false,"z":"12345678901234567890.123456789012345678"}]}');
  });
});
