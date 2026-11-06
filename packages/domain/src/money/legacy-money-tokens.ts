import { z } from "zod";
import {
  MoneyFactTokenV1Schema,
  MoneyAssertionTokenV1Schema,
  legacyMoneyFail,
} from "@sammlerraum/contracts/legacy-money";
function encode<T>(schema: z.ZodType<T>, input: unknown): string {
  const result = schema.safeParse(input);
  if (!result.success) return legacyMoneyFail("LEGACY_MONEY_INVALID");
  const token = Buffer.from(JSON.stringify(result.data), "utf8").toString("base64url");
  if (token.length > 2048) return legacyMoneyFail("LEGACY_MONEY_INVALID");
  return token;
}
function decode<T>(schema: z.ZodType<T>, input: unknown): T {
  if (
    typeof input !== "string" ||
    input.length < 1 ||
    input.length > 2048 ||
    !/^[A-Za-z0-9_-]+$/u.test(input)
  )
    return legacyMoneyFail("LEGACY_MONEY_INVALID");
  try {
    const bytes = Buffer.from(input, "base64url");
    if (bytes.toString("base64url") !== input) return legacyMoneyFail("LEGACY_MONEY_INVALID");
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    const result = schema.safeParse(parsed);
    if (!result.success || encode(schema, result.data) !== input)
      return legacyMoneyFail("LEGACY_MONEY_INVALID");
    return result.data;
  } catch {
    return legacyMoneyFail("LEGACY_MONEY_INVALID");
  }
}
export const encodeMoneyFactToken = (input: unknown) => encode(MoneyFactTokenV1Schema, input);
export const decodeMoneyFactToken = (input: unknown) => decode(MoneyFactTokenV1Schema, input);
export const encodeMoneyAssertionToken = (input: unknown) =>
  encode(MoneyAssertionTokenV1Schema, input);
export const decodeMoneyAssertionToken = (input: unknown) =>
  decode(MoneyAssertionTokenV1Schema, input);
