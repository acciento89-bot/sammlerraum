import { z } from "zod";
import { AmountMinorSchema, ManualValuationInputSchema } from "@sammlerraum/contracts/valuations";
import { parseLocalizedMoney } from "@sammlerraum/domain/money/money";

export type Locale = "de" | "en";
const storedMoney = z.object({
  amountMinor: AmountMinorSchema,
  currency: z.string().regex(/^[A-Z]{3}$/u),
  minorUnitExponent: z.number().int().min(0).max(4),
});
export function formatValuationMoney(money: z.infer<typeof storedMoney>, locale: Locale): string {
  const { amountMinor, currency, minorUnitExponent: exponent } = storedMoney.parse(money);
  const exact = BigInt(amountMinor),
    scale = 10n ** BigInt(exponent);
  const fraction = String(exact % scale).padStart(exponent, "0");
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "code",
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  })
    .formatToParts(exact / scale)
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
}
export type ManualDraft = {
  amount: string;
  currency: string;
  note: string;
  earlier: boolean;
  date: string;
  time: string;
};
export const emptyDraft = (): ManualDraft => ({
  amount: "",
  currency: "EUR",
  note: "",
  earlier: false,
  date: "",
  time: "",
});
export function manualInput(draft: ManualDraft, locale: Locale) {
  const money = parseLocalizedMoney(draft.amount, locale, draft.currency);
  let observedAt: string | undefined;
  if (draft.earlier) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/u.test(draft.date) ||
      !/^\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/u.test(draft.time)
    )
      throw new Error("Invalid UTC time");
    const [clock, fractional = ""] = draft.time.split(".");
    observedAt = `${draft.date}T${clock!.length === 5 ? `${clock}:00` : clock}.${fractional.padEnd(3, "0")}Z`;
  }
  return ManualValuationInputSchema.parse({
    amountMinor: money.amountMinor.toString(),
    currency: draft.currency,
    note: draft.note,
    ...(observedAt ? { observedAt } : {}),
  });
}
export function observationTime(instant: string, precision: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(precision === "DAY"
      ? {}
      : {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23",
          ...(precision === "MILLISECOND" ? { fractionalSecondDigits: 3 as const } : {}),
        }),
  }).format(new Date(instant));
}
export function safeSourceUrl(value: string | null): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash
      ? url
      : null;
  } catch {
    return null;
  }
}
