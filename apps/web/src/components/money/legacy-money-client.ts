import {
  MoneyCapabilitiesSchema,
  type MoneyCapabilities,
} from "@sammlerraum/contracts/money-capabilities";
export type MoneyTransport = (url: string, init?: RequestInit) => Promise<Response>;
const browserTransport: MoneyTransport = (url, init) => fetch(url, init);
export class MoneyClientError extends Error {
  constructor(
    readonly code:
      | "CAPABILITY_UNAVAILABLE"
      | "READ_FAILED"
      | "CONFLICT"
      | "REFUSED"
      | "OUTCOME_UNKNOWN"
      | "ACKNOWLEDGED_UNREADABLE",
    readonly status?: number,
  ) {
    super(code);
  }
}
async function json(response: Response, maxBytes: number): Promise<unknown> {
  if (!response.body) throw Error("Missing response");
  const reader = response.body.getReader();
  let length = 0;
  const parts: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        void reader.cancel().catch(() => {});
        throw Error("Oversized response");
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.byteLength;
  }
  if (joined[0] === 0xef && joined[1] === 0xbb && joined[2] === 0xbf) throw Error("Unexpected BOM");
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined)) as unknown;
}
export async function loadMoneyCapabilities(
  transport: MoneyTransport = browserTransport,
): Promise<MoneyCapabilities> {
  try {
    const response = await transport("/api/v1/money/capabilities", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) throw Error();
    return MoneyCapabilitiesSchema.parse(await json(response, 4096));
  } catch {
    throw new MoneyClientError("CAPABILITY_UNAVAILABLE");
  }
}
export function requireMoneyAuthoring(input: MoneyCapabilities): MoneyCapabilities {
  const result = MoneyCapabilitiesSchema.safeParse(input);
  if (!result.success || result.data.authoringProfiles.length !== 1)
    throw new MoneyClientError("CAPABILITY_UNAVAILABLE");
  return result.data;
}
export async function readMoney<T>(
  url: string,
  schema: { parse(value: unknown): T },
  transport: MoneyTransport = browserTransport,
): Promise<T> {
  try {
    const response = await transport(url, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw Error();
    return schema.parse(await json(response, 1024 * 1024));
  } catch {
    throw new MoneyClientError("READ_FAILED");
  }
}
export async function writeMoney<T>(
  url: string,
  method: string,
  body: unknown,
  schema: { parse(value: unknown): T },
  capabilities: MoneyCapabilities,
  transport: MoneyTransport = browserTransport,
): Promise<T> {
  requireMoneyAuthoring(capabilities);
  // Serialization errors precede the request and are a definite refusal, not a lost acknowledgment.
  let serialized: string;
  try {
    serialized = JSON.stringify(body);
    if (serialized === undefined) throw Error();
  } catch {
    throw new MoneyClientError("REFUSED");
  }
  let response: Response;
  try {
    response = await transport(url, {
      method,
      cache: "no-store",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: serialized,
    });
  } catch {
    throw new MoneyClientError("OUTCOME_UNKNOWN");
  }
  if (!response.ok) {
    // Even a server timeout can occur after commit. Never infer rollback or auto-retry it.
    throw new MoneyClientError(
      response.status >= 500 ? "OUTCOME_UNKNOWN" : response.status === 409 ? "CONFLICT" : "REFUSED",
      response.status,
    );
  }
  try {
    return schema.parse(await json(response, 1024 * 1024));
  } catch {
    throw new MoneyClientError("ACKNOWLEDGED_UNREADABLE", response.status);
  }
}
