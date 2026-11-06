import {
  LegacyMoneyIdSchema,
  type ExistingMoneyIntent,
  type MoneyView,
} from "@sammlerraum/contracts/legacy-money";
import { PersonalMoneyBulkResultSchema, MoneyValueResultSchema } from "@sammlerraum/contracts/personal-money";
import type { MoneyCapabilities } from "@sammlerraum/contracts/money-capabilities";
import type { MoneyDraft } from "./legacy-money-draft";
import { acceptsMoneyAcknowledgement } from "./legacy-money-acknowledgement";
import { MoneyClientError, readMoney, writeMoney, type MoneyTransport } from "./legacy-money-client";

/** Each response is scoped to its exact request; no partial map escapes a failed batch. */
export async function readCustomMoney(itemId: string, definitions: string[], transport?: MoneyTransport): Promise<Record<string, MoneyView>> {
  if (!LegacyMoneyIdSchema.safeParse(itemId).success || definitions.length > 1000 ||
      new Set(definitions).size !== definitions.length ||
      definitions.some(id => !LegacyMoneyIdSchema.safeParse(id).success)) throw new MoneyClientError("READ_FAILED");
  const result: Record<string, MoneyView> = {};
  for (let offset = 0; offset < definitions.length; offset += 50) {
    const chunk = definitions.slice(offset, offset + 50);
    const expected = new Set(chunk);
    const body = await readMoney(`/api/v1/items/${itemId}/money?fields=${chunk.join(",")}`,
      PersonalMoneyBulkResultSchema.refine(value =>
        value.purchase.subject.family === "PURCHASE" && value.purchase.subject.itemId === itemId &&
        value.custom.length === chunk.length && new Set(value.custom.map(view =>
          view.subject.family === "CUSTOM" ? view.subject.fieldDefinitionId : "")).size === chunk.length &&
        value.custom.every(view => view.subject.family === "CUSTOM" && view.subject.itemId === itemId && expected.has(view.subject.fieldDefinitionId))), transport);
    for (const view of body.custom) if (view.subject.family === "CUSTOM") result[view.subject.fieldDefinitionId] = view;
  }
  return result;
}

/** Creating the item does not authorize overwriting a value that appeared meanwhile. */
export function bindCreatedCustomDraft(draft: MoneyDraft, view: MoneyView): MoneyDraft {
  if (view.subject.family !== "CUSTOM") throw new MoneyClientError("READ_FAILED");
  if (draft.expectedFactToken !== null || draft.outcome !== "READY") return { ...draft };
  if (view.raw !== null || view.interpretation.kind !== "MISSING") return { ...draft, outcome: "CONFLICT" };
  return { ...draft, expectedFactToken: view.factToken };
}

export async function writeCustomMoney(itemId: string, definitionId: string, intent: ExistingMoneyIntent,
  capabilities: MoneyCapabilities, transport?: MoneyTransport): Promise<MoneyView> {
  const result = await writeMoney(`/api/v1/money/items/${itemId}/custom-fields/${definitionId}`, "PUT",
    { schemaVersion: 1, intent }, MoneyValueResultSchema.refine(value => acceptsMoneyAcknowledgement(value.money,
      { family: "CUSTOM", itemId, fieldDefinitionId: definitionId }, intent)), capabilities, transport);
  return result.money;
}
