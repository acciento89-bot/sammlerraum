import { z } from "zod";

export const VALUATION_MAX_BODY_BYTES = 16 * 1024;
export const VALUATION_MAX_QUERY_BYTES = 8192;
export const VALUATION_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const ValuationIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu)
  .transform((v) => v.toLowerCase());
export const ValuationInstantSchema = z
  .string()
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/u)
  .refine(
    (v) =>
      !v.startsWith("0000") && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v,
  );
export const AmountMinorSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,18})$/u)
  .refine((v) => v.length < 19 || v <= "9223372036854775807");
const currency = z.string().regex(/^[A-Z]{3}$/u);
const exponent = z.number().int().min(0).max(4);
const unicode = (max: number) =>
  z.string().refine((v) => !/[\uD800-\uDFFF\0]/u.test(v) && [...v].length <= max);
const note = unicode(2000);
export const ManualValuationInputSchema = z
  .object({
    amountMinor: AmountMinorSchema,
    currency,
    observedAt: ValuationInstantSchema.optional(),
    note: z
      .string()
      .transform((v) => v.trim())
      .pipe(note)
      .nullable()
      .optional()
      .transform((v) => v || null),
  })
  .strict();
export const ManualValuationSchema = z
  .object({
    id: ValuationIdSchema,
    type: z.literal("MANUAL"),
    basis: z.literal("PER_UNIT"),
    amountMinor: AmountMinorSchema,
    currency,
    minorUnitExponent: exponent,
    observedAt: ValuationInstantSchema,
    createdAt: ValuationInstantSchema,
    note: note.nullable(),
  })
  .strict()
  .refine((v) => v.observedAt <= v.createdAt);
export const MarketScopeSchema = z.enum(["CURRENT_MAPPING", "HISTORICAL_MAPPING"]);
export const MarketKindSchema = z.enum([
  "LAST_SOLD",
  "SOLD_AVERAGE",
  "SOLD_MEDIAN",
  "ASKING_PRICE",
  "PRICE_RANGE",
  "CATALOG_VALUE",
  "DEALER_PRICE",
]);
const sourceText = (max: number) =>
  z
    .string()
    .min(1)
    .refine(
      (v) => !/[\x00-\x1f\x7f\uD800-\uDFFF]/u.test(v) && new TextEncoder().encode(v).length <= max,
    );
export const SourceKeySchema = z
  .object({
    providerId: sourceText(64).regex(/^[a-z][a-z0-9_-]*$/u),
    identifierNamespace: sourceText(64).regex(/^[a-z][a-z0-9_]*$/u),
    identifierType: sourceText(64).regex(/^[a-z][a-z0-9_]*$/u),
    externalId: sourceText(256),
    kind: MarketKindSchema,
    currency,
  })
  .strict();
const token = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+$/u);
export const TimeKeySchema = z
  .object({
    observedAt: ValuationInstantSchema,
    createdAt: ValuationInstantSchema,
    id: ValuationIdSchema,
  })
  .strict()
  .refine((v) => v.observedAt <= v.createdAt);
export const ItemContextSchema = z
  .object({
    itemId: ValuationIdSchema,
    entryId: ValuationIdSchema,
    variantId: ValuationIdSchema.nullable(),
    revision: z.number().int().positive(),
  })
  .strict();
export const ManualCursorSchema = z
  .object({ v: z.literal(1), itemId: ValuationIdSchema, after: TimeKeySchema })
  .strict();
export const SourceSelectorSchema = z
  .object({
    v: z.literal(1),
    context: ItemContextSchema,
    scope: MarketScopeSchema,
    key: SourceKeySchema,
  })
  .strict();
export const GroupCursorSchema = z
  .object({
    v: z.literal(1),
    context: ItemContextSchema,
    scope: MarketScopeSchema,
    after: SourceKeySchema,
  })
  .strict();
export const SourceHistoryCursorSchema = SourceSelectorSchema.extend({ after: TimeKeySchema });
const limit = (fallback: number, max: number) =>
  z
    .union([
      z.number().int(),
      z
        .string()
        .regex(/^[1-9][0-9]*$/u)
        .transform(Number),
    ])
    .pipe(z.number().int().min(1).max(max))
    .default(fallback);
export const SummaryQuerySchema = z
  .object({
    view: z.literal("summary").default("summary"),
    scope: MarketScopeSchema.default("CURRENT_MAPPING"),
    manualLimit: limit(20, 100),
    manualCursor: token(512).optional(),
    groupLimit: limit(4, 8),
    groupCursor: token(2048).optional(),
  })
  .strict();
export const SourceHistoryQuerySchema = z
  .object({
    view: z.literal("source-history"),
    source: token(2048),
    limit: limit(20, 100),
    cursor: token(2048).optional(),
  })
  .strict();
export const ValuationQuerySchema = z.union([SummaryQuerySchema, SourceHistoryQuerySchema]);
const page = <T extends z.ZodType>(schema: T, max: number, cursorMax = 2048) =>
  z.object({ records: z.array(schema).max(max), nextCursor: token(cursorMax).nullable() }).strict();
