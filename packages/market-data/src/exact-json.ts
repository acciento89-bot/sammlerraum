import { ProviderFailure } from "./provider-failure";
const numbers = new WeakMap<object, string>();
type SourceReviver = (key: string, value: unknown, context?: { source?: string }) => unknown;
const parse = JSON.parse as (text: string, reviver: SourceReviver) => unknown;
export function requireExactJsonRuntime(): void {
  let source: string | undefined;
  parse("9007199254740993", (_key, value, context) => {
    source = context?.source;
    return value;
  });
  if (source !== "9007199254740993") throw new ProviderFailure("PROVIDER_CONFIGURATION");
}
export function decodeExactJson(text: string): unknown {
  try {
    if (Buffer.byteLength(text) > 262144) throw Error();
    const result = parse(text, (_key, value, context) => {
      if (typeof value !== "number") return value;
      if (typeof context?.source !== "string" || context.source.length > 80) throw Error();
      const token = Object.freeze(Object.create(null) as object);
      numbers.set(token, context.source);
      return token;
    });
    let count = 0;
    const visit = (value: unknown, depth: number): void => {
      if (++count > 10000 || depth > 32) throw Error();
      if (value && typeof value === "object" && !numbers.has(value))
        for (const child of Object.values(value)) visit(child, depth + 1);
    };
    visit(result, 0);
    return result;
  } catch {
    throw new ProviderFailure("INVALID_RESPONSE");
  }
}
export function numericLexeme(value: unknown, major: boolean): string {
  const text = value && typeof value === "object" ? numbers.get(value) : undefined;
  if (!text || !(major ? /^(0|[1-9][0-9]*)(\.[0-9]+)?$/u : /^(0|[1-9][0-9]*)$/u).test(text))
    throw new ProviderFailure("INVALID_RESPONSE");
  return text;
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || numbers.has(value))
    throw new ProviderFailure("INVALID_RESPONSE");
  return value as Record<string, unknown>;
}
export function text(value: unknown, maximum = 128): string {
  if (
    typeof value !== "string" ||
    !value ||
    /[\uD800-\uDFFF]/u.test(value) ||
    /[\p{Cc}]/u.test(value) ||
    Buffer.byteLength(value) > maximum
  )
    throw new ProviderFailure("INVALID_RESPONSE");
  return value;
}
