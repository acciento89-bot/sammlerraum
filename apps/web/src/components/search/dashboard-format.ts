type Locale = "de" | "en";
const formats = new Map<Locale, { integer: Intl.NumberFormat; decimal: string; minus: string }>();
function symbols(locale: Locale) {
  if (locale !== "de" && locale !== "en") throw new Error("Unsupported dashboard locale");
  let result = formats.get(locale);
  if (!result) {
    const language = locale === "de" ? "de-DE" : "en-US";
    const integer = new Intl.NumberFormat(language, {
      maximumFractionDigits: 0,
      useGrouping: true,
    });
    const decimal = new Intl.NumberFormat(language, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })
      .formatToParts(0n)
      .find((part) => part.type === "decimal")!.value;
    const minus = integer.formatToParts(-1n).find((part) => part.type === "minusSign")!.value;
    result = { integer, decimal, minus };
    formats.set(locale, result);
  }
  return result;
}
function canonical(value: string, signed: boolean) {
  if (
    typeof value !== "string" ||
    value.length > 79 ||
    !/^(?:0|-?[1-9][0-9]*)$/u.test(value) ||
    (!signed && value.startsWith("-")) ||
    value.replace(/^-/u, "").length > 78
  )
    throw new Error("Invalid canonical dashboard integer");
  return value;
}
export function formatDashboardInteger(value: string, locale: Locale) {
  return symbols(locale).integer.format(BigInt(canonical(value, false)));
}
/** Exact aggregate formatting with the STORED scale, independent of Intl's
 * currency defaults and the narrower individual-record amount schema. */
export function formatDashboardMoney(value: string, minorUnitExponent: number, locale: Locale) {
  canonical(value, true);
  if (!Number.isInteger(minorUnitExponent) || minorUnitExponent < 0 || minorUnitExponent > 9)
    throw new Error("Unsupported stored exponent");
  const { integer, decimal, minus } = symbols(locale),
    negative = value.startsWith("-");
  const digits = (negative ? value.slice(1) : value).padStart(minorUnitExponent + 1, "0");
  const whole = minorUnitExponent ? digits.slice(0, -minorUnitExponent) : digits;
  const fraction = minorUnitExponent ? decimal + digits.slice(-minorUnitExponent) : "";
  return (negative ? minus : "") + integer.format(BigInt(whole)) + fraction;
}
