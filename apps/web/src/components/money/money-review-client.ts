import {
  CatalogMoneyHistoryResultSchema,
  CatalogMoneyRevisionResultSchema,
  CatalogMoneyRevocationResultSchema,
} from "@sammlerraum/contracts/catalog-money";
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
  readCatalogMoneyRevision,
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

function canonicalScope(view: MoneyView) {
  const parsed = MoneyViewSchema.safeParse(view);
  if (!parsed.success || parsed.data.subject.family !== "CATALOG")
    throw new MoneyClientError("READ_FAILED");
  const subject = parsed.data.subject;
  return {
    subject,
    url: `/api/v1/catalog/entries/${subject.entryId}/revisions/${subject.revision}/money`,
  };
}
export async function classifyReviewedMoney(
  view: MoneyView,
  input: ClassifyMoneyInput,
  caps: MoneyCapabilities,
  transport?: MoneyTransport,
): Promise<MoneyView> {
  if (view.subject.family !== "CATALOG") return classifyPersonalMoney(view, input, caps, transport);
  const { subject, url } = canonicalScope(view);
  const result = await writeMoney(
    `${url}/classifications`,
    "POST",
    { schemaVersion: 1, target: subject.target, definitionId: subject.definitionId, input },
    MoneyValueResultSchema.refine((value) => acceptsClassification(value.money, view, input)),
    caps,
    transport,
  );
  return result.money;
}
export async function readReviewedMoneyHistory(
  view: MoneyView,
  cursor?: string,
  transport?: MoneyTransport,
) {
  if (view.subject.family !== "CATALOG") return readPersonalMoneyHistory(view, cursor, transport);
  const { subject, url } = canonicalScope(view),
    query = new URLSearchParams({
      target: subject.target.kind,
      definitionId: subject.definitionId,
      limit: "20",
      ...(subject.target.kind === "VARIANT" ? { variantId: subject.target.variantId } : {}),
      ...(cursor ? { cursor } : {}),
    });
  return readMoney(
    `${url}/classifications?${query}`,
    CatalogMoneyHistoryResultSchema.refine((value) => same(value.subject, subject)),
    transport,
  );
}
export async function revokeReviewedMoney(
  view: MoneyView,
  input: RevokeMoneyInput,
  caps: MoneyCapabilities,
  transport?: MoneyTransport,
): Promise<void> {
  if (view.subject.family !== "CATALOG") return revokePersonalMoney(view, input, caps, transport);
  const { subject, url } = canonicalScope(view);
  await writeMoney(
    `${url}/revocations`,
    "POST",
    { schemaVersion: 1, target: subject.target, definitionId: subject.definitionId, input },
    CatalogMoneyRevocationResultSchema.refine(
      (value) =>
        same(value.subject, subject) &&
        same(value.money.subject, subject) &&
        value.assertionId === input.assertionId,
    ),
    caps,
    transport,
  );
}
export async function readCurrentReviewedMoney(
  view: MoneyView,
  transport?: MoneyTransport,
): Promise<MoneyView> {
  if (view.subject.family !== "CATALOG") return readCurrentPersonalMoney(view, transport);
  const { subject, url } = canonicalScope(view);
  const result = await readCatalogMoneyRevision(
    url,
    CatalogMoneyRevisionResultSchema.refine((value) => {
      const seen = new Set<string>();
      return (
        value.entryId === subject.entryId &&
        value.revision === subject.revision &&
        value.money.every((item) => {
          if (
            item.subject.family !== "CATALOG" ||
            item.subject.entryId !== subject.entryId ||
            item.subject.revision !== subject.revision ||
            seen.has(JSON.stringify(item.subject))
          )
            return false;
          seen.add(JSON.stringify(item.subject));
          return true;
        }) &&
        value.money.some((item) => same(item.subject, subject) && same(item.raw, view.raw))
      );
    }),
    transport,
  );
  return result.money.find((item) => same(item.subject, subject))!;
}
