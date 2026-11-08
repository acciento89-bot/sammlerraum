import {
  MoneyViewSchema,
  LegacyMoneySubjectSchema,
  type MoneyView,
  type MoneySubject,
  type NewMoneyIntent,
  type ExistingMoneyIntent,
} from "@sammlerraum/contracts/legacy-money";
import { parseLegacyMoneyAuthoring } from "@sammlerraum/domain/money/legacy-money-policy";
/** Successful JSON must describe this operation, not merely a schema-valid older response. */
export function acceptsMoneyAcknowledgement(
  input: MoneyView,
  target: MoneySubject,
  intent: NewMoneyIntent | ExistingMoneyIntent | undefined,
): boolean {
  try {
    const view = MoneyViewSchema.parse(input),
      subject = LegacyMoneySubjectSchema.parse(target);
    if (JSON.stringify(view.subject) !== JSON.stringify(subject)) return false;
    if (!intent) return true;
    if (intent.op === "RETAIN") return view.factToken === intent.expectedFactToken;
    if (intent.op === "CLEAR")
      return (
        view.factToken !== intent.expectedFactToken &&
        view.raw === null &&
        view.interpretation.kind === "MISSING"
      );
    if (intent.op === "REPLACE" && view.factToken === intent.expectedFactToken) return false;
    const receipt = parseLegacyMoneyAuthoring(intent.authoring),
      meaning = view.interpretation;
    return (
      view.raw?.amountMinor === receipt.raw.amountMinor &&
      view.raw.currency === receipt.raw.currency &&
      meaning.kind === "INTERPRETED" &&
      meaning.exponent === receipt.exponent &&
      meaning.unitKey === receipt.unitKey &&
      meaning.basisId === receipt.profileId &&
      meaning.decimal === receipt.normalizedDecimal &&
      meaning.evidenceCategory === null &&
      meaning.eligibility === "ELIGIBLE"
    );
  } catch {
    return false;
  }
}
