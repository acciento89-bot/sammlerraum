import { createHash } from "node:crypto";
import {
  MoneyExportItemSchema,
  MoneyExportOptionsSchema,
  MoneyExportSelectorSchema,
  MoneyExportSnapshotV1Schema,
  MoneyImportRowV1Schema,
  ValidatedMoneyImportRowSchema,
  MoneyTransferError,
  MONEY_EXPORT_MAX_ITEMS,
  MONEY_EXPORT_MAX_BYTES,
  type MoneyExportItem,
  type MoneyExportOptions,
  type MoneyExportRow,
  type MoneyExportSnapshotV1,
  type ValidatedMoneyImportRow,
} from "@sammlerraum/contracts/money-transfer";
import { MoneyViewSchema, type MoneyView } from "@sammlerraum/contracts/legacy-money";
import type { PurchaseCostGroup } from "@sammlerraum/contracts/money-coverage";
import { parseLegacyMoneyAuthoring } from "./legacy-money-policy";
import { decodeMoneyFactToken } from "./legacy-money-tokens";

function fail(code: MoneyTransferError["code"]): never {
  throw new MoneyTransferError(code);
}
function transferValue<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) return fail("MONEY_TRANSFER_INVALID");
  return result.data;
}
function selectorPath(path: string) {
  if (typeof path !== "string" || path.length > 256) return fail("MONEY_TRANSFER_INVALID");
  try {
    return transferValue(MoneyExportSelectorSchema, JSON.parse(path));
  } catch {
    return fail("MONEY_TRANSFER_INVALID");
  }
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
/** Validation does not write. Durable row idempotency and writer CAS belong to the import job. */
export function validateMoneyImportRow(
  input: unknown,
  expectedPreview?: unknown,
): ValidatedMoneyImportRow {
  const error =
    expectedPreview === undefined ? "MONEY_TRANSFER_INVALID" : "MONEY_TRANSFER_CONFLICT";
  try {
    const source = MoneyImportRowV1Schema.parse(input);
    let meaning:
      | { kind: "CANONICAL"; receipt: ReturnType<typeof parseLegacyMoneyAuthoring> }
      | { kind: "LEGACY_UNKNOWN"; raw: { amountMinor: string; currency: string } };
    if (source.profileId === null) {
      if (
        source.sourceKind !== "RAW" ||
        source.sourceContract !== "LEGACY_UNKNOWN_RAW_V1" ||
        "kind" in source.authoring
      )
        return fail(error);
      meaning = { kind: "LEGACY_UNKNOWN", raw: source.authoring };
    } else {
      if (
        !("kind" in source.authoring) ||
        source.authoring.profileId !== source.profileId ||
        source.authoring.kind !== source.sourceKind
      )
        return fail(error);
      if (
        source.sourceKind === "RAW"
          ? source.sourceContract !== "CANONICAL_MINOR_UNITS_V1"
          : source.sourceContract !== undefined
      )
        return fail(error);
      meaning = { kind: "CANONICAL", receipt: parseLegacyMoneyAuthoring(source.authoring) };
    }
    const result = ValidatedMoneyImportRowSchema.parse({
      schemaVersion: 1,
      source,
      sourceDigest: createHash("sha256").update(stable(source)).digest("hex"),
      ...meaning,
    });
    if (expectedPreview !== undefined) {
      const expected = ValidatedMoneyImportRowSchema.safeParse(expectedPreview);
      if (!expected.success || stable(expected.data) !== stable(result))
        return fail("MONEY_TRANSFER_CONFLICT");
    }
    return freeze(result);
  } catch {
    return fail(error);
  }
}
export type MoneyExportMetadata = {
  asOf: string;
  items: readonly MoneyExportItem[];
  requestedPaths: readonly string[];
  options: MoneyExportOptions;
  totals: PurchaseCostGroup[] | null;
};
export type MoneyExportFact = { itemId: string; requestedPath: string; view: MoneyView | null };

/** Private capture owns all rows. No caller can observe a partially checked artifact. */
class SnapshotCapture {
  private readonly items = new Map<string, MoneyExportItem>();
  private readonly paths = new Map<string, ReturnType<typeof MoneyExportSelectorSchema.parse>>();
  private readonly rows: MoneyExportRow[] = [];
  private readonly seen = new Set<string>();
  private rowBytes = 0;
  private readonly options: MoneyExportOptions;
  private readonly complete: boolean;
  private readonly counts = {
    selectedItems: 0,
    selectedPaths: 0,
    missingPaths: 0,
    presentPaths: 0,
    eligiblePaths: 0,
    unknownPaths: 0,
    ineligiblePaths: 0,
  };
  private selectedUnits = 0n;
  private missingUnits = 0n;
  private presentUnits = 0n;
  constructor(
    private readonly metadata: MoneyExportMetadata,
    private readonly checkBudget: () => void,
  ) {
    checkBudget();
    if (metadata.items.length > MONEY_EXPORT_MAX_ITEMS) fail("MONEY_EXPORT_LIMIT_EXCEEDED");
    this.options = transferValue(MoneyExportOptionsSchema, metadata.options);
    this.complete =
      this.options.mode === "INTERPRETED" && this.options.completeness === "REQUIRE_COMPLETE";
    for (const candidate of metadata.items) {
      checkBudget();
      const item = transferValue(MoneyExportItemSchema, candidate);
      if (this.items.has(item.itemId)) return fail("MONEY_TRANSFER_INVALID");
      this.items.set(item.itemId, item);
      this.selectedUnits += BigInt(item.quantity);
    }
    this.counts.selectedItems = this.items.size;
    for (const path of metadata.requestedPaths) {
      checkBudget();
      const selector = selectorPath(path);
      if (
        JSON.stringify(selector) !== path ||
        selector.family !== this.options.measure ||
        this.paths.has(path)
      )
        return fail("MONEY_TRANSFER_INVALID");
      this.paths.set(path, selector);
    }
    if (!this.paths.size || (this.options.measure === "PURCHASE" && this.paths.size !== 1))
      return fail("MONEY_TRANSFER_INVALID");
    if ((this.complete && this.options.measure === "PURCHASE") !== (metadata.totals !== null))
      return fail("MONEY_EXPORT_INCOMPLETE");
    if (this.bytes(this.counts, 0, 0n, 0n) > MONEY_EXPORT_MAX_BYTES)
      return fail("MONEY_EXPORT_LIMIT_EXCEEDED");
  }
  private envelope(counts = this.counts, missing = this.missingUnits, present = this.presentUnits) {
    return {
      schemaVersion: 1 as const,
      asOf: this.metadata.asOf,
      measure: this.options.measure,
      mode: this.options.mode,
      completeness: this.options.mode === "RAW" ? null : this.options.completeness,
      requestedPaths: [...this.paths.keys()],
      coverage:
        this.options.measure === "PURCHASE"
          ? {
              ...counts,
              selectedUnits: this.selectedUnits.toString(),
              missingUnits: missing.toString(),
              presentUnits: present.toString(),
            }
          : { ...counts },
      rows: [] as MoneyExportRow[],
      totals: this.metadata.totals,
    };
  }
  private bytes(counts: typeof this.counts, rowBytes: number, missing: bigint, present: bigint) {
    return (
      Buffer.byteLength(JSON.stringify(this.envelope(counts, missing, present)), "utf8") +
      rowBytes +
      Math.max(0, counts.selectedPaths - 1)
    );
  }
  append(input: MoneyExportFact): void {
    this.checkBudget();
    const item = this.items.get(input.itemId),
      selector = this.paths.get(input.requestedPath),
      key = `${input.itemId}:${input.requestedPath}`;
    if (!item || !selector || this.seen.has(key)) return fail("MONEY_TRANSFER_INVALID");
    const view = input.view === null ? null : transferValue(MoneyViewSchema, input.view);
    let subject: MoneyExportRow["subject"] = null,
      fact: MoneyExportRow["fact"] = null;
    if (view !== null) {
      subject = view.subject;
      if (subject.family !== selector.family) return fail("MONEY_TRANSFER_INVALID");
      if (subject.family === "PURCHASE" && subject.itemId !== item.itemId)
        return fail("MONEY_TRANSFER_INVALID");
      if (
        subject.family === "CUSTOM" &&
        (selector.family !== "CUSTOM" ||
          subject.itemId !== item.itemId ||
          subject.fieldDefinitionId !== selector.definitionId)
      )
        return fail("MONEY_TRANSFER_INVALID");
      if (
        subject.family === "CATALOG" &&
        (selector.family !== "CATALOG" ||
          subject.entryId !== item.catalogEntryId ||
          subject.revision !== item.catalogRevision ||
          subject.definitionId !== selector.definitionId ||
          (selector.target === "ENTRY"
            ? subject.target.kind !== "ENTRY"
            : subject.target.kind !== "VARIANT" ||
              subject.target.variantId !== item.catalogVariantId))
      )
        return fail("MONEY_TRANSFER_INVALID");
      const token = decodeMoneyFactToken(view.factToken);
      if (stable(token.subject) !== stable(subject) || stable(token.raw) !== stable(view.raw))
        return fail("MONEY_TRANSFER_INVALID");
      if (
        view.interpretation.kind === "INTERPRETED" &&
        (token.effectiveEventId !== view.interpretation.eventId ||
          token.originId !== view.interpretation.assertionId ||
          token.revocationId !== null ||
          token.originEvidenceErasedAt !== null)
      )
        return fail("MONEY_TRANSFER_INVALID");
      const {
        generation,
        sequence,
        effectiveEventId,
        originId,
        originEvidenceErasedAt,
        revocationId,
      } = token;
      fact = {
        generation,
        sequence,
        effectiveEventId,
        originId,
        originEvidenceErasedAt,
        revocationId,
      };
    }
    const meaning = view?.interpretation;
    const interpretation: MoneyExportRow["interpretation"] =
      !meaning || meaning.kind === "MISSING"
        ? { kind: "MISSING" }
        : meaning.kind === "UNKNOWN"
          ? { kind: "UNKNOWN" }
          : {
              kind: "INTERPRETED",
              exponent: meaning.exponent,
              unitKey: meaning.unitKey,
              eligibility: meaning.eligibility,
              ...(this.complete ? { decimal: meaning.decimal } : {}),
            };
    if (
      this.complete &&
      (interpretation.kind !== "INTERPRETED" || interpretation.eligibility !== "ELIGIBLE")
    )
      return fail("MONEY_EXPORT_INCOMPLETE");
    const row: MoneyExportRow = {
      rowNumber: (this.rows.length + 1).toString(),
      itemId: item.itemId,
      title: item.title,
      quantity: item.quantity,
      requestedPath: input.requestedPath,
      subject,
      raw: view?.raw ?? null,
      fact,
      interpretation,
    };
    const counts = { ...this.counts, selectedPaths: this.counts.selectedPaths + 1 };
    const missing = interpretation.kind === "MISSING";
    counts[missing ? "missingPaths" : "presentPaths"]++;
    if (!missing)
      counts[
        interpretation.kind === "UNKNOWN"
          ? "unknownPaths"
          : interpretation.kind === "INTERPRETED" && interpretation.eligibility === "ELIGIBLE"
            ? "eligiblePaths"
            : "ineligiblePaths"
      ]++;
    const missingUnits = this.missingUnits + (missing ? BigInt(item.quantity) : 0n),
      presentUnits = this.presentUnits + (!missing ? BigInt(item.quantity) : 0n);
    const bytes = this.rowBytes + Buffer.byteLength(JSON.stringify(row), "utf8");
    if (this.bytes(counts, bytes, missingUnits, presentUnits) > MONEY_EXPORT_MAX_BYTES)
      return fail("MONEY_EXPORT_LIMIT_EXCEEDED");
    Object.assign(this.counts, counts);
    this.missingUnits = missingUnits;
    this.presentUnits = presentUnits;
    this.rowBytes = bytes;
    this.rows.push(row);
    this.seen.add(key);
  }
  finish(): MoneyExportSnapshotV1 {
    this.checkBudget();
    if (this.rows.length !== this.items.size * this.paths.size)
      return fail("MONEY_TRANSFER_INVALID");
    if (this.complete && this.options.measure === "PURCHASE") {
      const groups = new Map<string, bigint>();
      for (const row of this.rows) {
        this.checkBudget();
        if (row.raw === null || row.interpretation.kind !== "INTERPRETED")
          return fail("MONEY_EXPORT_INCOMPLETE");
        const key = JSON.stringify([
          row.raw.currency,
          row.interpretation.unitKey,
          row.interpretation.exponent,
        ]);
        groups.set(
          key,
          (groups.get(key) ?? 0n) + BigInt(row.raw.amountMinor) * BigInt(row.quantity),
        );
      }
      const supplied = this.metadata.totals ?? [];
      if (
        supplied.length !== groups.size ||
        new Set(supplied.map((g) => JSON.stringify([g.currency, g.unitKey, g.exponent]))).size !==
          supplied.length ||
        supplied.some(
          (g) =>
            groups.get(JSON.stringify([g.currency, g.unitKey, g.exponent]))?.toString() !==
            g.totalMinor,
        )
      )
        return fail("MONEY_TRANSFER_INVALID");
    }
    const snapshot = { ...this.envelope(), rows: this.rows };
    if (Buffer.byteLength(JSON.stringify(snapshot), "utf8") > MONEY_EXPORT_MAX_BYTES)
      return fail("MONEY_EXPORT_LIMIT_EXCEEDED");
    const parsed = MoneyExportSnapshotV1Schema.safeParse(snapshot);
    if (!parsed.success) return fail("MONEY_TRANSFER_INVALID");
    this.checkBudget();
    return freeze(parsed.data);
  }
}
/** Same incremental capture used by database exports; caller supplies no output sink. */
export function buildMoneyExportSnapshot(
  metadata: MoneyExportMetadata,
  facts: Iterable<MoneyExportFact>,
  checkBudget: () => void,
): MoneyExportSnapshotV1 {
  const capture = new SnapshotCapture(metadata, checkBudget);
  for (const fact of facts) capture.append(fact);
  return capture.finish();
}

import { Prisma } from "@sammlerraum/db/search-sql";
import { z } from "zod";
import type { ItemFilterLeaf } from "@sammlerraum/contracts/search";
import type { BoundedSearchReadTransaction } from "../search/search-read";
import { candidateFrom, ownedCandidates, referencePredicate } from "../search/search-compiler";
import {
  moneyScopeCandidates,
  readOwnedMoneyCoverage,
  type AuthorizedOuterMoneyScope,
} from "../search/legacy-money-query";
import { visitOwnedMoneySelectorFacts } from "./legacy-money-store";
import { readPurchaseCost } from "./purchase-cost";
import type { MoneyExportSelector } from "@sammlerraum/contracts/money-transfer";
export type AuthorizedMoneyExportSelection = {
  scope: AuthorizedOuterMoneyScope;
  matchedPredicate?: Prisma.Sql;
  selectors: readonly MoneyExportSelector[];
};
/**
 * Server-only selection, captured in the caller's bounded RepeatableRead.
 * Rechecks ownership independently of its trusted query predicate. Nothing is
 * streamed to an archive until this complete immutable value has been returned.
 */
export async function captureMoneyExport(
  tx: BoundedSearchReadTransaction,
  selection: AuthorizedMoneyExportSelection,
  input: MoneyExportOptions,
): Promise<MoneyExportSnapshotV1> {
  tx.checkBudget();
  const checked = MoneyExportOptionsSchema.safeParse(input),
    owner = z.string().min(1).safeParse(selection.scope.ownerId);
  if (!checked.success || !owner.success || !selection.selectors.length)
    return fail("MONEY_TRANSFER_INVALID");
  const options = checked.data,
    selectors = selection.selectors.map((s) => transferValue(MoneyExportSelectorSchema, s));
  const requestedPaths = selectors.map((s) => JSON.stringify(s));
  if (
    selectors.some((s) => s.family !== options.measure) ||
    new Set(requestedPaths).size !== selectors.length ||
    (options.measure === "PURCHASE" && selectors.length !== 1)
  )
    return fail("MONEY_TRANSFER_INVALID");
  if (Buffer.byteLength(JSON.stringify(requestedPaths), "utf8") > MONEY_EXPORT_MAX_BYTES)
    return fail("MONEY_EXPORT_LIMIT_EXCEEDED");
  const scope = {
    ownerId: owner.data,
    predicate: Prisma.sql`(${ownedCandidates(owner.data, "ALL")}) AND (${selection.scope.predicate})`,
  };
  const predicate = Prisma.sql`(${scope.predicate}) ${selection.matchedPredicate ? Prisma.sql`AND (${selection.matchedPredicate})` : Prisma.empty}`;
  const [count] = await tx.$queryRaw<{ total: string; asOf: Date }[]>(
    Prisma.sql`SELECT count(*)::text AS total,transaction_timestamp() AS "asOf" ${candidateFrom} WHERE ${predicate}`,
  );
  if (!count || !/^(0|[1-9][0-9]*)$/u.test(count.total) || !(count.asOf instanceof Date))
    return fail("MONEY_TRANSFER_INVALID");
  if (BigInt(count.total) > BigInt(MONEY_EXPORT_MAX_ITEMS))
    return fail("MONEY_EXPORT_LIMIT_EXCEEDED");
  const nodes: ItemFilterLeaf[] = selectors.flatMap<ItemFilterLeaf>((s) =>
    s.family === "PURCHASE"
      ? []
      : s.family === "CUSTOM"
        ? [
            {
              kind: "customField" as const,
              selector: {
                source: "CUSTOM" as const,
                collectionId: s.collectionId,
                definitionId: s.definitionId,
              },
              predicate: { valueType: "MONEY" as const, test: { op: "present" as const } },
            },
          ]
        : [
            {
              kind: "catalogAttribute" as const,
              selector: {
                source: "CATALOG" as const,
                categoryTemplateId: s.categoryTemplateId,
                definitionId: s.definitionId,
                target: s.target,
              },
              predicate: { valueType: "MONEY" as const, test: { op: "present" as const } },
            },
          ],
  );
  // Even an empty selection must not accept a foreign/deleted field reference.
  for (let offset = 0; offset < nodes.length; offset += 500) {
    const [references] = await tx.$queryRaw<{ valid: boolean }[]>(
      Prisma.sql`SELECT ${referencePredicate(nodes.slice(offset, offset + 500), owner.data)} AS valid`,
    );
    if (references?.valid !== true) return fail("MONEY_TRANSFER_INVALID");
  }
  const complete = options.mode === "INTERPRETED" && options.completeness === "REQUIRE_COMPLETE";
  let totals: PurchaseCostGroup[] | null = null;
  if (complete) {
    if (options.measure === "PURCHASE") {
      const costs = await readPurchaseCost(tx, scope, selection.matchedPredicate);
      if (costs.state !== "COMPLETE" && costs.state !== "EMPTY")
        return fail("MONEY_EXPORT_INCOMPLETE");
      totals = costs.groups;
    } else
      for (const selector of selectors) {
        const coverage = await readOwnedMoneyCoverage(tx, scope, selector);
        if (coverage.unknownPaths || coverage.ineligiblePaths)
          return fail("MONEY_EXPORT_INCOMPLETE");
      }
  }
  const items = await tx.$queryRaw<MoneyExportItem[]>(
    Prisma.sql`SELECT i.id AS "itemId",i.title,i.quantity::text AS quantity,i."catalogEntryId",i."catalogVariantId",ce.revision AS "catalogRevision" ${candidateFrom} LEFT JOIN "CatalogEntry" ce ON ce.id=i."catalogEntryId" WHERE ${predicate} ORDER BY i.id LIMIT ${MONEY_EXPORT_MAX_ITEMS}`,
  );
  if (items.length !== Number(count.total)) return fail("MONEY_TRANSFER_INVALID");
  const quantities = new Map(items.map((i) => [i.itemId, i.quantity]));
  const capture = new SnapshotCapture(
    { asOf: count.asOf.toISOString(), items, requestedPaths, options, totals },
    () => tx.checkBudget(),
  );
  for (const selector of selectors) {
    const path = JSON.stringify(selector);
    await visitOwnedMoneySelectorFacts(
      tx,
      { userId: owner.data },
      selector,
      moneyScopeCandidates(scope, selection.matchedPredicate),
      (itemId, quantity, view) => {
        if (quantities.get(itemId) !== quantity.toString()) return fail("MONEY_TRANSFER_INVALID");
        capture.append({ itemId, requestedPath: path, view });
      },
    );
  }
  return capture.finish();
}
