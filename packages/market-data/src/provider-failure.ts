const codes = {
  PROVIDER_CONFIGURATION: false,
  PROVIDER_DISABLED: false,
  INVALID_MAPPING: false,
  INVALID_RESPONSE: false,
  ACCESS_DENIED: false,
  TRANSPORT: true,
  TRANSPORT_UNCERTAIN: true,
  RATE_LIMITED: true,
  PROVIDER_UNAVAILABLE: true,
  INTERRUPTED: true,
  PERMIT_UNAVAILABLE: true,
  PERMIT_UNCERTAIN: true,
} as const;
export type ProviderFailureCode = keyof typeof codes;
/** No vendor strings, status text, URL, body, cause or foreign stack can enter this error. */
export class ProviderFailure extends Error {
  readonly code: ProviderFailureCode;
  readonly retryable: boolean;
  constructor(code: ProviderFailureCode) {
    const safe = typeof code === "string" && Object.hasOwn(codes, code) ? code : "INVALID_RESPONSE";
    super(safe);
    this.name = "ProviderFailure";
    this.code = safe;
    this.retryable = codes[safe];
    this.stack = `ProviderFailure: ${safe}`;
    Object.freeze(this);
  }
}
export function checkSignal(signal: AbortSignal): void {
  if (signal.aborted) throw new ProviderFailure("INTERRUPTED");
}
