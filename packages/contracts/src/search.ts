import { z } from "zod";
import { VisibilitySchema } from "./collections";
import { TradeStatusSchema } from "./items";
import { CatalogKeySchema } from "./catalog";
import { DocumentCategorySchema } from "./media";
import { GradingComparableValueSchema } from "./grading";
import {
  AmountMinorSchema,
  MarketKindSchema,
  SourceKeySchema,
  ValuationInstantSchema,
} from "./valuations";
import {
  copyBoundedFilterInput,
  FilterValidationError,
  filterInvalid,
  guardLogicalComplexity,
  scanFilterJson,
  utf8Length,
  validUnicode,
  FILTER_MAX_BYTES,
  filterTooComplex,
} from "./search-parser";
export { FilterValidationError, FILTER_MAX_BYTES } from "./search-parser";
export type { FilterErrorCode, FilterUnavailableReason } from "./search-parser";

const object = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();
const id = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu)
  .transform((v) => v.toLowerCase());
const presence = z.discriminatedUnion("op", [
  object({ op: z.literal("present") }),
  object({ op: z.literal("missing") }),
]);
const list = <T extends z.ZodType>(scalar: T) =>
  z
    .array(scalar)
    .min(1)
    .max(50)
    .refine((values) => new Set(values).size === values.length);
const setTest = <T extends z.ZodType>(scalar: T) =>
  z.discriminatedUnion("op", [
    object({ op: z.literal("eq"), value: scalar }),
    object({ op: z.literal("in"), values: list(scalar) }),
  ]);
const ordered = <T extends z.ZodType>(
  scalar: T,
  compare: (a: z.output<T>, b: z.output<T>) => number,
) =>
  z.union([
    setTest(scalar),
    object({ op: z.enum(["lt", "lte", "gt", "gte"]), value: scalar }),
    object({ op: z.literal("between"), min: scalar, max: scalar }).refine((v) => {
      const range = v as { min: z.output<T>; max: z.output<T> };
      return compare(range.min, range.max) <= 0;
    }),
  ]);
const withPresence = <T extends z.ZodType>(test: T) => z.union([test, presence]);
const lexicalCompare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const integer = z.number().int().safe();
const text = (max: number) =>
  z
    .string()
    .transform((v) => v.normalize("NFKC").trim())
    .pipe(z.string().min(1).max(max));
const textTest = (max: number) =>
  z.union([
    setTest(text(max)),
    object({
      op: z.enum(["contains", "startsWith"]),
      value: text(max).refine((v) => [...v].length <= 200 && utf8Length(v) <= 800),
    }),
  ]);
const option = z
  .string()
  .transform((v) => v.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("und"))
  // Producers bound authored display text before lowercase can expand its identity.
  .pipe(z.string().min(1).max(400));
const tags = z
  .string()
  .transform((v) => v.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase())
  .pipe(z.string().min(1).max(200));
const membership = <T extends z.ZodType>(value: T) =>
  object({ op: z.enum(["hasAny", "hasAll"]), values: list(value) });
const date = z
  .string()
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u)
  .refine((v) => {
    if (v.startsWith("0000")) return false;
    const parsed = new Date(`${v}T00:00:00.000Z`);
    return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === v;
  });
const decimal = z
  .string()
  .regex(/^[+-]?\d+(?:\.\d+)?$/u)
  .transform((v, context) => {
    const negative = v.startsWith("-");
    const [rawInteger = "", rawFraction = ""] = v.replace(/^[+-]/u, "").split(".");
    const whole = rawInteger.replace(/^0+(?=\d)/u, "");
    const fraction = rawFraction.replace(/0+$/u, "");
    if (whole.length > 20 || rawFraction.length > 18 || whole.length + fraction.length > 38) {
      context.addIssue({ code: "custom", message: "FILTER_INVALID" });
      return z.NEVER;
    }
    const magnitude = fraction ? `${whole}.${fraction}` : whole;
    return negative && magnitude !== "0" ? `-${magnitude}` : magnitude;
  });
const decimalValue = (v: string): bigint => {
  const negative = v.startsWith("-");
  const [whole = "", fraction = ""] = v.replace(/^-/, "").split(".");
  const result = BigInt(whole + fraction.padEnd(18, "0"));
  return negative ? -result : result;
};
const decimalCompare = (a: string, b: string) =>
  decimalValue(a) < decimalValue(b) ? -1 : decimalValue(a) > decimalValue(b) ? 1 : 0;
const url = z
  .string()
  .max(2048)
  .transform((v, context) => {
    try {
      const parsed = new URL(v);
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password ||
        !parsed.hostname ||
        parsed.toString().length > 2048
      )
        throw Error();
      return parsed.toString();
    } catch {
      context.addIssue({ code: "custom", message: "FILTER_INVALID" });
      return z.NEVER;
    }
  });
