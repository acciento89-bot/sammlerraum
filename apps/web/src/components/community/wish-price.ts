export function parseWishPrice(raw: string, currency: string) {
  const text = raw.trim();
  if (!text) return null;
  if (!["EUR", "USD", "GBP"].includes(currency) || !/^\d{1,17}(?:[.,]\d{1,2})?$/.test(text))
    throw Error("Invalid prospective price");
  const [whole, fraction = ""] = text.split(/[.,]/),
    minor = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (minor > 9223372036854775807n) throw Error("Prospective price too large");
  return { amountMinor: minor.toString(), currency, minorUnitExponent: 2 };
}
export function formatWishPrice(
  value: { amountMinor: string; currency: string; minorUnitExponent: number },
  locale: string,
) {
  const scale = 10n ** BigInt(value.minorUnitExponent),
    minor = BigInt(value.amountMinor),
    fraction = (minor % scale).toString().padStart(value.minorUnitExponent, "0");
  return new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-GB", {
    style: "currency",
    currency: value.currency,
    minimumFractionDigits: value.minorUnitExponent,
    maximumFractionDigits: value.minorUnitExponent,
  })
    .formatToParts(minor / scale)
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
}
