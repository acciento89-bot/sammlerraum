import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CatalogSnapshotSchema } from "@sammlerraum/contracts/catalog";
import {
  LegacyMoneyIdSchema,
  LegacyMoneySubjectSchema,
  LegacyRawMoneySchema,
  LegacyMoneyExponentSchema,
  LegacyMoneyEvidenceSchema,
  LegacyUnitDeclarationSchema,
  MoneyFactTokenV1Schema,
  MoneyViewSchema,
  AuthoringReceiptSchema,
  ClassifyMoneyInputSchema,
  CorrectMoneyInputSchema,
  RevokeMoneyInputSchema,
  LEGACY_MONEY_PROFILE_ID,
  legacyMoneyFail,
  type MoneySubject,
  type MoneyView,
  type RawMoney,
} from "@sammlerraum/contracts/legacy-money";
import { Prisma } from "@sammlerraum/db/search-sql";
import type { LegacyMoneySelector } from "../search/legacy-money-query";
import type { SearchReadTransaction, BoundedSearchReadTransaction } from "../search/search-read";
import {
  parseLegacyMoneyAuthoring,
  validateLegacyUnit,
  formatStoredMoney,
} from "./legacy-money-policy";
import {
  encodeMoneyFactToken,
  decodeMoneyFactToken,
  encodeMoneyAssertionToken,
  decodeMoneyAssertionToken,
} from "./legacy-money-tokens";
import { ApplicationRoleError, requireApplicationModerator } from "../authz/application-role";
import { isReadSerializationFailure } from "../api/read-dependency-errors";
export type MoneyActor = { userId: string };
const nil = "00000000-0000-0000-0000-000000000000";
const integrity = (): never => legacyMoneyFail("MONEY_DATA_INTEGRITY");
const eventSchema = z
  .object({
    id: LegacyMoneyIdSchema,
    sequence: MoneyFactTokenV1Schema.shape.sequence,
    operation: z.enum(["BASELINE", "RAW_WRITE", "CLEAR", "AUTHOR", "CLASSIFY", "COPY", "REVOKE"]),
    rawAmountMinor: z.string().nullable(),
    rawCurrency: z.string().nullable(),
    exponent: LegacyMoneyExponentSchema.nullable(),
    unitKey: z.string().max(128).nullable(),
    unitLabel: z.string().max(480).nullable(),
    basisId: z
      .enum([LEGACY_MONEY_PROFILE_ID, "OWNER_ATTESTATION:v1", "OPERATOR_VERIFIED_RECORD:v1"])
      .nullable(),
    receipt: z.unknown(),
    actorId: z.string().nullable(),
    evidenceCategory: z.enum(["OWNER_ATTESTATION", "OPERATOR_VERIFIED_RECORD"]).nullable(),
    evidenceReference: z.string().nullable(),
    reason: z.string().nullable(),
    createdAt: z.string(),
    evidenceErasedAt: z.string().nullable(),
    sourceEventId: LegacyMoneyIdSchema.nullable(),
    originEventId: LegacyMoneyIdSchema.nullable(),
    revokedAssertionId: LegacyMoneyIdSchema.nullable(),
    itemId: LegacyMoneyIdSchema.optional(),
    fieldDefinitionId: LegacyMoneyIdSchema.optional(),
    generation: LegacyMoneyIdSchema.optional(),
    entryId: LegacyMoneyIdSchema.optional(),
    revision: z.number().int().positive().optional(),
    targetKey: z.string().optional(),
    variantId: LegacyMoneyIdSchema.nullable().optional(),
    definitionId: LegacyMoneyIdSchema.optional(),
  })
  .passthrough();
type Event = z.infer<typeof eventSchema>;
function event(input: unknown): Event | null {
  if (input === null) return null;
  const result = eventSchema.safeParse(input);
  if (!result.success || result.data.receipt === undefined) return integrity();
  return result.data;
}
function actor(input: MoneyActor): string {
  if (!input || typeof input.userId !== "string" || input.userId.length === 0)
    return legacyMoneyFail("MONEY_FORBIDDEN");
  return input.userId;
}
function subject(input: MoneySubject): MoneySubject {
  const parsed = LegacyMoneySubjectSchema.safeParse(input);
  if (!parsed.success) return legacyMoneyFail("LEGACY_MONEY_INVALID");
  return parsed.data;
}
function table(s: MoneySubject): Prisma.Sql {
  return Prisma.raw(
    s.family === "PURCHASE"
      ? '"PurchaseMoneyInterpretationEvent"'
      : s.family === "CUSTOM"
        ? '"CustomMoneyInterpretationEvent"'
        : '"CatalogMoneyInterpretationEvent"',
  );
}
type SubjectBindings = Partial<
  Record<
    | "itemId"
    | "fieldDefinitionId"
    | "entryId"
    | "revision"
    | "targetKey"
    | "variantId"
    | "definitionId",
    Prisma.Sql
  >
