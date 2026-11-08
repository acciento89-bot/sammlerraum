import { describe, it, expect } from "vitest";
import { COLLECTING_CATEGORIES } from "./collecting-categories";
import {
  CatalogKeySchema,
  CatalogLabelsSchema,
  CreateCategoryTemplateInputSchema,
} from "./catalog";
describe("complete collecting category vocabulary", () => {
  it("covers all common collecting families and a specific fallback, without duplicate maintenance keys", () => {
    expect(COLLECTING_CATEGORIES).toHaveLength(36);
    const keys = COLLECTING_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(
      expect.arrayContaining([
        "trading_cards",
        "coins",
        "banknotes",
        "stamps",
        "postcards",
        "comics",
        "books",
        "vinyl",
        "cds_cassettes",
        "movies",
        "videogames",
        "consoles",
        "figures",
        "model_cars",
        "model_railways",
        "model_building",
        "construction_toys",
        "dolls",
        "plush_toys",
        "board_games",
        "watches",
        "jewelry",
        "art",
        "antiques",
        "porcelain_glass",
        "cameras",
        "technology",
        "sports_memorabilia",
        "music_memorabilia",
        "autographs",
        "minerals_fossils",
        "patches_badges",
        "keyrings",
        "advertising",
        "ephemera",
        "other",
      ]),
    );
    expect(COLLECTING_CATEGORIES.at(-1)).toMatchObject({
      key: "other",
      labels: { de: "Sonstiges", en: "Other" },
    });
    for (const c of COLLECTING_CATEGORIES) {
      expect(CatalogKeySchema.safeParse(c.key).success).toBe(true);
      expect(CatalogLabelsSchema.safeParse(c.labels).success).toBe(true);
      expect(c.examples.de.length).toBeGreaterThan(15);
      expect(c.examples.en.length).toBeGreaterThan(15);
      expect(
        CreateCategoryTemplateInputSchema.safeParse({
          key: c.key,
          labels: c.labels,
          definitions: c.fields.map((f) => ({
            key: f[0],
            labels: { de: f[1], en: f[2] },
            type: "SHORT_TEXT",
          })),
        }).success,
      ).toBe(true);
    }
  });
});
