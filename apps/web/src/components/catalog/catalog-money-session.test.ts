import { afterEach, expect, it } from "vitest";
import {
  clearCatalogMoneySessions,
  recallCatalogMoneySession,
  rememberCatalogMoneySession,
} from "./catalog-money-session";
afterEach(clearCatalogMoneySessions);
it("retains only private bounded monetary operation context across locale remount and keeps uncertainty across reopening", () => {
  const value = {
    kind: "CREATE_ENTRY" as const,
    categoryId: "",
    variantId: "",
    identifierId: "",
    baseRevision: null,
    summary: "Private explanation",
    outcome: "UNKNOWN" as const,
    proposalId: "",
  };
  rememberCatalogMoneySession("owner-a", "new", value);
  expect(recallCatalogMoneySession("owner-a", "new")).toEqual(value);
  const copy = recallCatalogMoneySession("owner-a", "new")!;
  copy.summary = "Different";
  expect(recallCatalogMoneySession("owner-a", "new")?.summary).toBe("Private explanation");
  expect(recallCatalogMoneySession("owner-b", "new")).toBeUndefined();
  expect(recallCatalogMoneySession("owner-a", "new")).toBeUndefined();
});
