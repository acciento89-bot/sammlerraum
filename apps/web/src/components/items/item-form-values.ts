import type {
  CanonicalCustomFieldValue,
  CustomFieldType,
} from "@sammlerraum/contracts/custom-fields";

export const itemCurrencyOptions = ["EUR", "USD", "CHF", "GBP"] as const;

export function minorUnits(input: string): number | null {
  if (input.trim() === "") return null;
  const normalized = input.trim().replace(",", ".");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) throw new Error("money");
  const whole = match[1];
  if (whole === undefined) throw new Error("money");
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const amount = BigInt(whole) * 100n + BigInt(fraction || "0");
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("money");
  return Number(amount);
}

export function majorUnits(amount: number | null): string {
  if (amount === null) return "";
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("money");
  const whole = Math.floor(amount / 100);
  const cents = amount % 100;
  return `${whole}.${String(cents).padStart(2, "0")}`;
}

export function integerCustomFieldValue(input: string): number {
  return Number.parseInt(input, 10);
}

export function tagsInputValue(tags: string[]): string {
  return tags.join(", ");
}

export function tagsFromInput(input: string): string[] {
  return input
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function displayCustomFieldValue(
  value: CanonicalCustomFieldValue,
  _type?: CustomFieldType,
  _locale?: "de" | "en",
): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return `${majorUnits(value.amountMinor)} ${value.currency}`;
  if (typeof value === "boolean") return value ? "✓" : "—";
  return String(value);
}
