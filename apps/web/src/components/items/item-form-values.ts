import type {
  CanonicalCustomFieldValue,
  CustomFieldType,
} from "@sammlerraum/contracts/custom-fields";

export const itemCurrencyOptions = Intl.supportedValuesOf("currency");

function currencyFractionDigits(currency: string): number {
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
    .maximumFractionDigits;
}

export function minorUnits(input: string, currency = "EUR"): number | null {
  if (input.trim() === "") return null;
  const digits = currencyFractionDigits(currency);
  const normalized = input.trim().replace(",", ".");
  const pattern = new RegExp(
    digits === 0 ? "^(\\d+)$" : `^(\\d+)(?:\\.(\\d{1,${digits}}))?$`,
  );
  const match = pattern.exec(normalized);
  if (!match) throw new Error("money");
  const whole = match[1];
  if (whole === undefined) throw new Error("money");
  const fraction = (match[2] ?? "").padEnd(digits, "0");
  const scale = 10n ** BigInt(digits);
  const amount = BigInt(whole) * scale + BigInt(fraction || "0");
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("money");
  return Number(amount);
}

export function majorUnits(amount: number | null, currency = "EUR"): string {
  if (amount === null) return "";
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("money");
  const digits = currencyFractionDigits(currency);
  const scale = 10n ** BigInt(digits);
  const exact = BigInt(amount);
  const whole = exact / scale;
  if (digits === 0) return String(whole);
  const fraction = String(exact % scale).padStart(digits, "0");
  return `${whole}.${fraction}`;
}

export function integerCustomFieldValue(input: string): number {
  const value = Number(input);
  if (!Number.isSafeInteger(value)) throw new Error("integer");
  return value;
}

export function tagsInputValue(tags: string[]): string {
  return tags
    .map((tag) => tag.replaceAll("\\", "\\\\").replaceAll(",", "\\,"))
    .join(", ");
}

export function tagsFromInput(input: string): string[] {
  const tags: string[] = [];
  let current = "";
  let escaped = false;
  for (const character of input) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === ",") {
      if (current.trim()) tags.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  if (escaped) current += "\\";
  if (current.trim()) tags.push(current.trim());
  return tags;
}

function localizeCanonicalDecimal(value: string, locale: "de" | "en"): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match?.[2]) return value;
  const parts = new Intl.NumberFormat(locale).formatToParts(1000.1);
  const group = parts.find((part) => part.type === "group")?.value ?? ",";
  const decimal = parts.find((part) => part.type === "decimal")?.value ?? ".";
  const grouped = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return `${match[1] ?? ""}${grouped}${match[3] ? decimal + match[3] : ""}`;
}

export function displayCustomFieldValue(
  value: CanonicalCustomFieldValue,
  type?: CustomFieldType,
  locale: "de" | "en" = "en",
): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") {
    return `${localizeCanonicalDecimal(majorUnits(value.amountMinor, value.currency), locale)} ${value.currency}`;
  }
  if (typeof value === "boolean") return value ? "✓" : "—";
  if (type === "DATE" && typeof value === "string") {
    return new Intl.DateTimeFormat(locale, { timeZone: "UTC" }).format(
      new Date(`${value}T00:00:00.000Z`),
    );
  }
  if (type === "DECIMAL" && typeof value === "string") {
    return localizeCanonicalDecimal(value, locale);
  }
  return String(value);
}
