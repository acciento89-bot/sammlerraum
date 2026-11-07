import { Prisma } from "@sammlerraum/db/search-sql";
import type { CustomFieldType } from "@sammlerraum/contracts/custom-fields";
const text = Prisma.sql`(a.value #>> '{}')`;
const string = Prisma.sql`jsonb_typeof(a.value)='string'`;
const array = Prisma.sql`CASE WHEN jsonb_typeof(a.value)='array' THEN a.value ELSE '[]'::jsonb END`;
// ECMAScript WhiteSpace + LineTerminator, applied after NFKC like the producer.
const jsTrim =
  "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";
// PostgreSQL counts code points; JavaScript string.length counts UTF-16 units.
const utf16Length = (value: Prisma.Sql) =>
  Prisma.sql`char_length(${value}) + regexp_count(${value} COLLATE pg_catalog."C",${"[\u{10000}-\u{10ffff}]"})`;
const canonicalText = (value: Prisma.Sql, maximum: number) =>
  Prisma.sql`${utf16Length(value)} BETWEEN 1 AND ${maximum} AND ${value}=btrim(normalize(${value},NFKC),${jsTrim}) COLLATE pg_catalog."C"`;
export function catalogGuard(type: CustomFieldType): Prisma.Sql {
  switch (type) {
    case "SHORT_TEXT":
    case "LONG_TEXT":
      return Prisma.sql`${string} AND ${canonicalText(text, type === "SHORT_TEXT" ? 255 : 10000)}`;
    // Final URL validity uses the bounded manifest and existing producer parser.
    case "URL":
      return Prisma.sql`${string} AND ${utf16Length(text)} BETWEEN 1 AND 2048`;
    case "INTEGER":
      return Prisma.sql`CASE WHEN jsonb_typeof(a.value)='number' AND ${text} ~ '^-?(0|[1-9][0-9]*)$' AND char_length(${text})<=17 THEN ${text}::numeric BETWEEN -9007199254740991 AND 9007199254740991 ELSE FALSE END`;
    case "DECIMAL":
      return Prisma.sql`${string} AND ${text} ~ '^-?(0|[1-9][0-9]{0,19})([.][0-9]{0,17}[1-9])?$' AND ${text}<>'-0'`;
    case "DATE":
      return Prisma.sql`CASE WHEN ${string} AND ${text} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND left(${text},4)<>'0000' AND pg_input_is_valid(${text},'date') THEN to_char(${text}::date,'YYYY-MM-DD')=${text} ELSE FALSE END`;
    case "BOOLEAN":
      return Prisma.sql`jsonb_typeof(a.value)='boolean'`;
    case "SINGLE_SELECT":
      return Prisma.sql`${string} AND EXISTS(SELECT 1 FROM "CatalogAttributeOption" o WHERE o."definitionId"=a."definitionId" AND o.key COLLATE pg_catalog."C"=${text})`;
    case "MULTI_SELECT":
      return Prisma.sql`jsonb_typeof(a.value)='array' AND jsonb_array_length(${array})<=100 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(${array}) e(value) WHERE jsonb_typeof(e.value)<>'string' OR NOT EXISTS(SELECT 1 FROM "CatalogAttributeOption" o WHERE o."definitionId"=a."definitionId" AND o.key COLLATE pg_catalog."C"=(e.value #>> '{}'))) AND (SELECT count(*)=count(DISTINCT e.value) FROM jsonb_array_elements(${array}) e(value))`;
    case "MONEY":
      return Prisma.sql`CASE WHEN jsonb_typeof(a.value)='object' AND jsonb_typeof(a.value->'amountMinor')='number' AND (a.value->>'amountMinor') ~ '^(0|[1-9][0-9]{0,15})$' AND jsonb_typeof(a.value->'currency')='string' AND (a.value->>'currency') ~ '^[A-Z]{3}$' AND (CASE WHEN jsonb_typeof(a.value)='object' THEN a.value ELSE '{}'::jsonb END) - 'amountMinor' - 'currency' = '{}'::jsonb THEN (a.value->>'amountMinor')::numeric BETWEEN 0 AND 9007199254740991 ELSE FALSE END`;
  }
}
export function catalogScalar(type: CustomFieldType): Prisma.Sql {
  const valid = catalogGuard(type);
  if (type === "INTEGER" || type === "DECIMAL")
    return Prisma.sql`CASE WHEN ${valid} THEN ${text}::numeric ELSE NULL END`;
  if (type === "DATE") return Prisma.sql`CASE WHEN ${valid} THEN ${text}::date ELSE NULL END`;
  if (type === "BOOLEAN") return Prisma.sql`CASE WHEN ${valid} THEN ${text}::boolean ELSE NULL END`;
  return Prisma.sql`CASE WHEN ${valid} THEN ${text} ELSE NULL END`;
}
/** SQL constraints protect native discriminants and paired columns. These guards
 * cover values the native date/numeric/text types can hold outside producer bounds. */
export function customGuard(type: CustomFieldType): Prisma.Sql {
  switch (type) {
    case "DECIMAL":
      return Prisma.sql`v."decimalValue" IS NOT NULL AND v."decimalValue"::text NOT IN ('NaN','Infinity','-Infinity')`;
    case "DATE":
      return Prisma.sql`v."dateValue" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'`;
    case "SHORT_TEXT":
      return canonicalText(Prisma.sql`v."shortTextValue"`, 255);
    case "LONG_TEXT":
      return canonicalText(Prisma.sql`v."longTextValue"`, 10000);
    case "URL":
      return Prisma.sql`${utf16Length(Prisma.sql`v."urlValue"`)} BETWEEN 1 AND 2048`;
    default:
      return Prisma.sql`TRUE`;
  }
}