>;
function predicate(
  s: MoneySubject,
  alias: "h" | "e" | "q",
  bindings: SubjectBindings = {},
): Prisma.Sql {
  const col = (
    name: "itemId" | "fieldDefinitionId" | "entryId" | "revision" | "targetKey" | "definitionId",
  ) => Prisma.raw(`${alias}."${name}"`);
  if (s.family === "PURCHASE")
    return Prisma.sql`${col("itemId")}=${bindings.itemId ?? Prisma.sql`${s.itemId}`}::uuid`;
  if (s.family === "CUSTOM")
    return Prisma.sql`${col("itemId")}=${bindings.itemId ?? Prisma.sql`${s.itemId}`}::uuid AND ${col("fieldDefinitionId")}=${bindings.fieldDefinitionId ?? Prisma.sql`${s.fieldDefinitionId}`}::uuid`;
  return Prisma.sql`${col("entryId")}=${bindings.entryId ?? Prisma.sql`${s.entryId}`}::uuid AND ${col("revision")}=${bindings.revision ?? Prisma.sql`${s.revision}`} AND ${col("targetKey")}=${bindings.targetKey ?? Prisma.sql`${s.target.kind === "ENTRY" ? "entry" : s.target.variantId}`} AND ${col("definitionId")}=${bindings.definitionId ?? Prisma.sql`${s.definitionId}`}::uuid`;
}
function eventJson(alias: "e" | "o"): Prisma.Sql {
  const a = Prisma.raw(alias);
  return Prisma.sql`CASE WHEN ${a}.id IS NULL THEN NULL ELSE to_jsonb(${a})||jsonb_build_object('sequence',${a}.sequence::text,'rawAmountMinor',${a}."rawAmountMinor"::text) END`;
}
function base(s: MoneySubject, user: string, bindings: SubjectBindings = {}): Prisma.Sql {
  if (s.family === "PURCHASE")
    return Prisma.sql`
 SELECT i."purchaseAmountMinor"::text AS amount,i."purchaseCurrency"::text AS currency,
 CASE WHEN i."purchaseAmountMinor" IS NOT NULL THEN COALESCE(i."purchaseMoneyGeneration",${nil}::uuid)::text ELSE i."purchaseMoneyGeneration"::text END AS generation,
 false AS bad,true AS "targetExists"
 FROM "CollectibleItem" i JOIN "Collection" c ON c.id=i."collectionId" AND c."ownerId"=i."ownerId"
 WHERE i.id=${bindings.itemId ?? Prisma.sql`${s.itemId}`}::uuid AND i."ownerId"=${user} AND i."deletedAt" IS NULL AND c."deletedAt" IS NULL`;
  if (s.family === "CUSTOM")
    return Prisma.sql`
 SELECT v."moneyAmountMinor"::text AS amount,v."moneyCurrency"::text AS currency,
 CASE WHEN v."moneyAmountMinor" IS NOT NULL THEN COALESCE(v."moneyGeneration",${nil}::uuid)::text
 WHEN v."itemId" IS NULL AND tomb.operation='CLEAR' THEN tomb.generation::text ELSE NULL END AS generation,
 ((v."itemId" IS NULL AND tomb.id IS NOT NULL AND tomb.operation<>'CLEAR') OR (v."itemId" IS NOT NULL AND (v."fieldType"<>'MONEY' OR v."moneyAmountMinor" IS NULL))) AS bad,true AS "targetExists"
 FROM "CollectibleItem" i JOIN "Collection" c ON c.id=i."collectionId" AND c."ownerId"=i."ownerId"
 JOIN "CustomFieldDefinition" d ON d.id=${bindings.fieldDefinitionId ?? Prisma.sql`${s.fieldDefinitionId}`}::uuid AND d."collectionId"=i."collectionId" AND d.type='MONEY'
 LEFT JOIN "CustomFieldValue" v ON v."itemId"=i.id AND v."fieldDefinitionId"=d.id
 LEFT JOIN LATERAL (SELECT h.id,h.generation,h.operation FROM "CustomMoneyInterpretationEvent" h WHERE ${predicate(s, "h", bindings)} AND h.operation<>'REVOKE' ORDER BY h.sequence DESC LIMIT 1) tomb ON true
 WHERE i.id=${bindings.itemId ?? Prisma.sql`${s.itemId}`}::uuid AND i."ownerId"=${user} AND i."deletedAt" IS NULL AND c."deletedAt" IS NULL`;
  const isEntry = s.target.kind === "ENTRY",
    variant = s.target.kind === "ENTRY" ? null : s.target.variantId;
  return Prisma.sql`
 SELECT CASE WHEN jsonb_typeof(m.value->'value'->'amountMinor')='number' THEN m.value#>>'{value,amountMinor}' ELSE NULL END AS amount,
 CASE WHEN jsonb_typeof(m.value->'value'->'currency')='string' THEN m.value#>>'{value,currency}' ELSE NULL END AS currency,
 NULL::text AS generation,
 (r.snapshot->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR r.snapshot->>'id' IS DISTINCT FROM c.id::text OR r.snapshot->>'categoryTemplateId' IS DISTINCT FROM c."categoryTemplateId"::text
 OR (NOT ${isEntry} AND (jsonb_typeof(r.snapshot->'variants') IS DISTINCT FROM 'array' OR CASE WHEN jsonb_typeof(r.snapshot->'variants')='array' THEN jsonb_array_length(r.snapshot->'variants')>100 ELSE false END OR variants.n>1))
 OR ((${isEntry} OR variants.n=1) AND (jsonb_typeof(a.attrs) IS DISTINCT FROM 'array' OR CASE WHEN jsonb_typeof(a.attrs)='array' THEN jsonb_array_length(a.attrs)>100 ELSE false END))
 OR m.n>1 OR m.too_big OR (m.n=1 AND (m.value->>'type' IS DISTINCT FROM 'MONEY' OR jsonb_typeof(m.value->'value') IS DISTINCT FROM 'object' OR jsonb_typeof(m.value->'value'->'amountMinor') IS DISTINCT FROM 'number' OR jsonb_typeof(m.value->'value'->'currency') IS DISTINCT FROM 'string' OR
 CASE WHEN jsonb_typeof(m.value->'value')='object' THEN (SELECT count(*) FROM jsonb_object_keys(m.value->'value'))<>2 ELSE false END))) AS bad,
 (${isEntry} OR variants.n=1) AS "targetExists"
 FROM "CatalogRevision" r JOIN "CatalogEntry" c ON c.id=r."entryId"
 JOIN "CatalogAttributeDefinition" d ON d.id=${bindings.definitionId ?? Prisma.sql`${s.definitionId}`}::uuid AND d."categoryTemplateId"=c."categoryTemplateId" AND d.type='MONEY'
 LEFT JOIN LATERAL (SELECT count(*) AS n,(jsonb_agg(v))->0 AS value FROM (
   SELECT v FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.snapshot->'variants')='array' THEN CASE WHEN jsonb_array_length(r.snapshot->'variants')<=100 THEN r.snapshot->'variants' ELSE '[]'::jsonb END ELSE '[]'::jsonb END) v WHERE v->>'id'=${bindings.variantId ?? Prisma.sql`${variant}`} LIMIT 2
 ) selected) variants ON true
 LEFT JOIN LATERAL (SELECT CASE WHEN ${isEntry} THEN r.snapshot->'attributes' ELSE variants.value->'attributes' END AS attrs) a ON true
 LEFT JOIN LATERAL (SELECT count(*) AS n,bool_or(too_big) AS too_big,(jsonb_agg(value))->0 AS value FROM (
   SELECT CASE WHEN pg_column_size(v)<=2048 THEN v ELSE NULL END AS value,pg_column_size(v)>2048 AS too_big
   FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a.attrs)='array' THEN CASE WHEN jsonb_array_length(a.attrs)<=100 THEN a.attrs ELSE '[]'::jsonb END ELSE '[]'::jsonb END) v WHERE v->>'definitionId'=${bindings.definitionId ?? Prisma.sql`${s.definitionId}`} LIMIT 2
 ) selected) m ON true
 WHERE r."entryId"=${bindings.entryId ?? Prisma.sql`${s.entryId}`}::uuid AND r.revision=${bindings.revision ?? Prisma.sql`${s.revision}`}`;
}
type Row = {
  amount: string | null;
  currency: string | null;
  generation: string | null;
  bad: boolean | null;
  targetExists: boolean;
  sequence: string;
  event: unknown;
  origin: unknown;
  revocationId: string | null;
  originOwnerId: string | null;
};
function timestamp(input: string | null): string | null {
  if (input === null) return null;
  const parsed = new Date(input);
  if (!Number.isFinite(parsed.valueOf())) return integrity();
  return parsed.toISOString();
}
function raw(amount: string | null, currency: string | null, catalog = false): RawMoney | null {
  if (amount === null && currency === null) return null;
  if (
    catalog &&
    typeof amount === "string" &&
    amount.length <= 32 &&
    /^(0|[1-9][0-9]*)(?:\.0+)?$/u.test(amount)
  )
    amount = amount.split(".")[0]!;
  const result = LegacyRawMoneySchema.safeParse({ amountMinor: amount, currency });
  if (!result.success) return integrity();
  return result.data;
}
function equal(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function originMeaning(
  o: Event,
  r: RawMoney,
  s: MoneySubject,
  user: string,
  originOwner: string | null,
) {
  if (o.operation !== "AUTHOR" && o.operation !== "CLASSIFY") return integrity();
  if (
    !equal(raw(o.rawAmountMinor, o.rawCurrency), r) ||
    o.exponent === null ||
    o.unitKey === null ||
    o.basisId === null
  )
    return integrity();
  if (s.family !== "CATALOG" && originOwner !== user) return integrity();
  if (o.operation === "AUTHOR") {
    const receipt = AuthoringReceiptSchema.safeParse(o.receipt);
    if (!receipt.success) return integrity();
    try {
      const verified = parseLegacyMoneyAuthoring({
        kind: "RAW",
        profileId: receipt.data.profileId,
        currency: receipt.data.raw.currency,
        amountMinor: receipt.data.raw.amountMinor,
        exponent: receipt.data.exponent,
        unitKey: receipt.data.unitKey,
      });
      if (
        !equal(verified, receipt.data) ||
        !equal(verified.raw, r) ||
        verified.exponent !== o.exponent ||
        verified.unitKey !== o.unitKey ||
        verified.profileId !== o.basisId ||
        o.unitLabel !== null ||
        o.evidenceCategory !== null
      )
        return integrity();
    } catch {
      return integrity();
    }
  } else {
    if (
      o.evidenceCategory === null ||
      o.basisId !== `${o.evidenceCategory}:v1` ||
      (s.family === "CATALOG" && o.evidenceCategory !== "OPERATOR_VERIFIED_RECORD")
    )
      return integrity();
    const declaration = o.unitKey.startsWith("unsupported:")
      ? { kind: "UNSUPPORTED", label: o.unitLabel }
      : { kind: "SUPPORTED", unitKey: o.unitKey };
    const parsed = LegacyUnitDeclarationSchema.safeParse(declaration);
    if (!parsed.success || !equal(parsed.data, declaration)) return integrity();
    try {
      const unit = validateLegacyUnit(r.currency, parsed.data, o.id);
      if (unit.unitKey !== o.unitKey) return integrity();
    } catch {
      return integrity();
    }
    if (o.evidenceErasedAt === null) {
      const evidence = {
        category: o.evidenceCategory,
        reason: o.reason,
        ...(o.evidenceReference === null ? {} : { reference: o.evidenceReference }),
      };
      const parsedEvidence = LegacyMoneyEvidenceSchema.safeParse(evidence);
      if (o.actorId === null || !parsedEvidence.success || !equal(parsedEvidence.data, evidence))
        return integrity();
    } else if (o.actorId !== null || o.reason !== null || o.evidenceReference !== null)
      return integrity();
  }
  return {
    exponent: o.exponent,
    unitKey: o.unitKey,
    basisId: o.basisId,
    evidenceCategory: o.evidenceCategory,
    eligibility: (o.unitKey.startsWith("unsupported:") ? "UNIT_UNSUPPORTED" : "ELIGIBLE") as
      | "UNIT_UNSUPPORTED"
      | "ELIGIBLE",
    decimal: formatStoredMoney(r, o.exponent),
  };
}
const resolvedBrand = Symbol("same active money transaction");
export type ResolvedMoneyFact = {
  readonly [resolvedBrand]: { tx: SearchReadTransaction; user: string };
  readonly view: MoneyView;
  readonly sequence: string;
  readonly generation: string | null;
  readonly event: Event | null;
  readonly origin: Event | null;
  readonly revocationId: string | null;
};
async function resolveFact(
  tx: SearchReadTransaction,
  input: MoneySubject,
  who: MoneyActor,
): Promise<ResolvedMoneyFact> {
  const s = subject(input),
    user = actor(who),
    t = table(s);
  const generation =
    s.family === "CATALOG" ? Prisma.sql`true` : Prisma.sql`e.generation=base.generation::uuid`;
  const owner =
    s.family === "CATALOG"
      ? Prisma.sql`NULL::text`
      : Prisma.sql`(SELECT "ownerId" FROM "CollectibleItem" WHERE id=o."itemId")`;
  const rows = await tx.$queryRaw<Row[]>(Prisma.sql`
 WITH base AS (${base(s, user)})
 SELECT base.*,seq.sequence,${eventJson("e")} AS event,${eventJson("o")} AS origin,rev.id::text AS "revocationId",${owner} AS "originOwnerId"
 FROM base
 LEFT JOIN LATERAL (SELECT COALESCE(MAX(h.sequence),0)::text AS sequence FROM ${t} h WHERE ${predicate(s, "h")}) seq ON true
 LEFT JOIN LATERAL (SELECT e.* FROM ${t} e WHERE ${predicate(s, "e")} AND ${generation} AND e.operation<>'REVOKE' ORDER BY e.sequence DESC LIMIT 1) e ON true
 LEFT JOIN ${t} o ON o.id=CASE WHEN e.operation IN ('AUTHOR','CLASSIFY') THEN e.id WHEN e.operation='COPY' THEN e."originEventId" ELSE NULL END
 LEFT JOIN ${t} rev ON rev."revokedAssertionId"=o.id`);
  if (rows.length === 0) return legacyMoneyFail("MONEY_NOT_FOUND");
  if (rows.length !== 1) return integrity();
  return resolvedRow(tx, s, user, rows[0]!);
}
/** Both scalar and bounded catalog-map reads share the exact origin/receipt policy. */
function resolvedRow(
  tx: SearchReadTransaction,
  s: MoneySubject,
  user: string,
  row: Row,
): ResolvedMoneyFact {
  if (row.bad) return integrity();
  if (!row.targetExists) return legacyMoneyFail("MONEY_NOT_FOUND");
  const r = raw(row.amount, row.currency, s.family === "CATALOG"),
    e = event(row.event),
    o = event(row.origin);
  if (e && !equal(raw(e.rawAmountMinor, e.rawCurrency), r)) return integrity();
  if (!e && r !== null && s.family !== "CATALOG" && row.generation !== nil) return integrity();
  const originEvidenceErasedAt = o ? timestamp(o.evidenceErasedAt) : null;
  const factToken = encodeMoneyFactToken({
    v: 1,
    subject: s,
    generation: row.generation,
    sequence: row.sequence,
    raw: r,
    effectiveEventId: e?.id ?? null,
    originId: o?.id ?? null,
    originEvidenceErasedAt,
    revocationId: row.revocationId,
  });
  let interpretation: MoneyView["interpretation"];
  if (r === null) interpretation = { kind: "MISSING" };
  else if (!e || e.operation === "BASELINE")
    interpretation = { kind: "UNKNOWN", reason: "NO_EVIDENCE" };
  else if (e.operation === "RAW_WRITE") interpretation = { kind: "UNKNOWN", reason: "RAW_WRITER" };
  else if (e.operation === "COPY" && o === null)
    interpretation = { kind: "UNKNOWN", reason: "ORIGIN_ERASED" };
  else {
    if (!o || !["AUTHOR", "CLASSIFY", "COPY"].includes(e.operation)) return integrity();
    const meaning = originMeaning(o, r, s, user, row.originOwnerId);
    if (
      e.exponent !== o.exponent ||
      e.unitKey !== o.unitKey ||
      e.unitLabel !== o.unitLabel ||
      e.basisId !== o.basisId
    )
      return integrity();
    if (o.operation === "CLASSIFY" && originEvidenceErasedAt !== null)
      interpretation = { kind: "UNKNOWN", reason: "EVIDENCE_ERASED" };
    else if (row.revocationId !== null) interpretation = { kind: "UNKNOWN", reason: "REVOKED" };
    else interpretation = { kind: "INTERPRETED", ...meaning, assertionId: o.id, eventId: e.id };
  }
  const view = MoneyViewSchema.safeParse({
    schemaVersion: 1,
    subject: s,
    raw: r,
    factToken,
    interpretation,
  });
  if (!view.success) return integrity();
  return Object.freeze({
    [resolvedBrand]: { tx, user },
    view: view.data,
    sequence: row.sequence,
    generation: row.generation,
    event: e,
    origin: o,
    revocationId: row.revocationId,
  });
}
/** Internal complete-selection SQL. The candidate relation contains IDs only;
 * owner/live-parent/live-item authorization is rechecked here independently.
 * Scalar readers and this batch use the SAME raw path SQL and origin policy.
 */
export function ownedMoneySelectorRowsSql(
  who: MoneyActor,
  selector: LegacyMoneySelector,
  candidates: Prisma.Sql,
): Prisma.Sql {
  const user = actor(who);
  const s: MoneySubject =
    selector.family === "PURCHASE"
      ? { family: "PURCHASE", itemId: nil }
      : selector.family === "CUSTOM"
        ? { family: "CUSTOM", itemId: nil, fieldDefinitionId: selector.definitionId }
        : {
            family: "CATALOG",
            entryId: nil,
            revision: 1,
            definitionId: selector.definitionId,
            target:
              selector.target === "ENTRY" ? { kind: "ENTRY" } : { kind: "VARIANT", variantId: nil },
          };
  const bindings: SubjectBindings =
    selector.family === "CATALOG"
      ? {
          entryId: Prisma.sql`b."catalogEntryId"`,
          revision: Prisma.sql`b."moneyRevision"`,
          variantId: Prisma.sql`b."catalogVariantId"::text`,
          targetKey:
            selector.target === "ENTRY"
              ? Prisma.sql`'entry'::text`
              : Prisma.sql`b."catalogVariantId"::text`,
        }
      : { itemId: Prisma.sql`b.id` };
  const t = table(s);
  const generation =
    s.family === "CATALOG" ? Prisma.sql`true` : Prisma.sql`e.generation=base.generation::uuid`;
  const owner =
    s.family === "CATALOG"
      ? Prisma.sql`NULL::text`
      : Prisma.sql`(SELECT "ownerId" FROM "CollectibleItem" WHERE id=o."itemId")`;
  return Prisma.sql`WITH b AS MATERIALIZED (
    SELECT mi.id,mi.quantity,mi."catalogEntryId",mi."catalogVariantId",ce.revision AS "moneyRevision"
    FROM (${candidates}) chosen JOIN "CollectibleItem" mi ON mi.id=chosen.id
    JOIN "Collection" mc ON mc.id=mi."collectionId" AND mc."ownerId"=mi."ownerId"
    LEFT JOIN "CatalogEntry" ce ON ce.id=mi."catalogEntryId"
    WHERE mi."ownerId"=${user} AND mc."ownerId"=${user} AND mi."deletedAt" IS NULL AND mc."deletedAt" IS NULL
  ) SELECT b.id,b.id::text AS "itemId",b.quantity,b."catalogEntryId"::text AS "entryId",b."moneyRevision" AS revision,b."catalogVariantId"::text AS "variantId",
    base.*,seq.sequence,${eventJson("e")} AS event,${eventJson("o")} AS origin,
    rev.id::text AS "revocationId",${owner} AS "originOwnerId",o.exponent,o."unitKey",
    base.amount::numeric AS raw
    FROM b LEFT JOIN LATERAL (${base(s, user, bindings)}) base ON true
    LEFT JOIN LATERAL (SELECT COALESCE(MAX(h.sequence),0)::text AS sequence FROM ${t} h WHERE ${predicate(s, "h", bindings)}) seq ON true
    LEFT JOIN LATERAL (SELECT e.* FROM ${t} e WHERE ${predicate(s, "e", bindings)} AND ${generation} AND e.operation<>'REVOKE' ORDER BY e.sequence DESC LIMIT 1) e ON true
    LEFT JOIN ${t} o ON o.id=CASE WHEN e.operation IN ('AUTHOR','CLASSIFY') THEN e.id WHEN e.operation='COPY' THEN e."originEventId" ELSE NULL END
    LEFT JOIN ${t} rev ON rev."revokedAssertionId"=o.id`;
}
export async function visitOwnedMoneySelectorFacts(
  tx: BoundedSearchReadTransaction,
  who: MoneyActor,
  selector: LegacyMoneySelector,
  candidates: Prisma.Sql,
  visit: (itemId: string, quantity: number, view: MoneyView | null) => void,
): Promise<void> {
  type SelectedRow = Row & {
    itemId: string;
    quantity: number;
    entryId: string | null;
    revision: number | null;
    variantId: string | null;
  };
  const user = actor(who);
  const rows = await tx.$queryRaw<SelectedRow[]>(
    ownedMoneySelectorRowsSql(who, selector, candidates),
  );
  const seen = new Set<string>();
  for (const row of rows) {
    tx.checkBudget();
    if (
      !LegacyMoneyIdSchema.safeParse(row.itemId).success ||
      seen.has(row.itemId) ||
      !Number.isSafeInteger(row.quantity) ||
      row.quantity < 1 ||
      row.quantity > 2147483647 ||
      row.bad
    )
      return integrity();
    seen.add(row.itemId);
    if (row.targetExists !== true) {
      if (selector.family === "PURCHASE") return integrity();
      visit(row.itemId, row.quantity, null);
      continue;
    }
    const checkedSubject = LegacyMoneySubjectSchema.safeParse(
      selector.family === "PURCHASE"
        ? { family: "PURCHASE", itemId: row.itemId }
        : selector.family === "CUSTOM"
          ? { family: "CUSTOM", itemId: row.itemId, fieldDefinitionId: selector.definitionId }
          : {
              family: "CATALOG",
              entryId: row.entryId,
              revision: row.revision,
              definitionId: selector.definitionId,
              target:
                selector.target === "ENTRY"
                  ? { kind: "ENTRY" }
                  : { kind: "VARIANT", variantId: row.variantId },
            },
    );
    if (!checkedSubject.success) return integrity();
    visit(row.itemId, row.quantity, resolvedRow(tx, checkedSubject.data, user, row).view);
  }
}

/** Caller owns one active enclosing transaction and its budget; no transaction is opened here. */
export async function readMoneyFact(
  tx: SearchReadTransaction,
  s: MoneySubject,
  who: MoneyActor,
): Promise<MoneyView> {
  return (await resolveFact(tx, s, who)).view;
}

/** M4 internal batch-read foundation. Not exposed by a route yet. */
export async function readCatalogMoneyMap(
  tx: SearchReadTransaction,
  entryId: string,
  revision: number,
  who: MoneyActor,
): Promise<MoneyView[]> {
  return (await resolveCatalogMoneyMap(tx, entryId, revision, who)).map((f) => f.view);
}
async function resolveCatalogMoneyMap(
  tx: SearchReadTransaction,
  entryId: string,
  revision: number,
  who: MoneyActor,
): Promise<ResolvedMoneyFact[]> {
  const user = actor(who);
  if (
    !LegacyMoneyIdSchema.safeParse(entryId).success ||
    !Number.isInteger(revision) ||
    revision < 1 ||
    revision > 2147483647
  )
    return legacyMoneyFail("LEGACY_MONEY_INVALID");
  type MapRow = Row & {
    header: unknown | null;
    category: string | null;
    target: string | null;
    definition: string | null;
  };
  // One MVCC statement for header, raw paths, current events, direct origins and
  // revocations. No read per path, and no incoherent cross-chunk ReadCommitted map.
  const rows = await tx.$queryRaw<MapRow[]>(Prisma.sql`
WITH selected AS MATERIALIZED (
 SELECT r.snapshot,c."categoryTemplateId"::text AS category FROM "CatalogRevision" r
 JOIN "CatalogEntry" c ON c.id=r."entryId" WHERE r."entryId"=${entryId}::uuid AND r.revision=${revision}
), arrays AS MATERIALIZED (
 SELECT 'entry'::text AS target,s.snapshot->'attributes' AS attrs FROM selected s
 UNION ALL
 SELECT v->>'id',v->'attributes' FROM selected s,
 jsonb_array_elements(CASE WHEN jsonb_typeof(s.snapshot->'variants')='array' THEN CASE WHEN jsonb_array_length(s.snapshot->'variants')<=100 THEN s.snapshot->'variants' ELSE '[]'::jsonb END ELSE '[]'::jsonb END) v
), paths AS MATERIALIZED (
 SELECT a.target,v AS attribute,d.type AS "definitionType",d."categoryTemplateId"::text AS category,
 CASE WHEN v->>'definitionId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' COLLATE pg_catalog."C"
 THEN (v->>'definitionId')::uuid ELSE NULL::uuid END AS definition
 FROM arrays a CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(a.attrs)='array' THEN CASE WHEN jsonb_array_length(a.attrs)<=100 THEN a.attrs ELSE '[]'::jsonb END ELSE '[]'::jsonb END) v
 LEFT JOIN "CatalogAttributeDefinition" d ON d.id=CASE
 WHEN v->>'definitionId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' COLLATE pg_catalog."C"
 THEN (v->>'definitionId')::uuid ELSE NULL::uuid END
 WHERE v->>'type'='MONEY' OR d.type='MONEY'
)
SELECT s.snapshot AS header,s.category,NULL::text AS target,NULL::text AS definition,
 NULL::text AS amount,NULL::text AS currency,NULL::text AS generation,false AS bad,false AS "targetExists",NULL::text AS sequence,
 NULL::jsonb AS event,NULL::jsonb AS origin,NULL::text AS "revocationId",NULL::text AS "originOwnerId"
FROM selected s
UNION ALL
SELECT NULL::jsonb,p.category,p.target,p.attribute->>'definitionId',
 CASE WHEN jsonb_typeof(p.attribute->'value'->'amountMinor')='number' THEN p.attribute#>>'{value,amountMinor}' ELSE NULL END,
 CASE WHEN jsonb_typeof(p.attribute->'value'->'currency')='string' THEN p.attribute#>>'{value,currency}' ELSE NULL END,
 NULL::text,
 (p."definitionType" IS DISTINCT FROM 'MONEY' OR p.attribute->>'type' IS DISTINCT FROM 'MONEY' OR p.category IS DISTINCT FROM s.category OR
 pg_column_size(p.attribute)>2048 OR jsonb_typeof(p.attribute->'value') IS DISTINCT FROM 'object' OR
 jsonb_typeof(p.attribute->'value'->'amountMinor') IS DISTINCT FROM 'number' OR jsonb_typeof(p.attribute->'value'->'currency') IS DISTINCT FROM 'string' OR
 CASE WHEN jsonb_typeof(p.attribute->'value')='object' THEN (SELECT count(*) FROM jsonb_object_keys(p.attribute->'value'))<>2 ELSE false END),
 true,seq.sequence,${eventJson("e")},${eventJson("o")},rev.id::text,NULL::text
FROM paths p CROSS JOIN selected s
LEFT JOIN LATERAL (SELECT COALESCE(MAX(h.sequence),0)::text AS sequence FROM "CatalogMoneyInterpretationEvent" h
 WHERE h."entryId"=${entryId}::uuid AND h.revision=${revision} AND h."targetKey"=p.target AND h."definitionId"=p.definition) seq ON true
LEFT JOIN LATERAL (SELECT e.* FROM "CatalogMoneyInterpretationEvent" e
 WHERE e."entryId"=${entryId}::uuid AND e.revision=${revision} AND e."targetKey"=p.target AND e."definitionId"=p.definition AND e.operation<>'REVOKE' ORDER BY e.sequence DESC LIMIT 1) e ON true
LEFT JOIN "CatalogMoneyInterpretationEvent" o ON o.id=CASE WHEN e.operation IN ('AUTHOR','CLASSIFY') THEN e.id WHEN e.operation='COPY' THEN e."originEventId" ELSE NULL END
LEFT JOIN "CatalogMoneyInterpretationEvent" rev ON rev."revokedAssertionId"=o.id
LIMIT 10102`);
  if (rows.length === 0) return legacyMoneyFail("MONEY_NOT_FOUND");
  if (rows.length > 10101) return integrity();
  const headers = rows.filter((r) => r.header !== null);
  if (headers.length !== 1) return integrity();
  const header = headers[0]!;
  const parsed = CatalogSnapshotSchema.safeParse(header.header);
  if (
    !parsed.success ||
    parsed.data.id !== entryId ||
    parsed.data.categoryTemplateId !== header.category
  )
    return integrity();
  if (new Set(parsed.data.variants.map((v) => v.id)).size !== parsed.data.variants.length)
    return integrity();
  const seen = new Set<string>();
  const result: ResolvedMoneyFact[] = [];
  for (const row of rows) {
    if (row.header !== null) continue;
    if (row.target === null || row.definition === null) return integrity();
    const key = `${row.target}:${row.definition}`;
    if (seen.has(key)) return integrity();
    seen.add(key);
    const s = subject({
      family: "CATALOG",
      entryId,
      revision,
      target:
        row.target === "entry" ? { kind: "ENTRY" } : { kind: "VARIANT", variantId: row.target },
      definitionId: row.definition,
    });
    result.push(resolvedRow(tx, s, user, row));
  }
  return result;
}

/** M4 native writer foundation; caller owns the enclosing rollback/commit. */
type CatalogBatchDraft = Omit<Draft, "operation"> & { operation: "AUTHOR" | "COPY" | "RAW_WRITE" };
export async function applyCatalogMoneyRevision(
  tx: SearchReadTransaction,
  who: MoneyActor | null,
  input: unknown,
): Promise<void> {
  const parsed = catalogBatchSchema.safeParse(input);
  if (!parsed.success) return legacyMoneyFail("LEGACY_MONEY_INVALID");
  const data = parsed.data,
    user = who === null ? null : actor(who);
  if (user === null) {
    // Existing trusted canonical maintenance can invalidate raw meaning without
    // inventing a person. It can never author or carry an interpretation here.
    if (data.sourceRevision !== null || data.actions.some((a) => a.op !== "RAW_WRITE"))
      return legacyMoneyFail("MONEY_FORBIDDEN");
  } else await moderator(tx, user);
  // This read scope is not an account and is never stored as an event actor.
  const readWho = who ?? { userId: "catalog-public-read" };
  const parent = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM "CatalogEntry" WHERE id=${data.entryId}::uuid FOR UPDATE`,
  );
  if (parent.length !== 1) return legacyMoneyFail("MONEY_NOT_FOUND");
  // Equal-raw metadata invalidation must also advance the parent MVCC version.
  await tx.$queryRaw(
    Prisma.sql`UPDATE "CatalogEntry" SET id=id WHERE id=${data.entryId}::uuid RETURNING id`,
  );
  const copies = data.actions.filter(
    (a) =>
      a.op === "COPY" ||
      a.op === "VERIFY" ||
      (a.op === "AUTHOR" && a.expectedFactToken !== undefined),
  );
  if (copies.length && data.sourceRevision === null) return legacyMoneyFail("LEGACY_MONEY_INVALID");
  let source =
    data.sourceRevision === null
      ? []
      : await resolveCatalogMoneyMap(tx, data.entryId, data.sourceRevision, readWho);
  // Privacy erasure does not take the canonical parent lock. Hold actual direct
  // evidence rows while checking source tokens and writing their descendants.
  const originIds = [...new Set(source.flatMap((f) => (f.origin ? [f.origin.id] : [])))].sort();
  for (let i = 0; i < originIds.length; i += 500) {
    await tx.$queryRaw(
      Prisma.sql`SELECT e.id FROM "CatalogMoneyInterpretationEvent" e JOIN jsonb_array_elements_text(${JSON.stringify(originIds.slice(i, i + 500))}::jsonb) x(id) ON e.id=x.id::uuid ORDER BY e.id FOR SHARE OF e`,
    );
  }
  if (originIds.length)
    source = await resolveCatalogMoneyMap(tx, data.entryId, data.sourceRevision!, readWho);
  const destination =
    data.sourceRevision === data.destinationRevision
      ? source
      : await resolveCatalogMoneyMap(tx, data.entryId, data.destinationRevision, readWho);
  const key = (
    target: { kind: "ENTRY" } | { kind: "VARIANT"; variantId: string },
    definition: string,
  ) => `${target.kind === "ENTRY" ? "entry" : target.variantId}:${definition}`;
  const byPath = (facts: ResolvedMoneyFact[]) =>
    new Map(
      facts.map((f) => {
        const s = f.view.subject;
        if (s.family !== "CATALOG") return integrity();
        return [key(s.target, s.definitionId), f] as const;
      }),
    );
  const from = byPath(source),
    to = byPath(destination);
  const inserts: Array<{
    subject: Extract<MoneySubject, { family: "CATALOG" }>;
    sequence: string;
    draft: CatalogBatchDraft;
  }> = [];
  const actions = [...data.actions].sort((a, b) =>
    key(a.target, a.definitionId).localeCompare(key(b.target, b.definitionId), "en"),
  );
  for (const action of actions) {
    const path = key(action.target, action.definitionId),
      target = to.get(path);
    if (!target || target.view.raw === null) return legacyMoneyFail("MONEY_NOT_FOUND");
    const s = target.view.subject;
    if (s.family !== "CATALOG") return integrity();
    if (action.op === "VERIFY") {
      if (data.sourceRevision !== data.destinationRevision)
        return legacyMoneyFail("LEGACY_MONEY_INVALID");
      const original = from.get(path);
      if (!original || original.view.factToken !== action.expectedFactToken)
        return legacyMoneyFail("MONEY_CONFLICT");
      continue;
    }
    const next = BigInt(target.sequence) + 1n;
    if (next > 9223372036854775807n) return integrity();
    let draft: CatalogBatchDraft = {
      operation: "RAW_WRITE",
      raw: target.view.raw,
      generation: null,
    };
    if (action.op === "AUTHOR") {
      if (
        action.expectedFactToken !== undefined &&
        from.get(path)?.view.factToken !== action.expectedFactToken
      )
        return legacyMoneyFail("MONEY_CONFLICT");
      const receipt = action.receipt;
      const verified = parseLegacyMoneyAuthoring({
        kind: "RAW",
        profileId: receipt.profileId,
        currency: receipt.raw.currency,
        amountMinor: receipt.raw.amountMinor,
        exponent: receipt.exponent,
        unitKey: receipt.unitKey,
      });
      if (!equal(verified, receipt) || !equal(verified.raw, target.view.raw))
        return legacyMoneyFail("LEGACY_MONEY_INVALID");
      draft = {
        operation: "AUTHOR",
        raw: target.view.raw,
        generation: null,
        receipt,
        exponent: receipt.exponent,
        unitKey: receipt.unitKey,
        basisId: receipt.profileId,
      };
    } else if (action.op === "COPY") {
      const original = from.get(path);
      if (!original || !equal(original.view.raw, target.view.raw))
        return legacyMoneyFail("LEGACY_MONEY_INVALID");
      if (original.view.factToken !== action.expectedFactToken)
        return legacyMoneyFail("MONEY_CONFLICT");
      // Replacing a known destination with an unresolved historical source must
      // actively invalidate it, including when the raw snapshot is identical.
      if (original.view.interpretation.kind === "INTERPRETED") {
        if (!original.event || !original.origin) return integrity();
        draft = {
          operation: "COPY",
          raw: target.view.raw,
          generation: null,
          exponent: original.view.interpretation.exponent,
          unitKey: original.view.interpretation.unitKey,
          basisId: original.view.interpretation.basisId,
          unitLabel: original.origin.unitLabel,
          sourceEventId: original.event.id,
          originEventId: original.origin.id,
        };
      }
    }
    inserts.push({ subject: s, sequence: next.toString(), draft });
  }
  for (let i = 0; i < inserts.length; i += 500) {
    const chunk = inserts.slice(i, i + 500);
    const tuples = chunk.map(
      ({ subject: s, sequence, draft: d }) =>
        Prisma.sql`(${randomUUID()}::uuid,${s.entryId}::uuid,${s.revision},${s.target.kind === "ENTRY" ? "entry" : s.target.variantId},${s.target.kind === "ENTRY" ? null : s.target.variantId}::uuid,${s.definitionId}::uuid,${sequence}::bigint,${d.operation}::"MoneyInterpretationOperation",${d.raw.amountMinor}::bigint,${d.raw.currency},${d.exponent ?? null}::smallint,${d.unitKey ?? null},${d.unitLabel ?? null},${d.basisId ?? null},${d.receipt === undefined ? null : JSON.stringify(d.receipt)}::jsonb,${d.sourceEventId ?? null}::uuid,${d.originEventId ?? null}::uuid,${d.operation === "RAW_WRITE" ? null : user})`,
    );
    try {
      const saved = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`INSERT INTO "CatalogMoneyInterpretationEvent" (id,"entryId",revision,"targetKey","variantId","definitionId",sequence,operation,"rawAmountMinor","rawCurrency",exponent,"unitKey","unitLabel","basisId",receipt,"sourceEventId","originEventId","actorId") VALUES ${Prisma.join(tuples)} RETURNING id`,
      );
      if (saved.length !== chunk.length) return integrity();
    } catch (error) {
      if (isReadSerializationFailure(error)) return legacyMoneyFail("MONEY_CONFLICT");
      throw error;
    }
  }
}
const catalogBatchPath = {
  target: LegacyMoneySubjectSchema.options[2].shape.target,
  definitionId: LegacyMoneyIdSchema,
};
const catalogBatchAction = z.discriminatedUnion("op", [
  z
    .object({
      ...catalogBatchPath,
      op: z.literal("AUTHOR"),
      receipt: AuthoringReceiptSchema,
      expectedFactToken: ClassifyMoneyInputSchema.shape.expectedFactToken.optional(),
    })
    .strict(),
  z
    .object({
      ...catalogBatchPath,
      op: z.literal("COPY"),
      expectedFactToken: ClassifyMoneyInputSchema.shape.expectedFactToken,
    })
    .strict(),
  z
    .object({
      ...catalogBatchPath,
      op: z.literal("VERIFY"),
      expectedFactToken: ClassifyMoneyInputSchema.shape.expectedFactToken,
    })
    .strict(),
  z.object({ ...catalogBatchPath, op: z.literal("RAW_WRITE") }).strict(),
]);
const catalogBatchSchema = z
  .object({
    entryId: LegacyMoneyIdSchema,
    destinationRevision: LegacyMoneySubjectSchema.options[2].shape.revision,
    sourceRevision: LegacyMoneySubjectSchema.options[2].shape.revision.nullable(),
    actions: z
      .array(catalogBatchAction)
      .max(10100)
      .refine(
        (actions) =>
          new Set(
            actions.map(
              (a) =>
                `${a.target.kind === "ENTRY" ? "entry" : a.target.variantId}:${a.definitionId}`,
            ),
          ).size === actions.length,
      ),
  })
  .strict();

async function moderator(tx: SearchReadTransaction, user: string): Promise<void> {
  try {
    await requireApplicationModerator(
      {
        $queryRaw: <T>(parts: TemplateStringsArray, ...values: unknown[]) =>
          tx.$queryRaw<T>(Prisma.sql(parts, ...values)),
      },
      user,
    );
  } catch (error) {
    if (error instanceof ApplicationRoleError) return legacyMoneyFail("MONEY_FORBIDDEN");
    throw error;
  }
}
/** Lock actual authority before decoding any client equality precondition. */
async function lockSubject(
  tx: SearchReadTransaction,
  input: MoneySubject,
  who: MoneyActor,
): Promise<MoneySubject> {
  const s = subject(input),
    user = actor(who);
  if (s.family === "CATALOG") {
    await moderator(tx, user);
    const rows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM "CatalogEntry" WHERE id=${s.entryId}::uuid FOR UPDATE`,
    );
    if (rows.length !== 1) return legacyMoneyFail("MONEY_NOT_FOUND");
  } else {
    await tx.$queryRaw(
      Prisma.sql`SELECT c.id FROM "Collection" c WHERE c."ownerId"=${user} AND c."deletedAt" IS NULL AND c.id=(SELECT i."collectionId" FROM "CollectibleItem" i WHERE i.id=${s.itemId}::uuid AND i."ownerId"=${user} AND i."deletedAt" IS NULL) FOR SHARE OF c`,
    );
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
   SELECT i.id FROM "CollectibleItem" i JOIN "Collection" c ON c.id=i."collectionId" AND c."ownerId"=i."ownerId"
   WHERE i.id=${s.itemId}::uuid AND i."ownerId"=${user} AND i."deletedAt" IS NULL AND c."deletedAt" IS NULL FOR UPDATE OF i,c`);
    if (rows.length !== 1) return legacyMoneyFail("MONEY_NOT_FOUND");
    if (s.family === "CUSTOM") {
      const defs = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT d.id FROM "CustomFieldDefinition" d JOIN "CollectibleItem" i ON i."collectionId"=d."collectionId" WHERE i.id=${s.itemId}::uuid AND d.id=${s.fieldDefinitionId}::uuid AND d.type='MONEY' FOR UPDATE OF d`,
      );
      if (defs.length !== 1) return legacyMoneyFail("MONEY_NOT_FOUND");
    }
  }
  return s;
}
export async function requireMoneyToken(
  tx: SearchReadTransaction,
  input: MoneySubject,
  who: MoneyActor,
  token: unknown,
): Promise<ResolvedMoneyFact> {
  const s = await lockSubject(tx, input, who);
  decodeMoneyFactToken(token);
  const current = await resolveFact(tx, s, who);
  if (current.view.factToken !== token) return legacyMoneyFail("MONEY_CONFLICT");
  return current;
}
async function refreshResolved(
  tx: SearchReadTransaction,
  fact: ResolvedMoneyFact,
  user?: string,
): Promise<ResolvedMoneyFact> {
  const brand = fact?.[resolvedBrand];
  if (!brand || brand.tx !== tx || (user !== undefined && brand.user !== user))
    return legacyMoneyFail("MONEY_FORBIDDEN");
  const fresh = await resolveFact(tx, fact.view.subject, { userId: brand.user });
  if (fresh.view.factToken !== fact.view.factToken) return legacyMoneyFail("MONEY_CONFLICT");
  return fresh;
}
type Draft = {
  id?: string;
  operation: "AUTHOR" | "CLASSIFY" | "COPY" | "REVOKE";
  raw: RawMoney;
  generation: string | null;
  exponent?: number;
  unitKey?: string;
  unitLabel?: string | null;
  basisId?: string;
  receipt?: unknown;
  sourceEventId?: string;
  originEventId?: string;
  revokedAssertionId?: string;
  evidenceCategory?: "OWNER_ATTESTATION" | "OPERATOR_VERIFIED_RECORD";
  evidenceReference?: string;
  reason?: string;
};
async function appendEvent(
  tx: SearchReadTransaction,
  s: MoneySubject,
  user: string,
  sequence: string,
  d: Draft,
): Promise<void> {
  const next = BigInt(sequence) + 1n;
  if (next > 9223372036854775807n) return integrity();
  const columns =
    s.family === "PURCHASE"
      ? Prisma.raw('"itemId",generation')
      : s.family === "CUSTOM"
        ? Prisma.raw('"itemId","fieldDefinitionId",generation')
        : Prisma.raw('"entryId",revision,"targetKey","variantId","definitionId"');
  const values =
    s.family === "PURCHASE"
      ? Prisma.sql`${s.itemId}::uuid,${d.generation}::uuid`
      : s.family === "CUSTOM"
        ? Prisma.sql`${s.itemId}::uuid,${s.fieldDefinitionId}::uuid,${d.generation}::uuid`
        : Prisma.sql`${s.entryId}::uuid,${s.revision},${s.target.kind === "ENTRY" ? "entry" : s.target.variantId},${s.target.kind === "ENTRY" ? null : s.target.variantId}::uuid,${s.definitionId}::uuid`;
  await tx.$queryRaw(Prisma.sql`INSERT INTO ${table(s)}
  (id,sequence,operation,"rawAmountMinor","rawCurrency",exponent,"unitKey","unitLabel","basisId",receipt,"sourceEventId","originEventId","revokedAssertionId","actorId","evidenceCategory","evidenceReference",reason,${columns})
  VALUES (${d.id ?? randomUUID()}::uuid,${next.toString()}::bigint,${d.operation}::"MoneyInterpretationOperation",${d.raw.amountMinor}::bigint,${d.raw.currency},${d.exponent ?? null}::smallint,${d.unitKey ?? null},${d.unitLabel ?? null},${d.basisId ?? null},${d.receipt === undefined ? null : JSON.stringify(d.receipt)}::jsonb,${d.sourceEventId ?? null}::uuid,${d.originEventId ?? null}::uuid,${d.revokedAssertionId ?? null}::uuid,${user},${d.evidenceCategory ?? null}::"MoneyEvidenceCategory",${d.evidenceReference ?? null},${d.reason ?? null},${values}) RETURNING id`);
}
const assertionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("AUTHOR"),
      receipt: AuthoringReceiptSchema,
      correctionReason: CorrectMoneyInputSchema.shape.correctionReason.optional(),
    })
    .strict(),
  z.object({ kind: z.literal("CLASSIFY"), input: ClassifyMoneyInputSchema }).strict(),
]);
export async function appendMoneyAssertion(
  tx: SearchReadTransaction,
  fact: ResolvedMoneyFact,
  input: unknown,
): Promise<MoneyView> {
  const fresh = await refreshResolved(tx, fact),
    s = fresh.view.subject,
    user = fresh[resolvedBrand].user;
  const parsed = assertionSchema.safeParse(input);
  if (!parsed.success) return legacyMoneyFail("LEGACY_MONEY_INVALID");
  if (fresh.view.raw === null) return legacyMoneyFail("MONEY_CONFLICT");
  const id = randomUUID();
  let draft: Draft;
  if (parsed.data.kind === "AUTHOR") {
    const receipt = parsed.data.receipt;
    const verified = parseLegacyMoneyAuthoring({
      kind: "RAW",
      profileId: receipt.profileId,
      currency: receipt.raw.currency,
      amountMinor: receipt.raw.amountMinor,
      exponent: receipt.exponent,
      unitKey: receipt.unitKey,
    });
    if (!equal(verified, receipt) || !equal(verified.raw, fresh.view.raw))
      return legacyMoneyFail("LEGACY_MONEY_INVALID");
    draft = {
      id,
      operation: "AUTHOR",
      raw: fresh.view.raw,
      generation: fresh.generation,
      exponent: receipt.exponent,
      unitKey: receipt.unitKey,
      basisId: receipt.profileId,
      ...(parsed.data.correctionReason === undefined
        ? {}
        : { reason: parsed.data.correctionReason }),
      receipt,
    };
  } else {
    const { input: classification } = parsed.data;
    decodeMoneyFactToken(classification.expectedFactToken);
    if (classification.expectedFactToken !== fresh.view.factToken)
      return legacyMoneyFail("MONEY_CONFLICT");
    if (s.family === "CATALOG" && classification.evidence.category !== "OPERATOR_VERIFIED_RECORD")
      return legacyMoneyFail("MONEY_FORBIDDEN");
    if (classification.evidence.category === "OPERATOR_VERIFIED_RECORD") await moderator(tx, user);
    const unit = validateLegacyUnit(fresh.view.raw.currency, classification.unit, id);
    draft = {
      id,
      operation: "CLASSIFY",
      raw: fresh.view.raw,
      generation: fresh.generation,
      exponent: classification.exponent,
      unitKey: unit.unitKey,
      unitLabel: classification.unit.kind === "UNSUPPORTED" ? classification.unit.label : null,
      basisId: `${classification.evidence.category}:v1`,
      evidenceCategory: classification.evidence.category,
      ...(classification.evidence.reference === undefined
        ? {}
        : { evidenceReference: classification.evidence.reference }),
      reason: classification.evidence.reason,
    };
  }
  await appendEvent(tx, s, user, fresh.sequence, draft);
  return readMoneyFact(tx, s, { userId: user });
}
export async function copyMoneyFact(
  tx: SearchReadTransaction,
  source: ResolvedMoneyFact,
  destination: ResolvedMoneyFact,
  who: MoneyActor,
): Promise<MoneyView> {
  const user = actor(who),
    from = await refreshResolved(tx, source, user),
    to = await refreshResolved(tx, destination, user);
  if (
    from.view.subject.family !== to.view.subject.family ||
    !equal(from.view.raw, to.view.raw) ||
    equal(from.view.subject, to.view.subject)
  )
    return legacyMoneyFail("LEGACY_MONEY_INVALID");
  if (to.event && !["RAW_WRITE", "CLEAR", "BASELINE"].includes(to.event.operation))
    return legacyMoneyFail("LEGACY_MONEY_INVALID");
  const a = from.view.subject,
    b = to.view.subject;
  if (a.family === "CUSTOM" && b.family === "CUSTOM" && a.fieldDefinitionId !== b.fieldDefinitionId)
    return legacyMoneyFail("LEGACY_MONEY_INVALID");
  if (
    a.family === "CATALOG" &&
    b.family === "CATALOG" &&
    (a.entryId !== b.entryId || a.definitionId !== b.definitionId || !equal(a.target, b.target))
  )
    return legacyMoneyFail("LEGACY_MONEY_INVALID");
  // Unknown source meaning is never promoted by copying raw values.
  if (from.view.interpretation.kind !== "INTERPRETED") return to.view;
  if (!from.event || !from.origin || !to.view.raw) return integrity();
  try {
    await appendEvent(tx, to.view.subject, user, to.sequence, {
      operation: "COPY",
      raw: to.view.raw,
      generation: to.generation,
      exponent: from.view.interpretation.exponent,
      unitKey: from.view.interpretation.unitKey,
      unitLabel: from.origin.unitLabel,
      basisId: from.view.interpretation.basisId,
      sourceEventId: from.event.id,
      originEventId: from.origin.id,
    });
  } catch (error) {
    // Under ReadCommitted a flattened origin can be invalidated after refresh.
    // Only the native stale-origin/serialization signal becomes a domain conflict;
    // genuine constraint/invariant failures must retain their diagnostic boundary.
    if (isReadSerializationFailure(error)) return legacyMoneyFail("MONEY_CONFLICT");
    throw error;
  }
  return readMoneyFact(tx, to.view.subject, who);
}
async function assertionState(tx: SearchReadTransaction, s: MoneySubject, id: string) {
  if (!LegacyMoneyIdSchema.safeParse(id).success) return legacyMoneyFail("LEGACY_MONEY_INVALID");
  const rows = await tx.$queryRaw<Array<{ event: unknown; revocationId: string | null }>>(
    Prisma.sql`SELECT ${eventJson("e")} AS event,r.id::text AS "revocationId" FROM ${table(s)} e LEFT JOIN ${table(s)} r ON r."revokedAssertionId"=e.id WHERE ${predicate(s, "e")} AND e.id=${id}::uuid AND e.operation IN ('AUTHOR','CLASSIFY')`,
  );
  if (rows.length !== 1) return legacyMoneyFail("MONEY_NOT_FOUND");
  const e = event(rows[0]!.event);
  if (!e) return integrity();
  return {
    event: e,
    revocationId: rows[0]!.revocationId,
    token: encodeMoneyAssertionToken({
      v: 1,
      subject: s,
      assertionId: id,
      evidenceErasedAt: timestamp(e.evidenceErasedAt),
      revocationId: rows[0]!.revocationId,
    }),
  };
}
export async function readMoneyAssertion(
  tx: SearchReadTransaction,
  input: MoneySubject,
  who: MoneyActor,
  id: string,
): Promise<{ expectedAssertionToken: string }> {
  const s = await lockSubject(tx, input, who);
  return { expectedAssertionToken: (await assertionState(tx, s, id)).token };
}
export async function revokeMoneyAssertion(
  tx: SearchReadTransaction,
  input: MoneySubject,
  value: unknown,
  who: MoneyActor,
): Promise<void> {
  const s = await lockSubject(tx, input, who),
    user = actor(who);
  const parsed = RevokeMoneyInputSchema.safeParse(value);
  if (!parsed.success) return legacyMoneyFail("LEGACY_MONEY_INVALID");
  const request = parsed.data,
    actual = await assertionState(tx, s, request.assertionId);
  decodeMoneyAssertionToken(request.expectedAssertionToken);
  if (actual.token !== request.expectedAssertionToken || actual.revocationId !== null)
    return legacyMoneyFail("MONEY_CONFLICT");
  const fresh = await resolveFact(tx, s, who),
    r = raw(actual.event.rawAmountMinor, actual.event.rawCurrency);
  if (!r) return integrity();
  await appendEvent(tx, s, user, fresh.sequence, {
    operation: "REVOKE",
    raw: r,
    generation: actual.event.generation ?? null,
    revokedAssertionId: actual.event.id,
    reason: request.reason,
  });
}
export async function eraseMoneyEvidenceForActor(
  tx: SearchReadTransaction,
  who: MoneyActor,
  targetActorId: string,
): Promise<void> {
  const user = actor(who);
  if (user !== targetActorId) return legacyMoneyFail("MONEY_FORBIDDEN");
  for (const family of ["PURCHASE", "CUSTOM", "CATALOG"] as const) {
    const t = Prisma.raw(
      family === "PURCHASE"
        ? '"PurchaseMoneyInterpretationEvent"'
        : family === "CUSTOM"
          ? '"CustomMoneyInterpretationEvent"'
          : '"CatalogMoneyInterpretationEvent"',
    );
    await tx.$queryRaw(
      Prisma.sql`WITH erased AS (UPDATE ${t} SET "actorId"=NULL WHERE "actorId"=${user} AND operation='AUTHOR' AND reason IS NULL RETURNING 1) SELECT count(*)::text AS count FROM erased`,
    );
    await tx.$queryRaw(
      Prisma.sql`WITH erased AS (UPDATE ${t} SET "actorId"=NULL,"evidenceReference"=NULL,reason=NULL,"evidenceErasedAt"=transaction_timestamp()::timestamptz(3) WHERE "actorId"=${user} AND (operation<>'AUTHOR' OR reason IS NOT NULL) AND "evidenceErasedAt" IS NULL RETURNING 1) SELECT count(*)::text AS count FROM erased`,
    );
  }
}