const currency = z.string().regex(/^[A-Z]{3}$/u);
const canonicalExponent = z.number().int().min(0).max(4);
const canonicalUnit = object({ currency, minorUnitExponent: canonicalExponent });
const legacyUnit = object({
  currency,
  minorUnitExponent: z.number().int().min(0).max(9),
  unitKey: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u),
});
const rangeFields = {
  minMinor: AmountMinorSchema.optional(),
  maxMinor: AmountMinorSchema.optional(),
};
const validRange = (v: { minMinor?: string | undefined; maxMinor?: string | undefined }) =>
  (v.minMinor !== undefined || v.maxMinor !== undefined) &&
  (v.minMinor === undefined ||
    v.maxMinor === undefined ||
    BigInt(v.minMinor) <= BigInt(v.maxMinor));
const moneyRange = <T extends z.ZodType>(unit: T) =>
  object({ op: z.literal("range"), unit, ...rangeFields }).refine(validRange);
const legacyRange = moneyRange(legacyUnit);
const canonicalRange = moneyRange(canonicalUnit);
const typedPredicate = (catalog: boolean) => {
  const selection = catalog ? CatalogKeySchema : option;
  return z.discriminatedUnion("valueType", [
    object({ valueType: z.literal("SHORT_TEXT"), test: withPresence(textTest(255)) }),
    object({ valueType: z.literal("LONG_TEXT"), test: withPresence(textTest(10_000)) }),
    object({
      valueType: z.literal("INTEGER"),
      test: withPresence(ordered(integer, (a, b) => a - b)),
    }),
    object({
      valueType: z.literal("DECIMAL"),
      test: withPresence(ordered(decimal, decimalCompare)),
    }),
    object({ valueType: z.literal("DATE"), test: withPresence(ordered(date, lexicalCompare)) }),
    object({
      valueType: z.literal("BOOLEAN"),
      test: withPresence(object({ op: z.literal("eq"), value: z.boolean() })),
    }),
    object({ valueType: z.literal("SINGLE_SELECT"), test: withPresence(setTest(selection)) }),
    object({ valueType: z.literal("MULTI_SELECT"), test: withPresence(membership(selection)) }),
    object({ valueType: z.literal("URL"), test: withPresence(setTest(url)) }),
    object({ valueType: z.literal("MONEY"), test: withPresence(legacyRange) }),
  ]);
};
const authored = (max: number) =>
  z
    .string()
    .refine((v) => !/[\u0000-\u001f\u007f]/u.test(v))
    .transform((v) => v.normalize("NFC").trim())
    .pipe(z.string().min(1).max(max));
const grading = z.union([
  presence,
  object({
    op: z.literal("authored"),
    provider: authored(120),
    grade: authored(120).optional(),
    certificateNo: authored(160).optional(),
  }),
  object({
    op: z.literal("comparable"),
    provider: authored(120),
    scale: authored(120),
    value: ordered(GradingComparableValueSchema, decimalCompare),
  }),
]);
const qualifierString = z
  .string()
  .refine((v) => validUnicode(v) && !/[\x00-\x1f\x7f]/u.test(v) && utf8Length(v) <= 128);
const qualifiers = z
  .record(
    z.string().regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/u),
    z.union([qualifierString, z.boolean()]),
  )
  .refine((v) => {
    // Match admission's PostgreSQL JSONB size accounting (spaces after delimiters).
    const jsonbBytes =
      utf8Length(JSON.stringify(v)) +
      Math.max(0, Object.keys(v).length - 1) +
      Object.keys(v).length;
    return Object.keys(v).length <= 16 && jsonbBytes <= 1024;
  });
