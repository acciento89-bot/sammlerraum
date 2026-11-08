import { BillingError } from "@sammlerraum/contracts/billing";
import {
  assertQuotaInTransaction,
  lockBillingQuotaSubject,
  quotaIsBounded,
} from "../billing/admission";
import { randomUUID } from "node:crypto";
import { Prisma } from "@sammlerraum/db/search-sql";
import { z } from "zod";
import { AuditError, AuditEventSchema } from "@sammlerraum/contracts/audit";
import { MembershipActorIdSchema, MembershipError } from "@sammlerraum/contracts/collaboration";
import { UpdateItemInputSchema } from "@sammlerraum/contracts/items";
import { UpdateCollectionInputSchema } from "@sammlerraum/contracts/collections";
import {
  RestorableAuditActionFields as operations,
  RestoreError,
  RestoreAuditInputSchema,
  RestorePreviewInputSchema,
  RestoreItemInputSchema,
  SoftDeleteItemInputSchema,
  type RestoreField,
} from "@sammlerraum/contracts/restore";
import {
  runTransferTransaction,
  type MembershipDatabase,
} from "../collaboration/transfer-transaction";
import type { BoundedSearchReadTransaction } from "../search/search-read";
import { createTrustedAuditContext, type AuditContext } from "./audit-context";
import { lockAuditUser, resolveAuditScope } from "./audit-scope";
import { checkedAuditMutation } from "./audit-event-definitions";
import { recordAuditEventInTransaction } from "./audit-service";
type Actor = { userId: string };
type Event = z.infer<typeof AuditEventSchema>;
type State = {
  id: string;
  updatedAt: string;
  deletedAt: string | null;
  parentDeletedAt?: string | null;
  collectionId?: string;
  categoryTemplateId?: string | null;
  archivedAt?: string | null;
  disposedAt?: string | null;
  [key: string]: unknown;
};
const columns: Record<RestoreField, Prisma.Sql> = {
  visibility: Prisma.sql`visibility`,
  title: Prisma.sql`title`,
  quantity: Prisma.sql`quantity`,
  nodeId: Prisma.sql`"nodeId"`,
  tradeStatus: Prisma.sql`"tradeStatus"`,
  acquisitionType: Prisma.sql`"acquisitionType"`,
  acquisitionDate: Prisma.sql`"acquisitionDate"`,
  conditionOptionId: Prisma.sql`"conditionOptionId"`,
  storageLocationId: Prisma.sql`"storageLocationId"`,
  name: Prisma.sql`name`,
  archivedAt: Prisma.sql`"archivedAt"`,
  deletedAt: Prisma.sql`"deletedAt"`,
};
function fail(code: RestoreError["code"]): never {
  throw new RestoreError(code);
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const p = schema.safeParse(value);
  return p.success ? p.data : fail("RESTORE_INVALID");
}
function snapshot(event: Event, side: "before" | "after") {
  const value = event[side];
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
const keyFor = (field: RestoreField) => (field === "deletedAt" ? "deleted" : field);
function supportedFields(event: Event) {
  const before = snapshot(event, "before"),
    after = snapshot(event, "after");
  return (operations[event.action] ?? []).filter((field) => {
    const key = keyFor(field);
    return (
      Object.hasOwn(before, key) &&
      Object.hasOwn(after, key) &&
      JSON.stringify(before[key]) !== JSON.stringify(after[key])
    );
  });
}
function currentValue(state: State, field: RestoreField) {
  return field === "deletedAt" ? state.deletedAt !== null : state[field];
}
function replacementSql(field: RestoreField, value: unknown): Prisma.Sql {
  if (field === "deletedAt" || field === "archivedAt") return Prisma.sql`NULL`;
  if (field === "nodeId" || field === "conditionOptionId" || field === "storageLocationId")
    return Prisma.sql`${value}::uuid`;
  if (field === "visibility") return Prisma.sql`${value}::"Visibility"`;
  if (field === "tradeStatus") return Prisma.sql`${value}::"TradeStatus"`;
  if (field === "acquisitionType") return Prisma.sql`${value}::"AcquisitionType"`;
  if (field === "acquisitionDate") return Prisma.sql`${value}::date`;
  if (field === "quantity") return Prisma.sql`${value}::int`;
  return Prisma.sql`${value}::text`;
}
/** Owner-only supported field restoration. Never reconstruct money, grants, membership or digest-only text. */
export function createRestoreService(database: MembershipDatabase) {
  async function within<T>(work: (tx: BoundedSearchReadTransaction) => Promise<T>): Promise<T> {
    try {
      return await runTransferTransaction(database, work);
    } catch (error) {
      if (error instanceof RestoreError || error instanceof BillingError) throw error;
      if (error instanceof AuditError && error.code === "AUDIT_NOT_FOUND")
        return fail("RESTORE_NOT_FOUND");
      if (error instanceof MembershipError && error.code === "MEMBERSHIP_UNAVAILABLE")
        return fail("RESTORE_UNAVAILABLE");
      if (error instanceof MembershipError && error.code === "MEMBERSHIP_CONFLICT")
        return fail("RESTORE_CONFLICT");
      return fail("RESTORE_INTEGRITY");
    }
  }
  async function identity(tx: BoundedSearchReadTransaction, who: Actor) {
    const id = parse(MembershipActorIdSchema, who?.userId);
    await lockAuditUser(tx, id);
    return createTrustedAuditContext({ source: "USER", actorId: id });
  }
  async function eventById(tx: BoundedSearchReadTransaction, id: string) {
    const [row] = await tx.$queryRaw<unknown[]>(
      Prisma.sql`SELECT id,sequence::text,"resourceType","resourceId",action,source,"actorId","subjectUserId",before,after,to_char("createdAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt" FROM "AuditEvent" WHERE id=${id}::uuid`,
    );
    if (!row) return fail("RESTORE_NOT_FOUND");
    const p = AuditEventSchema.safeParse(row);
    if (!p.success) return fail("RESTORE_INTEGRITY");
    try {
      checkedAuditMutation({
        resourceType: p.data.resourceType,
        resourceId: p.data.resourceId,
        action: p.data.action,
        subjectUserId: p.data.subjectUserId,
        before: p.data.before,
        after: p.data.after,
      });
    } catch {
      return fail("RESTORE_INTEGRITY");
    }
    return p.data;
  }
  async function state(
    tx: BoundedSearchReadTransaction,
    who: Actor,
    event: Pick<Event, "resourceType" | "resourceId">,
  ) {
    await resolveAuditScope(tx, event, true, who.userId);
    let rows: State[];
    if (event.resourceType === "ITEM")
      rows = await tx.$queryRaw<State[]>(
        Prisma.sql`SELECT i.id,i."collectionId",i.title,i.quantity,i."nodeId",i.visibility,i."tradeStatus",i."acquisitionType",to_char(i."acquisitionDate",'YYYY-MM-DD') AS "acquisitionDate",i."conditionOptionId",i."categoryTemplateId",i."storageLocationId",to_char(i."updatedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt",to_char(i."archivedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "archivedAt",to_char(i."disposedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "disposedAt",to_char(i."deletedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "deletedAt",to_char(c."deletedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "parentDeletedAt" FROM "CollectibleItem" i JOIN "Collection" c ON c.id=i."collectionId" WHERE i.id=${event.resourceId}::uuid AND i."ownerId"=${who.userId} AND c."ownerId"=${who.userId} FOR UPDATE OF i`,
      );
    else if (event.resourceType === "COLLECTION")
      rows = await tx.$queryRaw<State[]>(
        Prisma.sql`SELECT id,name,visibility,to_char("updatedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt",to_char("deletedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "deletedAt" FROM "Collection" WHERE id=${event.resourceId}::uuid AND "ownerId"=${who.userId} FOR UPDATE`,
      );
    else return fail("RESTORE_UNSUPPORTED");
    return rows[0] ?? fail("RESTORE_NOT_FOUND");
  }
  async function latest(
    tx: BoundedSearchReadTransaction,
    event: Pick<Event, "resourceType" | "resourceId">,
  ) {
    const [row] = await tx.$queryRaw<{ sequence: string | null }[]>(
      Prisma.sql`SELECT max(sequence)::text AS sequence FROM "AuditEvent" WHERE "resourceType"=${event.resourceType}::"AuditResourceType" AND "resourceId"=${event.resourceId}::uuid`,
    );
    return row?.sequence ?? fail("RESTORE_NOT_FOUND");
  }
  async function validateReplacement(
    tx: BoundedSearchReadTransaction,
    event: Event,
    current: State,
    field: RestoreField,
    value: unknown,
  ) {
    if (field === "deletedAt") {
      if (value !== false) return fail("RESTORE_UNSUPPORTED");
      if (current.parentDeletedAt) return fail("RESTORE_CONFLICT");
      return;
    }
    if (field === "archivedAt") {
      if (value !== null) return fail("RESTORE_UNSUPPORTED");
      if (current.deletedAt || current.parentDeletedAt) return fail("RESTORE_CONFLICT");
      return;
    }
    if (current.deletedAt || current.parentDeletedAt || current.archivedAt || current.disposedAt)
      return fail("RESTORE_CONFLICT");
    if (field === "conditionOptionId") {
      if (snapshot(event, "after").categoryTemplateId !== current.categoryTemplateId)
        return fail("RESTORE_CONFLICT");
      if (value !== null) {
        const [scheme] = await tx.$queryRaw<{ id: string; active: boolean }[]>(
          Prisma.sql`SELECT id,active FROM "ConditionScheme" WHERE "categoryTemplateId"=${current.categoryTemplateId}::uuid FOR SHARE`,
        );
        if (!scheme?.active) return fail("RESTORE_CONFLICT");
        const [option] = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM "ConditionOption" WHERE id=${value}::uuid AND "categoryTemplateId"=${current.categoryTemplateId}::uuid AND "schemeId"=${scheme.id}::uuid AND active FOR SHARE`,
        );
        if (!option) return fail("RESTORE_CONFLICT");
      }
      return;
    }
    if (field === "storageLocationId") {
      if (value !== null) {
        const [location] = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM "StorageLocation" WHERE id=${value}::uuid AND "ownerId"=${current.ownerId ?? null} FOR KEY SHARE`,
        );
        if (!location) return fail("RESTORE_CONFLICT");
      }
      return;
    }
    const valid =
      event.resourceType === "ITEM"
        ? UpdateItemInputSchema.safeParse({ [field]: value })
        : UpdateCollectionInputSchema.safeParse({ [field]: value });
    if (!valid.success) return fail("RESTORE_INTEGRITY");
    if (field === "nodeId" && value !== null) {
      const [node] = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM "CollectionNode" WHERE id=${value}::uuid AND "collectionId"=${current.collectionId}::uuid FOR KEY SHARE`,
      );
      if (!node) return fail("RESTORE_CONFLICT");
    }
    if (field === "quantity" && value !== current.quantity) {
      const [row] = await tx.$queryRaw<{ present: boolean }[]>(
        Prisma.sql`SELECT EXISTS(SELECT 1 FROM "Grading" WHERE "itemId"=${event.resourceId}::uuid) AS present`,
      );
      if (row?.present) return fail("RESTORE_CONFLICT");
    }
  }
  async function restore(
    tx: BoundedSearchReadTransaction,
    who: Actor,
    context: AuditContext,
    input: z.infer<typeof RestoreAuditInputSchema>,
  ) {
    const event = await eventById(tx, input.eventId),
      current = await state(tx, who, event),
      fields = supportedFields(event);
    if (!fields.includes(input.field)) return fail("RESTORE_UNSUPPORTED");
    const sequence = await latest(tx, event);
    if (current.updatedAt !== input.expectedUpdatedAt || sequence !== input.expectedLatestSequence)
      return fail("RESTORE_CONFLICT");
    const key = keyFor(input.field),
      before = snapshot(event, "before")[key],
      after = snapshot(event, "after")[key];
    if (JSON.stringify(currentValue(current, input.field)) !== JSON.stringify(after))
      return fail("RESTORE_CONFLICT");
    const dependencies =
      input.field === "conditionOptionId"
        ? [key, "categoryTemplateId"]
        : input.field === "tradeStatus"
          ? [key, "archivedAt", "disposedAt", "deleted"]
          : [key];
    const [changed] = await tx.$queryRaw<{ present: boolean }[]>(
      Prisma.sql`SELECT EXISTS(SELECT 1 FROM "AuditEvent" e WHERE e."resourceType"=${event.resourceType}::"AuditResourceType" AND e."resourceId"=${event.resourceId}::uuid AND e.sequence>${event.sequence}::bigint AND (${Prisma.join(
        dependencies.map(
          (field) =>
            Prisma.sql`(e.before->${field}::text IS DISTINCT FROM e.after->${field}::text)`,
        ),
        " OR ",
      )})) AS present`,
    );
    if (changed?.present) return fail("RESTORE_CONFLICT");
    await validateReplacement(tx, event, { ...current, ownerId: who.userId }, input.field, before);
    if (input.field === "deletedAt" && current.deletedAt !== null) {
      const [row] =
        event.resourceType === "ITEM"
          ? [{ amount: "1" }]
          : await tx.$queryRaw<{ amount: string }[]>(
              Prisma.sql`SELECT count(*)::text AS amount FROM "CollectibleItem" WHERE "collectionId"=${event.resourceId}::uuid AND "ownerId"=${who.userId} AND "deletedAt" IS NULL`,
            );
      const amount = Number(row?.amount);
      if (!Number.isSafeInteger(amount) || amount < 0) return fail("RESTORE_INTEGRITY");
      if (amount) await assertQuotaInTransaction(tx, who.userId, "ITEM_CREATE", amount);
    }
    const table =
      event.resourceType === "ITEM" ? Prisma.sql`"CollectibleItem"` : Prisma.sql`"Collection"`;
    const updated = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`UPDATE ${table} SET ${columns[input.field]}=${replacementSql(input.field, before)},"updatedAt"=timezone('UTC',clock_timestamp()) WHERE id=${event.resourceId}::uuid AND "ownerId"=${who.userId} AND "updatedAt"=${current.updatedAt}::timestamp RETURNING id`,
    );
    if (updated.length !== 1) return fail("RESTORE_CONFLICT");
    if (input.field === "storageLocationId")
      await tx.$queryRaw(
        Prisma.sql`INSERT INTO "ItemLocationHistory" (id,"itemId","ownerId","fromLocationId","toLocationId","assignedById","movedAt") VALUES (${randomUUID()}::uuid,${event.resourceId}::uuid,${who.userId},${current.storageLocationId}::uuid,${before}::uuid,${who.userId},timezone('UTC',clock_timestamp())) RETURNING id`,
      );
    const action =
        input.field === "deletedAt"
          ? event.resourceType === "ITEM"
            ? "ITEM_RESTORED"
            : "COLLECTION_RESTORED"
          : input.field === "archivedAt"
            ? "ITEM_ARCHIVE_RESTORED"
            : input.field === "visibility"
              ? `${event.resourceType}_VISIBILITY_RESTORED`
              : input.field === "conditionOptionId"
                ? "ITEM_CONDITION_RESTORED"
                : input.field === "storageLocationId"
                  ? "ITEM_LOCATION_RESTORED"
                  : `${event.resourceType}_DETAILS_RESTORED`,
      extra = {
        restoredEventId: event.id,
        ...(input.field === "conditionOptionId"
          ? { categoryTemplateId: current.categoryTemplateId }
          : {}),
      };
    const restored = await recordAuditEventInTransaction(tx, context, {
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      action,
      before: { [key]: currentValue(current, input.field), ...extra },
      after: { [key]: before, ...extra },
    });
    return {
      restored: true as const,
      eventId: restored.id,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      field: input.field,
    };
  }
  return {
    async getRestorePreview(who: Actor, input: unknown) {
      const request = parse(RestorePreviewInputSchema, input);
      return within(async (tx) => {
        await identity(tx, who);
        const event = await eventById(tx, request.eventId),
          current = await state(tx, who, event);
        if (!operations[event.action]) return fail("RESTORE_UNSUPPORTED");
        const fields = supportedFields(event);
        return {
          eventId: event.id,
          resourceType: event.resourceType,
          resourceId: event.resourceId,
          supportedFields: fields,
          preconditions: {
            expectedUpdatedAt: current.updatedAt,
            expectedLatestSequence: await latest(tx, event),
          },
          current: Object.fromEntries(fields.map((field) => [field, currentValue(current, field)])),
          previous: Object.fromEntries(
            fields.map((field) => [field, snapshot(event, "before")[keyFor(field)]]),
          ),
        };
      });
    },
    async restoreAuditEvent(who: Actor, input: unknown) {
      const request = parse(RestoreAuditInputSchema, input);
      return within(async (tx) => {
        const context = await identity(tx, who);
        if (request.field === "deletedAt" && quotaIsBounded("ITEM_CREATE"))
          await lockBillingQuotaSubject(tx, who.userId);
        return restore(tx, who, context, request);
      });
    },
    async softDeleteItem(who: Actor, input: unknown) {
      const request = parse(SoftDeleteItemInputSchema, input);
      return within(async (tx) => {
        const context = await identity(tx, who),
          target = { resourceType: "ITEM" as const, resourceId: request.itemId },
          current = await state(tx, who, target);
        if (current.deletedAt || current.parentDeletedAt) return fail("RESTORE_NOT_FOUND");
        const changed = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`UPDATE "CollectibleItem" SET "deletedAt"=timezone('UTC',clock_timestamp()),"tradeStatus"='NOT_FOR_TRADE',"updatedAt"=timezone('UTC',clock_timestamp()) WHERE id=${request.itemId}::uuid AND "ownerId"=${who.userId} AND "deletedAt" IS NULL RETURNING id`,
        );
        if (changed.length !== 1) return fail("RESTORE_CONFLICT");
        const event = await recordAuditEventInTransaction(tx, context, {
          ...target,
          action: "ITEM_DELETED",
          before: { deleted: false },
          after: { deleted: true },
        });
        return { itemId: request.itemId, eventId: event.id };
      });
    },
    async restoreItem(who: Actor, input: unknown) {
      const request = parse(RestoreItemInputSchema, input);
      return within(async (tx) => {
        const context = await identity(tx, who);
        if (quotaIsBounded("ITEM_CREATE")) await lockBillingQuotaSubject(tx, who.userId);
        await state(tx, who, { resourceType: "ITEM", resourceId: request.itemId });
        const [event] = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM "AuditEvent" WHERE "resourceType"='ITEM' AND "resourceId"=${request.itemId}::uuid AND action='ITEM_DELETED' ORDER BY sequence DESC LIMIT 1`,
        );
        if (!event) return fail("RESTORE_NOT_FOUND");
        return restore(tx, who, context, {
          eventId: event.id,
          field: "deletedAt",
          expectedUpdatedAt: request.expectedUpdatedAt,
          expectedLatestSequence: request.expectedLatestSequence,
        });
      });
    },
  };
}
