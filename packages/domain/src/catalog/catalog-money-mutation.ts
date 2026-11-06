import { z } from "zod";
import type { CatalogTransaction } from "@sammlerraum/db/catalog-types";
import type { CatalogEntryRevision } from "@sammlerraum/contracts/catalog";
import {
  CatalogProposalOperationSchema,
  StoredProposalMoneyEnvelopeSchema,
  type CatalogProposalOperation,
  type StoredProposalMoneyEnvelope,
} from "@sammlerraum/contracts/catalog-proposals";
import {
  HistoricalMoneyValueSchema,
  legacyMoneyFail,
  type MoneyView,
} from "@sammlerraum/contracts/legacy-money";
import { ApplicationRoleError, requireApplicationModerator } from "../authz/application-role";
import { moneyTransaction } from "../money/legacy-money-transaction";
import { readCatalogMoneyMap, applyCatalogMoneyRevision } from "../money/legacy-money-store";
import { digestCatalogMoneyPatch } from "./catalog-money-envelope";

export type CatalogMoneyMutationContext =
  | { kind: "LEGACY"; actorId?: string | undefined }
  | { kind: "VALIDATED"; actorId: string; envelope: StoredProposalMoneyEnvelope };
const actor = z.string().min(1).max(512);
const contextSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("LEGACY"), actorId: actor.optional() }).strict(),
  z
    .object({
      kind: z.literal("VALIDATED"),
      actorId: actor,
      envelope: StoredProposalMoneyEnvelopeSchema,
    })
    .strict(),
]);
const planBrand = Symbol("actual canonical money mutation transaction");
export type CatalogMoneyMutationPlan = {
  readonly [planBrand]: CatalogTransaction;
  readonly context: CatalogMoneyMutationContext;
  readonly operation: CatalogProposalOperation;
  readonly base: CatalogEntryRevision | null;
  readonly before: MoneyView[];
};
const pathKey = (view: MoneyView) => {
  const s = view.subject;
  if (s.family !== "CATALOG") return legacyMoneyFail("MONEY_DATA_INTEGRITY");
  return `${s.target.kind === "ENTRY" ? "entry" : s.target.variantId}:${s.definitionId}`;
};
function sameRaw(a: MoneyView["raw"], b: MoneyView["raw"]): boolean {
  return a?.amountMinor === b?.amountMinor && a?.currency === b?.currency;
}
export async function beginCatalogMoneyMutation(
  tx: CatalogTransaction,
  contextInput: unknown,
  operation: CatalogProposalOperation,
  base: CatalogEntryRevision | null,
): Promise<CatalogMoneyMutationPlan> {
  const parsed = contextSchema.safeParse(
    contextInput === undefined ? { kind: "LEGACY" } : contextInput,
  );
  if (!parsed.success) return legacyMoneyFail("MONEY_CONFLICT");
  const context = parsed.data;
  const op = CatalogProposalOperationSchema.parse(operation);
  if ((op.kind === "CREATE_ENTRY") !== (base === null))
    return legacyMoneyFail("MONEY_DATA_INTEGRITY");
  if (context.actorId !== undefined) {
    try {
      await requireApplicationModerator(tx, context.actorId);
    } catch (error) {
      if (error instanceof ApplicationRoleError) return legacyMoneyFail("MONEY_FORBIDDEN");
      throw error;
    }
  }
  if (
    context.kind === "VALIDATED" &&
    (context.envelope.baseRevision !== (base?.revision ?? null) ||
      context.envelope.patchDigest !== digestCatalogMoneyPatch(op))
  )
    return legacyMoneyFail("MONEY_CONFLICT");
  const before = base
    ? await readCatalogMoneyMap(moneyTransaction(tx), base.state.id, base.revision, {
        userId: context.actorId ?? "catalog-public-read",
      })
    : [];
  return Object.freeze({ [planBrand]: tx, context, operation: op, base, before });
}

/** Only captured explicit money paths bypass the prospective legacy currency validator. */
export function capturedCatalogMoneyAttribute(
  plan: CatalogMoneyMutationPlan | undefined,
  target: "ENTRY" | "OPERATION_VARIANT",
  definitionId: string,
  value: unknown,
) {
  if (plan?.context.kind !== "VALIDATED") return undefined;
  if (
    !plan.context.envelope.paths.some((p) => p.target === target && p.definitionId === definitionId)
  )
    return legacyMoneyFail("LEGACY_MONEY_INVALID");
  const raw = HistoricalMoneyValueSchema.safeParse(value);
  if (!raw.success) return legacyMoneyFail("LEGACY_MONEY_INVALID");
  return raw.data;
}

