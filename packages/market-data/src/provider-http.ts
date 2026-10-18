import { createHash } from "node:crypto";
import { ProviderFailure, checkSignal } from "./provider-failure";
import { decodeExactJson, requireExactJsonRuntime } from "./exact-json";
import type { MarketRequestPermit, MarketFetchContext } from "./types";
export type MoneyCapabilities = {
  parseMajorUnits(value: string, currency: string): bigint;
  validateMinorUnits(value: bigint, currency: string): bigint;
};
export type ProviderDependencies = {
  token: string;
  enabled?: boolean;
  permit: MarketRequestPermit;
  money: MoneyCapabilities;
  fetch?: typeof globalThis.fetch;
  clock?: () => Date;
};
export function validateCredential(value: string): string {
  // HTTP header values are byte strings. Restrict to visible ASCII to preserve exact bytes
  // across header and query transports, without guessing a vendor's token format.
  if (
    typeof value !== "string" ||
    !/^[\x20-\x7e]+$/u.test(value) ||
    value.trim() !== value ||
    value.length > 4096
  )
    throw new ProviderFailure("PROVIDER_CONFIGURATION");
  return value;
}
export function credentialKey(service: "scrydex" | "pricecharting", token: string): string {
  validateCredential(token);
  return createHash("sha256")
    .update(`${service.length}:${service}:${Buffer.byteLength(token)}:`)
    .update(token)
    .digest("hex");
}
export function validateDependencies(deps: ProviderDependencies): void {
  validateCredential(deps.token);
  requireExactJsonRuntime();
}
/** One bounded physical fetch/body operation. No Promise.race can pretend abort settled it. */
async function receive(
  fetcher: typeof fetch,
  url: URL,
  headers: Record<string, string>,
  signal: AbortSignal,
  clock: () => Date,
): Promise<{ bytes: Uint8Array; receivedAt: string }> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let bodySettled = false;
  try {
    checkSignal(signal);
    const response = await fetcher(url, { method: "GET", headers, redirect: "error", signal });
    if (response.body) reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      for (;;) {
        let part: Awaited<ReturnType<typeof reader.read>>;
        try {
          part = await reader.read();
        } catch (error) {
          bodySettled = true;
          throw error;
        }
        if (part.done) {
          bodySettled = true;
          break;
        }
        size += part.value.byteLength;
        if (size > 262144) throw new ProviderFailure("INVALID_RESPONSE");
        chunks.push(part.value);
      }
    checkSignal(signal);
    if (response.status !== 200) {
      throw new ProviderFailure(
        response.status === 401 || response.status === 403
          ? "ACCESS_DENIED"
          : response.status === 429
            ? "RATE_LIMITED"
            : response.status >= 500
              ? "PROVIDER_UNAVAILABLE"
              : "INVALID_RESPONSE",
      );
    }
    const receivedAt = clock().toISOString();
    return { bytes: Buffer.concat(chunks), receivedAt };
  } catch (error) {
    if (reader && !bodySettled) {
      try {
        await reader.cancel();
      } catch {
        throw new ProviderFailure("TRANSPORT_UNCERTAIN");
      }
    }
    if (error instanceof ProviderFailure) throw error;
    throw new ProviderFailure(signal.aborted ? "INTERRUPTED" : "TRANSPORT");
  } finally {
    reader?.releaseLock();
  }
}
export async function providerRequest<T>(
  deps: ProviderDependencies,
  service: "scrydex" | "pricecharting",
  url: URL,
  headers: Record<string, string>,
  context: MarketFetchContext | undefined,
  decode: (body: unknown) => T,
): Promise<T> {
  const signal = context?.signal ?? new AbortController().signal;
  if (deps.enabled !== true) throw new ProviderFailure("PROVIDER_DISABLED");
  checkSignal(signal);
  try {
    return await deps.permit.run(
      { credentialKey: credentialKey(service, deps.token), signal },
      async (permitSignal) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        timer.unref();
        const transportSignal = AbortSignal.any([permitSignal, controller.signal]);
        try {
          const body = await receive(
            deps.fetch ?? globalThis.fetch,
            url,
            headers,
            transportSignal,
            deps.clock ?? (() => new Date()),
          );
          context?.reportFetchedAt?.(body.receivedAt);
          checkSignal(transportSignal);
          return decode(
            decodeExactJson(new TextDecoder("utf-8", { fatal: true }).decode(body.bytes)),
          );
        } finally {
          clearTimeout(timer);
        }
      },
    );
  } catch (error) {
    if (error instanceof ProviderFailure) throw error;
    throw new ProviderFailure("INVALID_RESPONSE");
  }
}
