import {
  MoneyViewSchema,
  type ClassifyMoneyInput,
  type MoneyView,
  type RevokeMoneyInput,
} from "@sammlerraum/contracts/legacy-money";
import type { MoneyCapabilities } from "@sammlerraum/contracts/money-capabilities";
import {
  MoneyValueResultSchema,
  MoneyRevocationResultSchema,
  PersonalMoneyHistoryResultSchema,
  PersonalMoneyBulkResultSchema,
} from "@sammlerraum/contracts/personal-money";
import {
  MoneyClientError,
  readMoney,
  writeMoney,
  type MoneyTransport,
} from "./legacy-money-client";
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function acceptsClassification(
  next: MoneyView,
  before: MoneyView,
  input: ClassifyMoneyInput,
): boolean {
  const parsed = MoneyViewSchema.safeParse(next);
  if (
    !parsed.success ||
    !same(parsed.data.subject, before.subject) ||
    !same(parsed.data.raw, before.raw) ||
    parsed.data.factToken === input.expectedFactToken ||
    parsed.data.factToken === before.factToken
  )
    return false;
  const meaning = parsed.data.interpretation;
  return (
    meaning.kind === "INTERPRETED" &&
    meaning.exponent === input.exponent &&
    meaning.evidenceCategory === input.evidence.category &&
    meaning.basisId === `${input.evidence.category}:v1` &&
    (input.unit.kind === "SUPPORTED"
      ? meaning.unitKey === input.unit.unitKey && meaning.eligibility === "ELIGIBLE"
      : meaning.unitKey === `unsupported:${meaning.assertionId}` &&
        meaning.eligibility === "UNIT_UNSUPPORTED")
  );
}
function base(view: MoneyView) {
  const parsed = MoneyViewSchema.safeParse(view);
  if (!parsed.success || parsed.data.subject.family === "CATALOG")
    throw new MoneyClientError("READ_FAILED");
  const subject = parsed.data.subject;
  return `/api/v1/items/${subject.itemId}/money/${subject.family === "PURCHASE" ? "purchase" : `custom/${subject.fieldDefinitionId}`}`;
}
export async function readPersonalMoneyHistory(
  view: MoneyView,
  cursor?: string,
  transport?: MoneyTransport,
) {
  const query = new URLSearchParams({ limit: "20", ...(cursor ? { cursor } : {}) });
  return readMoney(
    `${base(view)}/classifications?${query}`,
    PersonalMoneyHistoryResultSchema.refine(
      (value) =>
        same(value.subject, view.subject) &&
        value.events.every(
          (event) =>
            event.originSubject === null || event.originSubject.family === view.subject.family,
        ),
    ),
    transport,
  );
}
export async function classifyPersonalMoney(
  view: MoneyView,
  input: ClassifyMoneyInput,
  capabilities: MoneyCapabilities,
  transport?: MoneyTransport,
): Promise<MoneyView> {
  const result = await writeMoney(
    `${base(view)}/classifications`,
    "POST",
    input,
    MoneyValueResultSchema.refine((value) => acceptsClassification(value.money, view, input)),
    capabilities,
    transport,
  );
  return result.money;
}
export async function revokePersonalMoney(
  view: MoneyView,
  input: RevokeMoneyInput,
  capabilities: MoneyCapabilities,
  transport?: MoneyTransport,
): Promise<void> {
  await writeMoney(
    `${base(view)}/revocations`,
    "POST",
    input,
    MoneyRevocationResultSchema.refine(
      (value) => same(value.subject, view.subject) && value.assertionId === input.assertionId,
    ),
    capabilities,
    transport,
  );
}

export async function readCurrentPersonalMoney(
  view: MoneyView,
  transport?: MoneyTransport,
): Promise<MoneyView> {
  base(view);
  const subject = view.subject;
  if (subject.family === "CATALOG") throw new MoneyClientError("READ_FAILED");
  const result = await readMoney(
    `/api/v1/items/${subject.itemId}/money${subject.family === "CUSTOM" ? `?fields=${subject.fieldDefinitionId}` : ""}`,
    PersonalMoneyBulkResultSchema.refine(
      (value) =>
        same(value.purchase.subject, { family: "PURCHASE", itemId: subject.itemId }) &&
        (subject.family === "PURCHASE"
          ? value.custom.length === 0
          : value.custom.length === 1 && same(value.custom[0]!.subject, subject)),
    ),
    transport,
  );
  return subject.family === "PURCHASE" ? result.purchase : result.custom[0]!;
}