const marketSelector = object({
  mode: z.literal("CURRENT_ITEM_MAPPING"),
  providerId: SourceKeySchema.shape.providerId,
  identifierNamespace: SourceKeySchema.shape.identifierNamespace,
  identifierType: SourceKeySchema.shape.identifierType,
  kind: MarketKindSchema,
  currency,
  sourceMetric: z.string().regex(/^[a-z][a-z0-9_.:-]{0,63}$/u),
  qualifiers,
  minorUnitExponent: canonicalExponent,
});
const marketRange = object({ op: z.literal("range"), ...rangeFields }).refine(validRange);
const marketInterval = object({
  op: z.enum(["overlaps", "containedBy"]),
  minMinor: AmountMinorSchema,
  maxMinor: AmountMinorSchema,
}).refine(validRange);
const marketLeaf = object({
  kind: z.literal("marketMoney"),
  selector: marketSelector,
  test: z.union([marketRange, marketInterval, presence]),
}).refine(
  (v) =>
    v.test.op === "present" ||
    v.test.op === "missing" ||
    (v.selector.kind === "PRICE_RANGE") === (v.test.op !== "range"),
);
const leafSchema = z.discriminatedUnion("kind", [
  object({ kind: z.literal("collection"), test: setTest(id) }),
  object({ kind: z.literal("category"), test: withPresence(setTest(id)) }),
  object({ kind: z.literal("condition"), categoryTemplateId: id, test: withPresence(setTest(id)) }),
  object({ kind: z.literal("grading"), test: grading }),
  object({ kind: z.literal("purchaseMoney"), test: withPresence(legacyRange) }),
  object({ kind: z.literal("manualMoney"), test: withPresence(canonicalRange) }),
  marketLeaf,
  object({ kind: z.literal("tags"), test: withPresence(membership(tags)) }),
  object({ kind: z.literal("duplicate"), value: z.boolean() }),
  object({ kind: z.literal("tradeStatus"), test: setTest(TradeStatusSchema) }),
  object({ kind: z.literal("visibility"), test: setTest(VisibilitySchema) }),
  object({
    kind: z.literal("media"),
    mediaKind: z.enum(["IMAGE", "DOCUMENT"]),
    documentCategory: DocumentCategorySchema.optional(),
    test: presence,
  }).refine((v) => v.mediaKind === "DOCUMENT" || v.documentCategory === undefined),
  object({ kind: z.literal("createdAt"), test: ordered(ValuationInstantSchema, lexicalCompare) }),
  object({ kind: z.literal("updatedAt"), test: ordered(ValuationInstantSchema, lexicalCompare) }),
  object({ kind: z.literal("acquisitionDate"), test: withPresence(ordered(date, lexicalCompare)) }),
  object({
    kind: z.literal("customField"),
    selector: object({ source: z.literal("CUSTOM"), collectionId: id, definitionId: id }),
    predicate: typedPredicate(false),
  }),
  object({
    kind: z.literal("catalogAttribute"),
    selector: object({
      source: z.literal("CATALOG"),
      categoryTemplateId: id,
      definitionId: id,
      target: z.enum(["ENTRY", "SELECTED_VARIANT"]),
    }),
    predicate: typedPredicate(true),
  }),
]);
export type ItemFilterLeaf = z.infer<typeof leafSchema>;
/**
 * Positive tests on absent facts are false; NOT complements that result only after
 * whole-tree availability succeeds. Explicit scoped missing/present applies only
 * to the selected collection/category. Zero/false/empty authored multi-select is
 * present. Reference/type/option failures are errors resolved by Task2, not missing.
 *
 * Catalog attributes use exact linked ENTRY/SELECTED_VARIANT facts, including
 * retained retired targets. Retirement forbids new selection, not finding an owned
 * fact. Missing/removed targets follow missing semantics; invalid definitions fail.
 * Market CURRENT_ITEM_MAPPING separately requires current-active eligibility/rights,
 * exact per-item mapping/metric/full qualifiers/denomination and rejects ambiguous
 * mappings before evaluating any predicate. No first/highest-product fallback.
 *
 * Latest manual is selected before its denomination/range test. Legacy comparisons
 * require L1 complete outer-scope interpretation coverage even under NOT/OR; the
 * declared unitKey/exponent never classifies a fact. All monetary tests are per-unit.
 */
export type ItemFilterNode =
  | ItemFilterLeaf
  | { kind: "and" | "or"; children: ItemFilterNode[] }
  | { kind: "not"; child: ItemFilterNode };
export type ItemFilter = { version: 1; root: ItemFilterNode };
const recursiveNode: z.ZodType<ItemFilterNode> = z.lazy(() =>
  z.union([
    leafSchema,
    object({ kind: z.enum(["and", "or"]), children: z.array(recursiveNode).min(1).max(50) }),
    object({ kind: z.literal("not"), child: recursiveNode }),
  ]),
);
const envelopeSchema = object({ version: z.literal(1), root: recursiveNode });

function parseBounded(input: unknown, nodeOnly: boolean): ItemFilter | ItemFilterNode {
  const snapshot = copyBoundedFilterInput(input);
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) filterInvalid();
  if (!nodeOnly) {
    const version = (snapshot as Record<string, unknown>).version;
    if (typeof version === "number" && Number.isSafeInteger(version) && version !== 1)
      throw new FilterValidationError("FILTER_VERSION_UNSUPPORTED");
  }
  guardLogicalComplexity(nodeOnly ? snapshot : (snapshot as Record<string, unknown>).root);
  const result = (nodeOnly ? recursiveNode : envelopeSchema).safeParse(snapshot);
  if (!result.success) filterInvalid();
  if (utf8Length(JSON.stringify(result.data)) > FILTER_MAX_BYTES) filterTooComplex();
  return result.data;
}
function guardedSchema<T extends ItemFilter | ItemFilterNode>(nodeOnly: boolean) {
  return z.unknown().transform<T>((input, context) => {
    try {
      return parseBounded(input, nodeOnly) as T;
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof FilterValidationError ? error.code : "FILTER_INVALID",
      });
      return z.NEVER;
    }
  });
}
/** Every public schema path guards/copies first; recursive schemas remain private. */
export const ItemFilterSchema = guardedSchema<ItemFilter>(false);
export const ItemFilterNodeSchema = guardedSchema<ItemFilterNode>(true);
export function parseItemFilter(input: unknown): ItemFilter {
  const result = ItemFilterSchema.safeParse(input);
  if (!result.success) {
    const code = result.error.issues[0]?.message;
    throw new FilterValidationError(
      code === "FILTER_TOO_COMPLEX" || code === "FILTER_VERSION_UNSUPPORTED"
        ? code
        : "FILTER_INVALID",
    );
  }
  return result.data;
}
export function parseItemFilterJson(raw: string): ItemFilter {
  scanFilterJson(raw);
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return filterInvalid();
  }
  return parseItemFilter(input);
}
