import { SmartCollectionSummarySchema } from "@sammlerraum/contracts/smart-collections";
type Acknowledgement = ReturnType<typeof SmartCollectionSummarySchema.parse>;
let currentActor: string | undefined;
const entries = new Map<string, Acknowledgement>();
export function clearSavedAcknowledgements() {
  entries.clear();
  currentActor = undefined;
}
function scope(actor: string) {
  if (actor !== currentActor) {
    clearSavedAcknowledgements();
    currentActor = actor;
  }
}
/** Memory-only write receipts: bounded metadata, never saved ASTs or member rows. */
export function rememberSavedAcknowledgement(actor: string, value: unknown) {
  scope(actor);
  const source = value as Record<string, unknown>;
  const receipt = SmartCollectionSummarySchema.parse(
    Object.fromEntries(
      ["id", "name", "revision", "createdAt", "updatedAt"].map((key) => [key, source?.[key]]),
    ),
  );
  entries.delete(receipt.id);
  entries.set(receipt.id, receipt);
  while (entries.size > 20) entries.delete(entries.keys().next().value!);
}
export function readSavedAcknowledgement(actor: string, id: string) {
  scope(actor);
  const receipt = entries.get(id);
  return receipt ? { ...receipt } : undefined;
}
