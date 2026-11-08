import { LegacyMoneyIdSchema } from "@sammlerraum/contracts/legacy-money";
// Only a validated creation acknowledgment may populate this private handoff.
// It preserves identity across locale remounts after later partial failures.
const receipts = new Map<string, string>();
let owner: string | null = null;
function bind(actor: string, collectionId: string) {
  if (!actor || actor.length > 512 || !LegacyMoneyIdSchema.safeParse(collectionId).success)
    throw Error("INVALID_CREATION_RECEIPT");
  if (owner !== actor) {
    clearAcknowledgedItemCreations();
    owner = actor;
  }
}
export function rememberAcknowledgedItemCreation(
  actor: string,
  collectionId: string,
  itemId: string,
) {
  bind(actor, collectionId);
  LegacyMoneyIdSchema.parse(itemId);
  receipts.delete(collectionId);
  receipts.set(collectionId, itemId);
  while (receipts.size > 64) receipts.delete(receipts.keys().next().value!);
}
export function recallAcknowledgedItemCreation(
  actor: string,
  collectionId: string,
): string | undefined {
  if (!collectionId) return undefined;
  bind(actor, collectionId);
  return receipts.get(collectionId);
}
export function forgetAcknowledgedItemCreation(
  actor: string,
  collectionId: string,
  itemId: string,
) {
  bind(actor, collectionId);
  if (receipts.get(collectionId) === itemId) receipts.delete(collectionId);
}
export function clearAcknowledgedItemCreations() {
  receipts.clear();
  owner = null;
}
