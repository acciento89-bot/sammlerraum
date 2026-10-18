import { currencyMinorUnitExponent } from "./currencies";

export type Money = { amountMinor: bigint; currency: string };
export const MAX_AMOUNT_MINOR = 9223372036854775807n;

/** Explicit locale grammar; no floating point, currency inference or FX conversion. */
export function parseLocalizedMoney(input: string, locale: "de" | "en", currency: string): Money {
  if (typeof input !== "string" || input.length > 80 || (locale !== "de" && locale !== "en"))
    throw new Error("Invalid localized money");
  const exponent = currencyMinorUnitExponent(currency);
  const decimal = locale === "de" ? "," : ".";
  const group = locale === "de" ? "." : ",";
  const parts = input.trim().split(decimal);
  const integer = parts[0]!;
  const fraction = parts[1];
  const grouped =
    locale === "de" ? /^[1-9][0-9]{0,2}(?:\.[0-9]{3})+$/u : /^[1-9][0-9]{0,2}(?:,[0-9]{3})+$/u;
  if (
    parts.length > 2 ||
    (!/^[0-9]+$/u.test(integer) && !grouped.test(integer)) ||
    (fraction !== undefined &&
      (exponent === 0 || !/^[0-9]+$/u.test(fraction) || fraction.length > exponent))
  )
    throw new Error("Invalid localized money");
  const amountMinor = BigInt(
    integer.replaceAll(group, "") + (fraction ?? "").padEnd(exponent, "0"),
  );
  if (amountMinor > MAX_AMOUNT_MINOR) throw new Error("Money exceeds PostgreSQL bigint range");
  return { amountMinor, currency };
}
