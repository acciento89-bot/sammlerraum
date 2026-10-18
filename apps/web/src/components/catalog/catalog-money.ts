import { displayCustomFieldValue } from "../items/item-form-values";
/** Exact digits only; the existing legacy currency-scale interpretation is unchanged. */
export function displayCatalogMoney(
  money: { amountMinor: number; currency: string },
  locale: "de" | "en",
): string {
  return displayCustomFieldValue(money, "MONEY", locale);
}
