/** Global provider facts only. Bigint stays internal; future JSON DTOs use decimal strings. */
export const observationKinds = [
  "LAST_SOLD",
  "SOLD_AVERAGE",
  "SOLD_MEDIAN",
  "ASKING_PRICE",
  "PRICE_RANGE",
  "CATALOG_VALUE",
  "DEALER_PRICE",
] as const;
export type MarketObservationKind = (typeof observationKinds)[number];
export type SourceQualifiers = Readonly<Record<string, string | boolean>>;
export type ObservationTime =
  | { basis: "SOURCE"; precision: "SECOND" | "MILLISECOND" | "DAY"; value: string }
  | { basis: "FETCH"; precision: "MILLISECOND" };
export type CatalogMarketTarget = {
  entryId: string;
  variantId: string | null;
  revision: number;
  identifierId: string;
  namespace: string;
  identifierType: string;
  externalId: string;
};
export type MarketFetchRequest = { pollId: string; target: CatalogMarketTarget };
export type SourceConfidence = { sourceLabel?: string; sampleSize?: number; methodology?: string };
type Common = {
  externalId: string;
  identity: { mode: "EVENT"; eventId: string } | { mode: "POLL" };
  sourceMetric: string;
  currency: string;
  qualifiers: SourceQualifiers;
  time: ObservationTime;
  sourceUrl?: string;
  sourceReference?: string;
  confidence?: SourceConfidence;
};
export type MarketObservation = Common &
  (
    | { kind: Exclude<MarketObservationKind, "PRICE_RANGE">; amountMinor: bigint }
    | { kind: "PRICE_RANGE"; lowMinor: bigint; highMinor: bigint }
  );
export interface MarketDataProvider {
  readonly id: string;
  fetch(
    request: MarketFetchRequest,
    context?: { signal: AbortSignal },
  ): Promise<MarketObservation[]>;
}
export type RecordContext = { request: MarketFetchRequest; fetchedAt: string };

/** Task6 injects a distributed, credential-scoped permit around EVERY HTTP attempt/page.
 * Implementations must enforce actual request spacing, cancellation and independent call budgets.
 * A queue singleton or a process-local timer does not implement this contract.
 */
export interface MarketRequestPermit {
  run<T>(
    context: { credentialKey: string; signal: AbortSignal },
    send: () => Promise<T>,
  ): Promise<T>;
}
