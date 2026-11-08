import {
  CatalogMoneyProposalResultSchema,
  SubmitCatalogMoneyProposalInputSchema,
  type SubmitCatalogMoneyProposalInput,
} from "@sammlerraum/contracts/catalog-proposals";
import type { MoneyCapabilities } from "@sammlerraum/contracts/money-capabilities";
import { parseLegacyMoneyAuthoring } from "@sammlerraum/domain/money/legacy-money-policy";
import { serializeCatalogValue } from "@sammlerraum/domain/catalog/catalog-serialization";
import { digestCatalogPatch } from "./catalog-money-model";
import { CatalogSnapshotSchema, type CatalogSnapshot } from "@sammlerraum/contracts/catalog";
import { CatalogMoneyRevisionResultSchema } from "@sammlerraum/contracts/catalog-money";
import { HistoricalMoneyValueSchema, type MoneyView } from "@sammlerraum/contracts/legacy-money";
import {
  MoneyClientError,
  writeMoney,
  readCatalogMoneyRevision,
  type MoneyTransport,
} from "../money/legacy-money-client";
export function catalogMoneyKey(
  target: Extract<MoneyView["subject"], { family: "CATALOG" }>["target"],
  definitionId: string,
): string {
  return `${target.kind === "ENTRY" ? "ENTRY" : `VARIANT:${target.variantId}`}:${definitionId}`;
}
/** Validate the whole scope before exposing even one interpreted value. */
export async function readCanonicalMoney(
  stateInput: CatalogSnapshot,
  revision: number,
  transport?: MoneyTransport,
): Promise<Map<string, MoneyView>> {
  try {
    const state = CatalogSnapshotSchema.parse(stateInput);
    const expected = new Map<string, { amountMinor: string; currency: string }>();
    for (const target of [
      { target: { kind: "ENTRY" as const }, attributes: state.attributes },
      ...state.variants.map((variant) => ({
        target: { kind: "VARIANT" as const, variantId: variant.id },
        attributes: variant.attributes,
      })),
    ])
      for (const row of target.attributes.filter((row) => row.type === "MONEY")) {
        const raw = HistoricalMoneyValueSchema.parse(row.value),
          key = catalogMoneyKey(target.target, row.definitionId);
        if (expected.has(key)) throw Error("Duplicate snapshot path");
        expected.set(key, { amountMinor: String(raw.amountMinor), currency: raw.currency });
      }
    const result = await readCatalogMoneyRevision(
      `/api/v1/catalog/entries/${state.id}/revisions/${revision}/money`,
      CatalogMoneyRevisionResultSchema.refine((value) => {
        if (
          value.entryId !== state.id ||
          value.revision !== revision ||
          value.money.length !== expected.size
        )
          return false;
        const seen = new Set<string>();
        return value.money.every((view) => {
          if (
            view.subject.family !== "CATALOG" ||
            view.subject.entryId !== state.id ||
            view.subject.revision !== revision
          )
            return false;
          const key = catalogMoneyKey(view.subject.target, view.subject.definitionId),
            raw = expected.get(key);
          if (
            !raw ||
            seen.has(key) ||
            view.raw?.amountMinor !== raw.amountMinor ||
            view.raw.currency !== raw.currency
          )
            return false;
          seen.add(key);
          return true;
        });
      }),
      transport,
    );
    return new Map(
      result.money.map((view) => {
        if (view.subject.family !== "CATALOG") throw Error("Invalid subject");
        return [catalogMoneyKey(view.subject.target, view.subject.definitionId), view] as const;
      }),
    );
  } catch {
    throw new MoneyClientError("READ_FAILED");
  }
}

export async function submitCanonicalMoneyProposal(
  input: SubmitCatalogMoneyProposalInput,
  capabilities: MoneyCapabilities,
  transport?: MoneyTransport,
) {
  const parsed = SubmitCatalogMoneyProposalInputSchema.parse(input),
    digest = await digestCatalogPatch(parsed.proposal.patch);
  const expectedPaths = parsed.money.intents.map((path) =>
    path.intent.op === "RETAIN"
      ? {
          target: path.target,
          definitionId: path.definitionId,
          kind: "RETAIN",
          factToken: path.intent.expectedFactToken,
        }
      : {
          target: path.target,
          definitionId: path.definitionId,
          kind: "AUTHORED",
          receipt: parseLegacyMoneyAuthoring(path.intent.authoring),
          ...(path.intent.op === "REPLACE"
            ? { replacesFactToken: path.intent.expectedFactToken }
            : {}),
        },
  );
  const stable = (value: unknown) =>
    serializeCatalogValue(value, () => {
      throw new MoneyClientError("ACKNOWLEDGED_UNREADABLE");
    });
  const sorted = (paths: unknown[]) =>
    [...paths].sort((a, b) => stable(a).localeCompare(stable(b)));
  const result = await writeMoney(
    "/api/v1/catalog/money-proposals",
    "POST",
    parsed,
    CatalogMoneyProposalResultSchema.refine((value) => {
      const proposal = value.proposal,
        envelope = proposal.moneyInterpretation;
      return (
        proposal.proposerId === capabilities.actorId &&
        proposal.state === "PENDING" &&
        proposal.targetEntryId === parsed.proposal.targetEntryId &&
        proposal.baseRevision === parsed.proposal.baseRevision &&
        proposal.summary === parsed.proposal.summary &&
        stable(proposal.patch) === stable(parsed.proposal.patch) &&
        stable(proposal.source) === stable(parsed.proposal.source ?? null) &&
        envelope !== null &&
        envelope.baseRevision === parsed.proposal.baseRevision &&
        envelope.patchDigest === digest &&
        stable(sorted(envelope.paths)) === stable(sorted(expectedPaths))
      );
    }),
    capabilities,
    transport,
  );
  return result.proposal;
}
