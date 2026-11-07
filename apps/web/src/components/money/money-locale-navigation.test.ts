import { describe, expect, it } from "vitest";
import { moneyLocaleHref } from "./money-locale-navigation";
const id = "00000000-0000-4000-8000-000000000001";
describe("private money locale navigation", () => {
  it("keeps only recognized item and catalog paths", () => {
    expect(moneyLocaleHref(`/de/items/${id}`, "en", "")).toBe(`/en/items/${id}`);
    for (const tail of ["", "/proposals", "/moderation", `/${id}`])
      expect(moneyLocaleHref(`/en/catalog${tail}`, "de", "")).toBe(`/de/catalog${tail}`);
    for (const path of [
      "/de/items/not-an-id",
      "/de/catalog/unknown",
      "//foreign.invalid",
      "/de/search",
      "/en/dashboard",
    ])
      expect(moneyLocaleHref(path, "en", "")).toBeNull();
  });
  it("preserves only the validated new-item collection identity, never money or evidence", () => {
    expect(
      moneyLocaleHref("/de/items/new", "en", `?collectionId=${id}&amount=PRIVATE&reason=PRIVATE`),
    ).toBe(`/en/items/new?collectionId=${id}`);
    expect(moneyLocaleHref("/de/items/new", "en", "?collectionId=bad&amount=PRIVATE")).toBe(
      "/en/items/new",
    );
    expect(moneyLocaleHref("/de/items/new", "en", `?collectionId=${id}&collectionId=${id}`)).toBe(
      "/en/items/new",
    );
    expect(moneyLocaleHref(`/de/items/${id}`, "en", "?amount=PRIVATE")).toBe(`/en/items/${id}`);
  });
});
