import { z } from "zod";
import { LegacyMoneyIdSchema } from "@sammlerraum/contracts/legacy-money";
const optionalId = z
  .string()
  .max(36)
  .refine((value) => value === "" || LegacyMoneyIdSchema.safeParse(value).success);
const schema = z
  .object({
    kind: z.enum([
      "CREATE_ENTRY",
      "UPDATE_ENTRY",
      "ADD_VARIANT",
      "UPDATE_VARIANT",
      "ADD_IDENTIFIER",
      "UPDATE_IDENTIFIER",
      "REMOVE_IDENTIFIER",
    ]),
    categoryId: optionalId,
    variantId: optionalId,
    identifierId: optionalId,
    baseRevision: z.number().int().min(1).max(2147483647).nullable(),
    summary: z.string().max(500),
    outcome: z.enum(["READY", "UNKNOWN", "ACKNOWLEDGED_UNREADABLE", "CONFLICT", "SAVED"]),
    proposalId: optionalId,
  })
  .strict();
export type CatalogMoneySession = z.infer<typeof schema>;
const sessions = new Map<string, CatalogMoneySession>();
let owner: string | null = null;
function scope(actor: string, key: string) {
  if (
    !actor ||
    actor.length > 512 ||
    (key !== "new" && !LegacyMoneyIdSchema.safeParse(key).success)
  )
    throw Error("INVALID_MONEY_SESSION");
  if (owner !== actor) {
    clearCatalogMoneySessions();
    owner = actor;
  }
}
export function rememberCatalogMoneySession(
  actor: string,
  key: string,
  value: CatalogMoneySession,
) {
  scope(actor, key);
  sessions.delete(key);
  sessions.set(key, schema.parse(value));
  while (sessions.size > 64) sessions.delete(sessions.keys().next().value!);
}
export function recallCatalogMoneySession(
  actor: string,
  key: string,
): CatalogMoneySession | undefined {
  scope(actor, key);
  const value = sessions.get(key);
  return value ? { ...value } : undefined;
}
export function forgetCatalogMoneySession(actor: string, key: string) {
  scope(actor, key);
  sessions.delete(key);
}
export function clearCatalogMoneySessions() {
  sessions.clear();
  owner = null;
}
