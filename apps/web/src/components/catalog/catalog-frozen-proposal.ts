import type { CatalogEntryRevision } from "@sammlerraum/contracts/catalog";
import {
  StoredProposalMoneyEnvelopeSchema,
  type CatalogProposalOperation,
} from "@sammlerraum/contracts/catalog-proposals";
import {
  HistoricalMoneyValueSchema,
  type MoneyView,
  type RawMoney,
} from "@sammlerraum/contracts/legacy-money";
import { MoneyClientError } from "../money/legacy-money-client";
import {
  digestCatalogPatch,
  proposalMoneyPreview,
  type CatalogMoneyPreview,
} from "./catalog-money-model";
import { catalogMoneyKey } from "./catalog-money-client";
export type FrozenProposalInput = {
  id: string;
  targetEntryId: string | null;
  baseRevision: number | null;
  patch: CatalogProposalOperation;
  moneyInterpretation?: unknown;
};
export async function frozenProposalMoney(
  proposal: FrozenProposalInput,
  base: CatalogEntryRevision | null,
  money: ReadonlyMap<string, MoneyView>,
): Promise<{ before: Map<string, CatalogMoneyPreview>; after: Map<string, CatalogMoneyPreview> }> {
  const result = {
    before: new Map<string, CatalogMoneyPreview>(),
    after: new Map<string, CatalogMoneyPreview>(),
  };
  if (proposal.moneyInterpretation === undefined || proposal.moneyInterpretation === null)
    return result;
  const fail = (): never => {
    throw new MoneyClientError("READ_FAILED");
  };
  const parsed = StoredProposalMoneyEnvelopeSchema.safeParse(proposal.moneyInterpretation);
  if (!parsed.success) return fail();
  const envelope = parsed.data,
    patch = proposal.patch;
  if (
    envelope.baseRevision !== proposal.baseRevision ||
    envelope.patchDigest !== (await digestCatalogPatch(patch))
  )
    return fail();
  const target =
    patch.kind === "CREATE_ENTRY" || patch.kind === "UPDATE_ENTRY"
      ? "ENTRY"
      : patch.kind === "ADD_VARIANT" || patch.kind === "UPDATE_VARIANT"
        ? "OPERATION_VARIANT"
        : null;
  const attributes =
    "input" in patch && "attributes" in patch.input ? (patch.input.attributes ?? []) : [];
  const requested = new Map<string, RawMoney>();
  for (const row of attributes) {
    const raw = HistoricalMoneyValueSchema.safeParse(row.value);
    if (raw.success) {
      if (requested.has(row.definitionId)) return fail();
      requested.set(row.definitionId, {
        amountMinor: String(raw.data.amountMinor),
        currency: raw.data.currency,
      });
    }
  }
  if (
    requested.size !== envelope.paths.length ||
    envelope.paths.some((path) => path.target !== target || !requested.has(path.definitionId))
  )
    return fail();
  const original =
    base?.state.id === proposal.targetEntryId && base.revision === proposal.baseRevision
      ? base
      : null;
  const physical =
    patch.kind === "UPDATE_ENTRY"
      ? { kind: "ENTRY" as const }
      : patch.kind === "UPDATE_VARIANT"
        ? { kind: "VARIANT" as const, variantId: patch.variantId }
        : null;
  for (const path of envelope.paths) {
    const raw = requested.get(path.definitionId)!;
    if (
      path.kind === "AUTHORED" &&
      (path.receipt.raw.amountMinor !== raw.amountMinor ||
        path.receipt.raw.currency !== raw.currency)
    )
      return fail();
    const expected =
      original && physical
        ? {
            family: "CATALOG" as const,
            entryId: original.state.id,
            revision: original.revision,
            target: physical,
            definitionId: path.definitionId,
          }
        : null;
    const key = physical ? catalogMoneyKey(physical, path.definitionId) : null,
      current = key ? (money.get(key) ?? null) : null;
    result.after.set(path.definitionId, proposalMoneyPreview(raw, path, expected, current));
    if (!original || !physical || !key) continue;
    const old = (
      physical.kind === "ENTRY"
        ? original.state.attributes
        : (original.state.variants.find((row) => row.id === physical.variantId)?.attributes ?? [])
    ).find((row) => row.definitionId === path.definitionId);
    const previous = HistoricalMoneyValueSchema.safeParse(old?.value);
    if (!previous.success) continue;
    const token = path.kind === "RETAIN" ? path.factToken : path.replacesFactToken;
    if (!token) return fail();
    result.before.set(
      key,
      proposalMoneyPreview(
        { amountMinor: String(previous.data.amountMinor), currency: previous.data.currency },
        { target: path.target, definitionId: path.definitionId, kind: "RETAIN", factToken: token },
        expected,
        current,
      ),
    );
  }
  return result;
}