const price = z.discriminatedUnion("type", [
  z.object({ type: z.literal("POINT"), amountMinor: AmountMinorSchema }).strict(),
  z
    .object({ type: z.literal("RANGE"), lowMinor: AmountMinorSchema, highMinor: AmountMinorSchema })
    .strict()
    .refine(
      (v) =>
        AmountMinorSchema.safeParse(v.lowMinor).success &&
        AmountMinorSchema.safeParse(v.highMinor).success &&
        BigInt(v.lowMinor) <= BigInt(v.highMinor),
    ),
]);
export const MarketObservationSchema = z
  .object({
    id: ValuationIdSchema,
    source: SourceKeySchema,
    sourceMetric: sourceText(64),
    qualifiers: z.record(z.string(), z.union([unicode(4096), z.boolean()])),
    minorUnitExponent: exponent,
    price,
    observedAt: ValuationInstantSchema,
    observedBasis: z.enum(["SOURCE", "FETCH"]),
    observedPrecision: z.enum(["DAY", "SECOND", "MILLISECOND"]),
    fetchedAt: ValuationInstantSchema,
    recordedAt: ValuationInstantSchema,
    sourceUrl: unicode(2048).nullable(),
    sourceReference: unicode(512).nullable(),
    confidence: z
      .object({
        sourceLabel: unicode(128).optional(),
        sampleSize: z.number().int().min(0).max(2147483647).optional(),
        methodology: unicode(512).optional(),
      })
      .strict()
      .nullable(),
    catalogMatch: z
      .object({
        observedRevision: z.number().int().positive(),
        currentRevision: z.number().int().positive(),
        observedIdentifierId: ValuationIdSchema,
        currentIdentifierId: ValuationIdSchema.nullable(),
        revisionChanged: z.boolean(),
        identifierRecordChanged: z.boolean(),
        identifierActive: z.boolean(),
        variantActive: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .refine(
    (v) =>
      (v.source.kind === "PRICE_RANGE") === (v.price.type === "RANGE") &&
      v.observedAt <= v.fetchedAt &&
      v.fetchedAt <= v.recordedAt &&
      (v.observedBasis !== "FETCH" ||
        (v.observedPrecision === "MILLISECOND" && v.observedAt === v.fetchedAt)) &&
      (v.observedPrecision !== "DAY" || v.observedAt.endsWith("T00:00:00.000Z")) &&
      (v.observedPrecision !== "SECOND" || v.observedAt.endsWith(".000Z")),
  );
const catalog = z
  .object({
    entryId: ValuationIdSchema,
    variantId: ValuationIdSchema.nullable(),
    revision: z.number().int().positive(),
    variantActive: z.boolean(),
  })
  .strict();
export const SourceGroupSchema = z
  .object({ key: SourceKeySchema, source: token(2048), history: page(MarketObservationSchema, 5) })
  .strict();
export const ValuationSummarySchema = z
  .object({
    itemId: ValuationIdSchema,
    quantity: z.number().int().positive(),
    lifecycle: z.enum(["ACTIVE", "ARCHIVED", "DISPOSED"]),
    manualBasis: z.literal("PER_UNIT"),
    readAt: ValuationInstantSchema,
    catalog: catalog.nullable(),
    manual: z
      .object({
        latest: ManualValuationSchema.nullable(),
        history: page(ManualValuationSchema, 100, 512),
      })
      .strict(),
    external: z
      .object({
        scope: MarketScopeSchema,
        availability: z.enum([
          "AVAILABLE",
          "UNLINKED",
          "INACTIVE_VARIANT",
          "NO_SUPPORTED_MAPPING",
          "DISPLAY_DISABLED",
          "NO_OBSERVATIONS",
        ]),
        groups: z.array(SourceGroupSchema).max(8),
        nextGroupCursor: token(2048).nullable(),
      })
      .strict(),
    aggregate: z.null(),
    currencyConflict: z.boolean(),
    currencyConflictScope: z.literal("LATEST_MANUAL_AND_ALL_ELIGIBLE_EXTERNAL_GROUPS"),
  })
  .strict();
export const SourceHistorySchema = z
  .object({
    itemId: ValuationIdSchema,
    readAt: ValuationInstantSchema,
    catalog,
    scope: MarketScopeSchema,
    key: SourceKeySchema,
    history: page(MarketObservationSchema, 100),
  })
  .strict();
export type ManualValuationInputDto = z.infer<typeof ManualValuationInputSchema>;
export type ManualValuationDto = z.infer<typeof ManualValuationSchema>;
export type MarketObservationDto = z.infer<typeof MarketObservationSchema>;
export type ValuationSummaryDto = z.infer<typeof ValuationSummarySchema>;
export type SourceHistoryDto = z.infer<typeof SourceHistorySchema>;
export type SourceKey = z.infer<typeof SourceKeySchema>;
export type MarketScope = z.infer<typeof MarketScopeSchema>;
export type ItemContext = z.infer<typeof ItemContextSchema>;
export type TimeKey = z.infer<typeof TimeKeySchema>;
export type SummaryOptions = z.input<typeof SummaryQuerySchema>;
export type SourceHistoryOptions = z.input<typeof SourceHistoryQuerySchema>;
export type SourceSelector = z.infer<typeof SourceSelectorSchema>;
