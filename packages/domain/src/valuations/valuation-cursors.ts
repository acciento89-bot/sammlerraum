import {
  ManualCursorSchema,
  GroupCursorSchema,
  SourceSelectorSchema,
  SourceHistoryCursorSchema,
} from "@sammlerraum/contracts/valuations";
export class ValuationQueryError extends Error {
  constructor(
    readonly code:
      | "VALUATION_INVALID"
      | "ITEM_NOT_FOUND"
      | "SOURCE_NOT_FOUND"
      | "VALUATION_CURSOR_STALE"
      | "VALUATION_UNAVAILABLE"
      | "VALUATION_INVARIANT",
  ) {
    super(code);
    this.name = "ValuationQueryError";
  }
}
export function encodeValuationToken(value: unknown): string {
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json) > 1536) throw new ValuationQueryError("VALUATION_INVARIANT");
  return Buffer.from(json, "utf8").toString("base64url");
}
function decode<T>(
  token: string,
  max: number,
  schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } },
): T {
  try {
    if (token.length > max || !/^[A-Za-z0-9_-]+$/u.test(token)) throw new Error();
    const bytes = Buffer.from(token, "base64url");
    if (bytes.length > 1536 || bytes.toString("base64url") !== token) throw new Error();
    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const value: unknown = JSON.parse(json);
    if (JSON.stringify(value) !== json) throw new Error();
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new Error();
    return parsed.data;
  } catch {
    throw new ValuationQueryError("VALUATION_INVALID");
  }
}
export const decodeManualCursor = (token: string) => decode(token, 512, ManualCursorSchema);
export const decodeGroupCursor = (token: string) => decode(token, 2048, GroupCursorSchema);
export const decodeSourceSelector = (token: string) => decode(token, 2048, SourceSelectorSchema);
export const decodeSourceHistoryCursor = (token: string) =>
  decode(token, 2048, SourceHistoryCursorSchema);
