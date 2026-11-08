import { describe, expect, it } from "vitest";
import { searchMetadata } from "./search-metadata";
describe("noindex for query/filter/sort/pagination search identities", () => {
  it("keeps search outside public indexing and makes its canonical independent of arbitrary query combinations", () => {
    for (const locale of ["de", "en"] as const) {
      const m = searchMetadata(locale, "https://sammlerraum.de");
      expect(m.robots).toMatchObject({ index: false, follow: true });
      expect(m.alternates?.canonical).toBe(`/${locale}/search`);
      expect(m.openGraph).toBeUndefined();
    }
  });
});
