import {
  AuthoringReceiptSchema,
  LegacyMoneyIdSchema,
  LegacyMoneyAuthoringSchema,
  LegacyRawMoneySchema,
  HistoricalCurrencySchema,
  LegacyUnitDeclarationSchema,
  formatLegacyMinorUnits,
  legacyMoneyFail,
  LEGACY_MONEY_MAX_RAW,
  LEGACY_MONEY_AUTHORITY_HASH,
  type AuthoringReceipt,
} from "@sammlerraum/contracts/legacy-money";
import {
  CURRENCY_AUTHORITY_SHA256,
  CURRENCY_AUTHORITY_VERSION,
  currencyMinorUnitExponent,
} from "./currencies";

function currentExponent(currency: string): number {
  try {
    return currencyMinorUnitExponent(currency);
  } catch {
    return legacyMoneyFail("LEGACY_MONEY_INTERPRETATION_UNSUPPORTED");
  }
}
/** Only explicit new authoring selects the pinned current unit and exponent. */
export function parseLegacyMoneyAuthoring(input: unknown): AuthoringReceipt {
  const parsed = LegacyMoneyAuthoringSchema.safeParse(input);
  if (!parsed.success) return legacyMoneyFail("LEGACY_MONEY_INVALID");
  const authored = parsed.data,
    exponent = currentExponent(authored.currency),
    unitKey = `${CURRENCY_AUTHORITY_VERSION}:${authored.currency}`;
  let amountMinor: string;
  if (authored.kind === "RAW") {
    if (authored.exponent !== exponent || authored.unitKey !== unitKey)
      return legacyMoneyFail("LEGACY_MONEY_INVALID");
    amountMinor = authored.amountMinor;
  } else {
    const match = /^([0-9]+)(?:[.,]([0-9]+))?$/u.exec(authored.decimal);
    if (!match || (match[2] !== undefined && (exponent === 0 || match[2].length > exponent)))
      return legacyMoneyFail("LEGACY_MONEY_INVALID");
    const minor =
      BigInt(match[1]!) * 10n ** BigInt(exponent) +
      BigInt((match[2] ?? "").padEnd(exponent, "0") || "0");
    if (minor > BigInt(LEGACY_MONEY_MAX_RAW)) return legacyMoneyFail("LEGACY_MONEY_INVALID");
    amountMinor = minor.toString();
  }
  if (CURRENCY_AUTHORITY_SHA256 !== LEGACY_MONEY_AUTHORITY_HASH)
    return legacyMoneyFail("LEGACY_MONEY_INTERPRETATION_UNSUPPORTED");
  return AuthoringReceiptSchema.parse({
    schemaVersion: 1,
    profileId: authored.profileId,
    authorityHash: CURRENCY_AUTHORITY_SHA256,
    raw: { amountMinor, currency: authored.currency },
    exponent,
    unitKey,
    normalizedDecimal: formatLegacyMinorUnits(amountMinor, exponent),
  });
}
/** Caller supplies evidenced stored scale. No current currency lookup is performed. */
export function formatStoredMoney(raw: unknown, exponent: number): string {
  const result = LegacyRawMoneySchema.safeParse(raw);
  if (!result.success) return legacyMoneyFail("LEGACY_MONEY_INVALID");
  return formatLegacyMinorUnits(result.data.amountMinor, exponent);
}
export function validateLegacyUnit(
  currency: string,
  unit: unknown,
  assertionId: string,
): {
  unitKey: string;
  eligibility: "ELIGIBLE" | "UNIT_UNSUPPORTED";
} {
  const code = HistoricalCurrencySchema.safeParse(currency),
    declaration = LegacyUnitDeclarationSchema.safeParse(unit);
  if (!code.success || !declaration.success || !LegacyMoneyIdSchema.safeParse(assertionId).success)
    return legacyMoneyFail("LEGACY_MONEY_INVALID");
  if (declaration.data.kind === "UNSUPPORTED")
    return { unitKey: `unsupported:${assertionId}`, eligibility: "UNIT_UNSUPPORTED" };
  currentExponent(code.data);
  if (declaration.data.unitKey !== `${CURRENCY_AUTHORITY_VERSION}:${code.data}`)
    return legacyMoneyFail("LEGACY_MONEY_INVALID");
  return { unitKey: declaration.data.unitKey, eligibility: "ELIGIBLE" };
}
