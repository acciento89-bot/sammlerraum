import { AuditError, AuditSourceSchema, type AuditSource } from "@sammlerraum/contracts/audit";
import { MembershipActorIdSchema } from "@sammlerraum/contracts/collaboration";
const trusted = Symbol("server-constructed audit context");
const contexts = new WeakSet<object>();
export type AuditContext = {
  readonly [trusted]: true;
  readonly source: AuditSource;
  readonly actorId: string | null;
};
/** Server mutation/worker code only. Never construct from an HTTP body. */
export function createTrustedAuditContext(input: {
  source: AuditSource;
  actorId: string | null;
}): AuditContext {
  const source = AuditSourceSchema.safeParse(input.source),
    actor = input.actorId === null ? null : MembershipActorIdSchema.safeParse(input.actorId);
  if (!source.success || (actor && !actor.success) || (source.data === "USER" && actor === null))
    throw new AuditError("AUDIT_INVALID");
  const context = Object.freeze({
    [trusted]: true as const,
    source: source.data,
    actorId: actor?.data ?? null,
  });
  contexts.add(context);
  return context;
}
export function requireTrustedAuditContext(value: AuditContext) {
  if (!value || value[trusted] !== true || !contexts.has(value))
    throw new AuditError("AUDIT_INVALID");
  return value;
}