export async function finishCatalogMoneyMutation(
  tx: CatalogTransaction,
  plan: CatalogMoneyMutationPlan,
  result: CatalogEntryRevision,
): Promise<void> {
  if (plan[planBrand] !== tx) return legacyMoneyFail("MONEY_FORBIDDEN");
  if (plan.base && plan.base.state.id !== result.state.id)
    return legacyMoneyFail("MONEY_DATA_INTEGRITY");
  const op = plan.operation,
    context = plan.context;
  const views = await readCatalogMoneyMap(moneyTransaction(tx), result.state.id, result.revision, {
    userId: context.actorId ?? "catalog-public-read",
  });
  const source = new Map(plan.before.map((v) => [pathKey(v), v]));
  let targetKey: string | null = null;
  let logicalTarget: "ENTRY" | "OPERATION_VARIANT" | null = null;
  if (op.kind === "CREATE_ENTRY" || op.kind === "UPDATE_ENTRY") {
    targetKey = "entry";
    logicalTarget = "ENTRY";
  } else if (op.kind === "UPDATE_VARIANT") {
    targetKey = op.variantId;
    logicalTarget = "OPERATION_VARIANT";
  } else if (op.kind === "ADD_VARIANT") {
    const old = new Set(plan.base?.state.variants.map((v) => v.id) ?? []);
    const added = result.state.variants.filter((v) => !old.has(v.id));
    if (added.length !== 1) return legacyMoneyFail("MONEY_DATA_INTEGRITY");
    targetKey = added[0]!.id;
    logicalTarget = "OPERATION_VARIANT";
  }
  const submittedIds = new Set(
    "input" in op && "attributes" in op.input
      ? (op.input.attributes ?? []).map((a) => a.definitionId)
      : [],
  );
  const touched = views.filter((v) => {
    const s = v.subject;
    return (
      s.family === "CATALOG" &&
      (s.target.kind === "ENTRY" ? "entry" : s.target.variantId) === targetKey &&
      submittedIds.has(s.definitionId)
    );
  });
  const submitted = new Map<string, StoredProposalMoneyEnvelope["paths"][number]>(
    context.kind === "VALIDATED"
      ? context.envelope.paths.map((p) => [`${p.target}:${p.definitionId}`, p])
      : [],
  );
  if (
    context.kind === "VALIDATED" &&
    (submitted.size !== touched.length ||
      touched.some(
        (v) =>
          v.subject.family !== "CATALOG" ||
          !submitted.has(`${logicalTarget}:${v.subject.definitionId}`),
      ))
  )
    return legacyMoneyFail("MONEY_CONFLICT");
  const touchedKeys = new Set(touched.map(pathKey));
  const actions: object[] = [];
  let needsSource = false;
  for (const view of touched) {
    const s = view.subject;
    if (s.family !== "CATALOG" || view.raw === null) return legacyMoneyFail("MONEY_DATA_INTEGRITY");
    const previous = source.get(pathKey(view));
    if (context.kind === "LEGACY") {
      actions.push({ target: s.target, definitionId: s.definitionId, op: "RAW_WRITE" });
      continue;
    }
    const intent = submitted.get(`${logicalTarget}:${s.definitionId}`)!;
    if (intent.kind === "AUTHORED") {
      if (!sameRaw(intent.receipt.raw, view.raw)) return legacyMoneyFail("MONEY_CONFLICT");
      if ((previous !== undefined) !== (intent.replacesFactToken !== undefined))
        return legacyMoneyFail("MONEY_CONFLICT");
      if (previous && previous.factToken !== intent.replacesFactToken)
        return legacyMoneyFail("MONEY_CONFLICT");
      if (previous) needsSource = true;
      actions.push({
        target: s.target,
        definitionId: s.definitionId,
        op: "AUTHOR",
        receipt: intent.receipt,
        ...(intent.replacesFactToken === undefined
          ? {}
          : { expectedFactToken: intent.replacesFactToken }),
      });
    } else {
      if (!previous || previous.factToken !== intent.factToken || !sameRaw(previous.raw, view.raw))
        return legacyMoneyFail("MONEY_CONFLICT");
      needsSource = true;
      actions.push({
        target: s.target,
        definitionId: s.definitionId,
        op: result.revision === plan.base?.revision ? "VERIFY" : "COPY",
        expectedFactToken: intent.factToken,
      });
    }
  }
  if (result.revision !== plan.base?.revision)
    for (const view of views) {
      if (touchedKeys.has(pathKey(view))) continue;
      const previous = source.get(pathKey(view));
      if (!previous || !sameRaw(previous.raw, view.raw))
        return legacyMoneyFail("MONEY_DATA_INTEGRITY");
      if (previous.interpretation.kind !== "INTERPRETED") continue;
      const s = view.subject;
      if (s.family !== "CATALOG") return legacyMoneyFail("MONEY_DATA_INTEGRITY");
      needsSource = true;
      actions.push({
        target: s.target,
        definitionId: s.definitionId,
        op: "COPY",
        expectedFactToken: previous.factToken,
      });
    }
  if (actions.length)
    await applyCatalogMoneyRevision(
      moneyTransaction(tx),
      context.actorId === undefined ? null : { userId: context.actorId },
      {
        entryId: result.state.id,
        destinationRevision: result.revision,
        sourceRevision: needsSource ? plan.base!.revision : null,
        actions,
      },
    );
}
