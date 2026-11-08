import { describe, it, expect } from "vitest";
import {
  CreateWishlistEntrySchema,
  WishlistTargetPriceSchema,
  WishlistListQuerySchema,
} from "./wishlist";
describe("bounded private wishlist inputs", () => {
  it.each(["not-money", "-1", "1.5", "01", "9".repeat(100000)])(
    "rejects malformed amounts without throwing or parsing arbitrary big integers",
    (amountMinor) => {
      const result = () =>
        WishlistTargetPriceSchema.safeParse({ amountMinor, currency: "EUR", minorUnitExponent: 2 });
      expect(result).not.toThrow();
      expect(result().success).toBe(false);
    },
  );
  it("requires a coherent optional catalog reference and bounded private text", () => {
    expect(
      CreateWishlistEntrySchema.safeParse({
        title: "Desired",
        catalogVariantId: "00000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(false);
    for (const title of ["", "x".repeat(201), "bad\u0000", "bad\ud800"])
      expect(CreateWishlistEntrySchema.safeParse({ title }).success).toBe(false);
    expect(
      CreateWishlistEntrySchema.safeParse({ title: "Own wishlist", ownerId: "forged" }).success,
    ).toBe(false);
    expect(WishlistListQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
  });
});
