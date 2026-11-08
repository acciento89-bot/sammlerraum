import { it, expect } from "vitest";
it("keeps pricing and own billing destinations when changing language without copying query inputs", async () => {
  const path = "./billing-locale-navigation";
  const module = await import(path).catch(() => null);
  expect(module?.billingLocaleHref).toBeTypeOf("function");
  expect(module!.billingLocaleHref("/de/account/billing", "en")).toBe("/en/account/billing");
  expect(module!.billingLocaleHref("/en/pricing", "de")).toBe("/de/pricing");
  expect(module!.billingLocaleHref("/de/search", "en")).toBeNull();
  expect(module!.billingLocaleHref("/de/account/billing", "foreign")).toBeNull();
});
