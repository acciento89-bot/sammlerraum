import { ProviderFailure } from "./provider-failure";
import { text, numericLexeme } from "./exact-json";
import type { MarketFetchRequest, MarketObservation, SourceQualifiers } from "./types";
import type { MoneyCapabilities } from "./provider-http";
export function selector(request: MarketFetchRequest, service: string, type: string): string[] {
  try {
    if (request.target.namespace !== service || request.target.identifierType !== type)
      throw Error();
    const id = request.target.externalId;
    if (typeof id !== "string" || Buffer.byteLength(id) > 256) throw Error();
    const parsed: unknown = JSON.parse(id);
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 4 ||
      JSON.stringify(parsed) !== id ||
      parsed[0] !== "v1"
    )
      throw Error();
    return parsed.map((v) => text(v));
  } catch {
    throw new ProviderFailure("INVALID_MAPPING");
  }
}
export function observation(
  request: MarketFetchRequest,
  metric: string,
  currency: string,
  qualifiers: SourceQualifiers,
  value: unknown,
  major: boolean,
  money: MoneyCapabilities,
): MarketObservation {
  try {
    let lexeme = numericLexeme(value, major);
    if (major && lexeme.includes(".")) lexeme = lexeme.replace(/0+$/u, "").replace(/\.$/u, "");
    const amountMinor = major
      ? money.parseMajorUnits(lexeme, currency)
      : money.validateMinorUnits(BigInt(lexeme), currency);
    return {
      externalId: request.target.externalId,
      identity: { mode: "POLL" },
      sourceMetric: metric,
      kind: "CATALOG_VALUE",
      amountMinor,
      currency,
      qualifiers,
      time: { basis: "FETCH", precision: "MILLISECOND" },
      confidence: {
        methodology: "Current provider guide statistic; not an individual completed sale.",
      },
    };
  } catch {
    throw new ProviderFailure("INVALID_RESPONSE");
  }
}
