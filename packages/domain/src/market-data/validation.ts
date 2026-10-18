import {
  observationKinds,
  type CatalogMarketTarget,
  type MarketFetchRequest,
  type SourceConfidence,
  type SourceQualifiers,
} from "@sammlerraum/market-data/types";
import { currencyMinorUnitExponent } from "../money/currencies";
import { MAX_AMOUNT_MINOR } from "../money/money";
export class MarketDataError extends Error {
  constructor(
    readonly code:
      | "MARKET_INPUT_INVALID"
      | "MARKET_CATALOG_MISMATCH"
      | "MARKET_CATALOG_STALE"
      | "MARKET_OBSERVATION_CONFLICT",
  ) {
    super(code);
    this.name = "MarketDataError";
  }
}
export const invalid = (): never => {
  throw new MarketDataError("MARKET_INPUT_INVALID");
};
export function object(input: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (
    input === null ||
    typeof input !== "object" ||
    Object.getPrototypeOf(input) !== Object.prototype ||
    Reflect.ownKeys(input).some(
      (k) =>
        typeof k !== "string" ||
        (keys && !keys.includes(k)) ||
        !Object.getOwnPropertyDescriptor(input, k)?.enumerable ||
        !("value" in Object.getOwnPropertyDescriptor(input, k)!) ||
        (input as Record<string, unknown>)[k] === undefined,
    )
  )
    return invalid();
  return input as Record<string, unknown>;
}
export function text(input: unknown, max: number, multiline = false): string {
  if (
    typeof input !== "string" ||
    /[\uD800-\uDFFF]/u.test(input) ||
    input.length === 0 ||
    Buffer.byteLength(input) > max ||
    (multiline ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u : /[\x00-\x1f\x7f]/u).test(input)
  )
    return invalid();
  return input;
}
export function uuid(input: unknown): string {
  if (
    typeof input !== "string" ||
    input.length !== 36 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(input)
  )
    return invalid();
  return input.toLowerCase();
}
export function instant(input: unknown): Date {
  if (
    typeof input !== "string" ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/u.test(input) ||
    input.startsWith("0000")
  )
    return invalid();
  const result = new Date(input);
  if (!Number.isFinite(result.getTime()) || result.toISOString() !== input) return invalid();
  return result;
}
export function stable(value: unknown): string {
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
// Matches JSONB's spaced output byte count, independently of its object-key ordering.
function jsonbText(value: unknown): string {
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .map(([key, val]) => `${JSON.stringify(key)}: ${jsonbText(val)}`)
      .join(", ")}}`;
  return JSON.stringify(value);
}
function jsonbSize(value: Record<string, unknown>): number {
  return Buffer.byteLength(jsonbText(value));
}

export function target(input: unknown): CatalogMarketTarget {
  const v = object(input, [
    "entryId",
    "variantId",
    "revision",
    "identifierId",
    "namespace",
    "identifierType",
    "externalId",
  ]);
  if (
    typeof v.revision !== "number" ||
    !Number.isInteger(v.revision) ||
    v.revision < 1 ||
    v.revision > 2147483647
  )
    return invalid();
  return {
    entryId: uuid(v.entryId),
    variantId: v.variantId === null ? null : uuid(v.variantId),
    revision: v.revision,
    identifierId: uuid(v.identifierId),
    namespace: text(v.namespace, 64),
    identifierType: text(v.identifierType, 64),
    externalId: text(v.externalId, 256),
  };
}
export function request(input: unknown): MarketFetchRequest {
  const v = object(input, ["pollId", "target"]);
  return { pollId: uuid(v.pollId), target: target(v.target) };
}
export function qualifiers(input: unknown): SourceQualifiers {
  const v = object(input);
  if (Object.keys(v).length > 16) return invalid();
  for (const [key, value] of Object.entries(v)) {
    text(key, 64);
    if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/u.test(key)) return invalid();
    if (typeof value !== "boolean") text(value, 128);
  }
  if (jsonbSize(v) > 1024) return invalid();
  return { ...v } as SourceQualifiers;
}
function confidence(input: unknown): SourceConfidence | null {
  if (input === undefined) return null;
  const v = object(input, ["sourceLabel", "sampleSize", "methodology"]);
  if (Object.keys(v).length === 0) return invalid();
  if (v.sourceLabel !== undefined) text(v.sourceLabel, 128);
  if (v.methodology !== undefined) text(v.methodology, 512, true);
  if (
    v.sampleSize !== undefined &&
    (typeof v.sampleSize !== "number" ||
      !Number.isInteger(v.sampleSize) ||
      v.sampleSize < 0 ||
      v.sampleSize > 2147483647)
  )
    return invalid();
  return { ...v } as SourceConfidence;
}
export function parseBatch(providerId: string, observations: unknown, context: unknown) {
  if (!Array.isArray(observations) || observations.length > 100) return invalid();
  const c = object(context, ["request", "fetchedAt"]);
  const req = request(c.request);
  const fetchedAt = instant(c.fetchedAt);
  const rows = observations.map((input) => {
    const v = object(input, [
      "externalId",
      "identity",
      "sourceMetric",
      "kind",
      "amountMinor",
      "lowMinor",
      "highMinor",
      "currency",
      "qualifiers",
      "time",
      "sourceUrl",
      "sourceReference",
      "confidence",
    ]);
    const externalId = text(v.externalId, 256);
    if (externalId !== req.target.externalId) return invalid();
    const identity = object(v.identity, ["mode", "eventId"]);
    if (identity.mode !== "EVENT" && identity.mode !== "POLL") return invalid();
    const eventId = identity.mode === "EVENT" ? text(identity.eventId, 256) : null;
    if (identity.mode === "POLL" && Object.hasOwn(identity, "eventId")) return invalid();
    const sourceMetric = text(v.sourceMetric, 64);
    if (!/^[a-z][a-z0-9_.:-]{0,63}$/u.test(sourceMetric)) return invalid();
    if (!observationKinds.includes(v.kind as never)) return invalid();
    const kind = v.kind as (typeof observationKinds)[number];
    const amount = (n: unknown) => {
      if (typeof n !== "bigint" || n < 0n || n > MAX_AMOUNT_MINOR) return invalid();
      return n;
    };
    const amountMinor = kind === "PRICE_RANGE" ? null : amount(v.amountMinor);
    const lowMinor = kind === "PRICE_RANGE" ? amount(v.lowMinor) : null;
    const highMinor = kind === "PRICE_RANGE" ? amount(v.highMinor) : null;
    if (
      kind === "PRICE_RANGE"
        ? Object.hasOwn(v, "amountMinor") || lowMinor! > highMinor!
        : Object.hasOwn(v, "lowMinor") || Object.hasOwn(v, "highMinor")
    )
      return invalid();
    const currency = text(v.currency, 3);
    let minorUnitExponent: number;
    try {
      minorUnitExponent = currencyMinorUnitExponent(currency);
    } catch {
      return invalid();
    }
    const q = qualifiers(v.qualifiers);
    const conf = confidence(v.confidence);
    const time = object(v.time, ["basis", "precision", "value"]);
    let observedAt: Date;
    if (time.basis === "FETCH") {
      if (time.precision !== "MILLISECOND" || Object.hasOwn(time, "value")) return invalid();
      observedAt = fetchedAt;
    } else if (time.basis === "SOURCE") {
      if (time.precision === "DAY") {
        if (typeof time.value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(time.value))
          return invalid();
        observedAt = instant(`${time.value}T00:00:00.000Z`);
      } else if (time.precision === "SECOND" || time.precision === "MILLISECOND") {
        observedAt = instant(time.value);
        if (time.precision === "SECOND" && observedAt.getUTCMilliseconds() !== 0) return invalid();
      } else return invalid();
    } else return invalid();
    if (observedAt > fetchedAt) return invalid();
    const sourceUrl = v.sourceUrl === undefined ? null : text(v.sourceUrl, 2048);
    if (sourceUrl !== null) {
      let u: URL;
      try {
        u = new URL(sourceUrl);
      } catch {
        return invalid();
      }
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        u.search ||
        u.hash ||
        sourceUrl.includes("?") ||
        sourceUrl.includes("#") ||
        u.href !== sourceUrl
      )
        return invalid();
    }
    const sourceReference = v.sourceReference === undefined ? null : text(v.sourceReference, 512);
    if (jsonbSize({ qualifiers: q, confidence: conf, sourceUrl, sourceReference }) > 4096)
      return invalid();
    return {
      providerId,
      externalId,
      identityMode: identity.mode as "EVENT" | "POLL",
      eventId,
      pollId: identity.mode === "POLL" ? req.pollId : null,
      sourceMetric,
      kind,
      entryId: req.target.entryId,
      variantId: req.target.variantId,
      catalogRevision: req.target.revision,
      identifierId: req.target.identifierId,
      identifierNamespace: req.target.namespace,
      identifierType: req.target.identifierType,
      qualifiers: q,
      currency,
      minorUnitExponent,
      amountMinor,
      lowMinor,
      highMinor,
      observedAt,
      fetchedAt,
      observedBasis: time.basis as "SOURCE" | "FETCH",
      observedPrecision: time.precision as "DAY" | "SECOND" | "MILLISECOND",
      sourceUrl,
      sourceReference,
      confidence: conf,
    };
  });
  if (Buffer.byteLength(stable(rows)) > 262144) return invalid();
  return { request: req, fetchedAt, rows };
}
export type NormalizedObservation = ReturnType<typeof parseBatch>["rows"][number];
export function identityKey(row: NormalizedObservation) {
  return stable([
    row.providerId,
    row.externalId,
    row.identityMode,
    row.eventId ?? row.pollId,
    row.sourceMetric,
    row.kind,
    row.currency,
    row.qualifiers,
  ]);
}
export function semantic(row: NormalizedObservation) {
  const {
    fetchedAt: _fetched,
    catalogRevision: _revision,
    identifierId: _identifier,
    observedAt,
    ...rest
  } = row;
  return stable({ ...rest, observedAt: row.observedBasis === "FETCH" ? null : observedAt });
}
