import type { CatalogProposalTransaction } from "@sammlerraum/db/catalog-types";
import {
  SubmitCatalogMoneyProposalInputSchema,
  StoredProposalMoneyEnvelopeSchema,
  type StoredProposalMoneyEnvelope,
} from "@sammlerraum/contracts/catalog-proposals";
import { CatalogSnapshotSchema, type CatalogSnapshot } from "@sammlerraum/contracts/catalog";
import { HistoricalMoneyValueSchema, legacyMoneyFail } from "@sammlerraum/contracts/legacy-money";
import { parseLegacyMoneyAuthoring } from "../money/legacy-money-policy";
import { moneyTransaction } from "../money/legacy-money-transaction";
import { readMoneyFact } from "../money/legacy-money-store";
import { digestCatalogMoneyPatch } from "./catalog-money-envelope";

/** Capture immutable exact-base receipts for the explicit monetary proposal workflow. */
export async function prepareCatalogMoneySubmission(
  tx: CatalogProposalTransaction,
  actorId: string,
  input: unknown,
): Promise<StoredProposalMoneyEnvelope> {
  const parsed = SubmitCatalogMoneyProposalInputSchema.safeParse(input);
  if (!parsed.success) return legacyMoneyFail("LEGACY_MONEY_INVALID");
  const { proposal, money } = parsed.data;
  const patch = proposal.patch;
  let base: CatalogSnapshot | undefined;
  if (proposal.targetEntryId !== null) {
    // Existing interpretation-only changes also serialize on this parent lock.
    const rows = await tx.$queryRaw<
      Array<{ id: string; categoryTemplateId: string }>
    >`SELECT id,"categoryTemplateId" FROM "CatalogEntry" WHERE id=${proposal.targetEntryId}::uuid FOR UPDATE`;
    if (rows.length !== 1) return legacyMoneyFail("MONEY_NOT_FOUND");
    const revision = await tx.catalogRevision.findUnique({
      where: {
        entryId_revision: { entryId: proposal.targetEntryId, revision: proposal.baseRevision! },
      },
    });
    if (!revision) return legacyMoneyFail("MONEY_NOT_FOUND");
    const snapshot = CatalogSnapshotSchema.safeParse(revision.snapshot);
    if (
      !snapshot.success ||
      snapshot.data.id !== proposal.targetEntryId ||
      snapshot.data.categoryTemplateId !== rows[0]!.categoryTemplateId
    )
      return legacyMoneyFail("MONEY_DATA_INTEGRITY");
    base = snapshot.data;
  }
  const category =
    patch.kind === "CREATE_ENTRY" ? patch.input.categoryTemplateId : base!.categoryTemplateId;
  const attributes =
    "input" in patch && "attributes" in patch.input ? (patch.input.attributes ?? []) : [];
  const definitions = attributes.length
    ? await tx.catalogAttributeDefinition.findMany({
        where: { id: { in: attributes.map((a) => a.definitionId) } },
      })
    : [];
  const byId = new Map(definitions.map((d) => [d.id, d]));
  const target =
    patch.kind === "CREATE_ENTRY" || patch.kind === "UPDATE_ENTRY" ? "ENTRY" : "OPERATION_VARIANT";
  let existing = base?.attributes ?? [];
  if (patch.kind === "UPDATE_VARIANT") {
    const variants = base!.variants.filter((v) => v.id === patch.variantId);
    if (variants.length !== 1) return legacyMoneyFail("MONEY_NOT_FOUND");
    existing = variants[0]!.attributes;
  } else if (patch.kind === "ADD_VARIANT") existing = [];
  const intents = new Map(money.intents.map((p) => [p.definitionId, p]));
  const paths: StoredProposalMoneyEnvelope["paths"] = [];
  const adapter = moneyTransaction(tx);
  for (const attribute of attributes) {
    const definition = byId.get(attribute.definitionId);
    if (!definition || definition.categoryTemplateId !== category)
      return legacyMoneyFail("LEGACY_MONEY_INVALID");
    const selected = intents.get(attribute.definitionId);
    if (definition.type !== "MONEY") {
      if (selected) return legacyMoneyFail("LEGACY_MONEY_INVALID");
      continue;
    }
    if (!selected || selected.target !== target) return legacyMoneyFail("LEGACY_MONEY_INVALID");
    const raw = HistoricalMoneyValueSchema.safeParse(attribute.value);
    if (!raw.success) return legacyMoneyFail("LEGACY_MONEY_INVALID");
    const previous = existing.filter((a) => a.definitionId === attribute.definitionId);
    if (previous.length > 1 || (previous.length === 1 && previous[0]!.type !== "MONEY"))
      return legacyMoneyFail("MONEY_DATA_INTEGRITY");
    const intent = selected.intent;
    if ((previous.length === 0) !== (intent.op === "NEW"))
      return legacyMoneyFail("LEGACY_MONEY_INVALID");
    if (intent.op !== "NEW") {
      const fact = await readMoneyFact(
        adapter,
        {
          family: "CATALOG",
          entryId: proposal.targetEntryId!,
          revision: proposal.baseRevision!,
          target:
            patch.kind === "UPDATE_VARIANT"
              ? { kind: "VARIANT", variantId: patch.variantId }
              : { kind: "ENTRY" },
          definitionId: attribute.definitionId,
        },
        { userId: actorId },
      );
      if (fact.factToken !== intent.expectedFactToken) return legacyMoneyFail("MONEY_CONFLICT");
      if (intent.op === "RETAIN") {
        if (
          fact.raw?.amountMinor !== String(raw.data.amountMinor) ||
          fact.raw.currency !== raw.data.currency
        )
          return legacyMoneyFail("LEGACY_MONEY_INVALID");
        paths.push({
          target,
          definitionId: attribute.definitionId,
          kind: "RETAIN",
          factToken: intent.expectedFactToken,
        });
        continue;
      }
    }
    const receipt = parseLegacyMoneyAuthoring(intent.authoring);
    if (
      receipt.raw.amountMinor !== String(raw.data.amountMinor) ||
      receipt.raw.currency !== raw.data.currency
    )
      return legacyMoneyFail("LEGACY_MONEY_INVALID");
    paths.push({
      target,
      definitionId: attribute.definitionId,
      kind: "AUTHORED",
      receipt,
      ...(intent.op === "REPLACE" ? { replacesFactToken: intent.expectedFactToken } : {}),
    });
  }
  if (paths.length !== money.intents.length) return legacyMoneyFail("LEGACY_MONEY_INVALID");
  return StoredProposalMoneyEnvelopeSchema.parse({
    schemaVersion: 1,
    baseRevision: proposal.baseRevision,
    patchDigest: digestCatalogMoneyPatch(patch),
    paths,
  });
}
