import { HistoricalMoneyValueSchema } from "@sammlerraum/contracts/legacy-money";
/** A historical integer has no implied scale. Interpretation is supplied separately. */
export function displayCatalogMoney(
  money: { amountMinor: number; currency: string },
  _locale: "de" | "en",
): string {
  const raw = HistoricalMoneyValueSchema.parse(money);
  return `${raw.amountMinor} ${raw.currency}`;
}
