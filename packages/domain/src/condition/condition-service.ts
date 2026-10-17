import { randomUUID } from "node:crypto";
import {
  ConditionIdSchema,
  ConditionOptionInputSchema,
  ConditionOptionSchema,
  ConditionSchemeSchema,
  CreateConditionSchemeInputSchema,
  ItemConditionSchema,
  SetItemCategoryInputSchema,
  type ConditionOption,
  type ConditionScheme,
  type ItemCondition,
} from "@sammlerraum/contracts/condition";

type Code =
  | "CONDITION_INVALID"
  | "CONDITION_NOT_FOUND"
  | "ITEM_NOT_FOUND"
  | "ITEM_INACTIVE"
  | "CONDITION_CATEGORY_MISMATCH"
  | "CONDITION_INACTIVE"
  | "CONDITION_CLEAR_REQUIRED"
  | "CONDITION_DEFINITION_CONFLICT"
  | "CONDITION_LIMIT_EXCEEDED";
export class ConditionServiceError extends Error {
  constructor(readonly code: Code) {
    super(code);
    this.name = "ConditionServiceError";
  }
}
type Query = { $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T> };
export type ConditionDatabase = Query & {
  $transaction<T>(
    work: (tx: Query) => Promise<T>,
    options: { isolationLevel: "ReadCommitted" },
  ): Promise<T>;
};
type SchemeRow = {
  id: string;
  categoryTemplateId: string;
  key: string;
  labelDe: string;
  labelEn: string;
  active: boolean;
};
type OptionRow = {
  id: string;
  schemeId: string;
  categoryTemplateId: string;
  labelKey: string;
  labelDe: string;
  labelEn: string;
  normalizedBand: number | null;
  position: number;
  active: boolean;
};
type ItemRow = {
  id: string;
  categoryTemplateId: string | null;
  conditionOptionId: string | null;
  archivedAt: Date | null;
  disposedAt: Date | null;
};
const id = (value: unknown): string => {
  const parsed = ConditionIdSchema.safeParse(value);
  if (!parsed.success) throw new ConditionServiceError("CONDITION_INVALID");
  return parsed.data;
};
function optionDto(row: OptionRow): ConditionOption {
  const { labelDe, labelEn, ...fields } = row;
  return ConditionOptionSchema.parse({ ...fields, labels: { de: labelDe, en: labelEn } });
}
async function schemeDto(tx: Query, row: SchemeRow, activeOnly: boolean): Promise<ConditionScheme> {
  const options = activeOnly
    ? await tx.$queryRaw<
        OptionRow[]
      >`SELECT * FROM "ConditionOption" WHERE "schemeId" = ${row.id}::uuid AND active ORDER BY position, id LIMIT 100`
    : await tx.$queryRaw<
        OptionRow[]
      >`SELECT * FROM "ConditionOption" WHERE "schemeId" = ${row.id}::uuid ORDER BY position, id LIMIT 100`;
  const { labelDe, labelEn, ...fields } = row;
  return ConditionSchemeSchema.parse({
    ...fields,
    labels: { de: labelDe, en: labelEn },
    options: options.map(optionDto),
  });
}
async function state(tx: Query, itemId: string, actorUserId: string): Promise<ItemCondition> {
  const [row] = await tx.$queryRaw<
    Array<{
      itemId: string;
      categoryTemplateId: string | null;
      option: OptionRow | null;
      schemeActive: boolean | null;
    }>
  >`
    SELECT item.id AS "itemId", item."categoryTemplateId",
           CASE WHEN option.id IS NULL THEN NULL ELSE to_jsonb(option) END AS option,
           scheme.active AS "schemeActive"
    FROM "CollectibleItem" item
    JOIN "Collection" collection ON collection.id = item."collectionId"
    LEFT JOIN "ConditionOption" option ON option.id = item."conditionOptionId"
    LEFT JOIN "ConditionScheme" scheme ON scheme.id = option."schemeId"
    WHERE item.id = ${itemId}::uuid AND collection."ownerId" = ${actorUserId}
      AND item."deletedAt" IS NULL AND collection."deletedAt" IS NULL
  `;
  if (!row) throw new ConditionServiceError("ITEM_NOT_FOUND");
  return ItemConditionSchema.parse({
    itemId: row.itemId,
    categoryTemplateId: row.categoryTemplateId,
    conditionOption: row.option ? optionDto(row.option) : null,
    schemeActive: row.schemeActive,
    normalizedBand: row.option?.normalizedBand ?? null,
  });
}
async function lockItem(tx: Query, itemId: string, actorUserId: string): Promise<ItemRow> {
  const [item] = await tx.$queryRaw<ItemRow[]>`
    SELECT item.id, item."categoryTemplateId", item."conditionOptionId", item."archivedAt", item."disposedAt"
    FROM "CollectibleItem" item JOIN "Collection" collection ON collection.id = item."collectionId"
    WHERE item.id = ${itemId}::uuid AND collection."ownerId" = ${actorUserId}
      AND item."deletedAt" IS NULL AND collection."deletedAt" IS NULL FOR UPDATE OF item
  `;
  if (!item) throw new ConditionServiceError("ITEM_NOT_FOUND");
  if (item.archivedAt !== null || item.disposedAt !== null)
    throw new ConditionServiceError("ITEM_INACTIVE");
  return item;
}

/** Personal facts use the authoritative owner and remain independent of future catalog links. */
export function createConditionService(database: ConditionDatabase, actorUserId: string) {
  async function getConditionScheme(categoryId: string): Promise<ConditionScheme | null> {
    categoryId = id(categoryId);
    const [scheme] = await database.$queryRaw<
      SchemeRow[]
    >`SELECT * FROM "ConditionScheme" WHERE "categoryTemplateId" = ${categoryId}::uuid AND active`;
    return scheme ? schemeDto(database, scheme, true) : null;
  }
  async function getItemCondition(itemId: string) {
    return state(database, id(itemId), actorUserId);
  }
  async function setItemCondition(itemId: string, optionId: string | null) {
    itemId = id(itemId);
    optionId = optionId === null ? null : id(optionId);
    return database.$transaction(
      async (tx) => {
        const item = await lockItem(tx, itemId, actorUserId);
        if (optionId !== null) {
          if (!item.categoryTemplateId)
            throw new ConditionServiceError("CONDITION_CATEGORY_MISMATCH");
          // Stable item -> scheme -> option ordering. SHARE blocks active updates until commit.
          const [scheme] = await tx.$queryRaw<
            SchemeRow[]
          >`SELECT * FROM "ConditionScheme" WHERE "categoryTemplateId" = ${item.categoryTemplateId}::uuid FOR SHARE`;
          if (!scheme) throw new ConditionServiceError("CONDITION_NOT_FOUND");
          const [option] = await tx.$queryRaw<
            OptionRow[]
          >`SELECT * FROM "ConditionOption" WHERE id = ${optionId}::uuid FOR SHARE`;
          if (!option) throw new ConditionServiceError("CONDITION_NOT_FOUND");
          if (
            option.categoryTemplateId !== item.categoryTemplateId ||
            option.schemeId !== scheme.id
          )
            throw new ConditionServiceError("CONDITION_CATEGORY_MISMATCH");
          if (!scheme.active || !option.active)
            throw new ConditionServiceError("CONDITION_INACTIVE");
        }
        await tx.$queryRaw`UPDATE "CollectibleItem" SET "conditionOptionId" = ${optionId}::uuid, "updatedAt" = now() WHERE id = ${itemId}::uuid RETURNING id`;
        return state(tx, itemId, actorUserId);
      },
      { isolationLevel: "ReadCommitted" },
    );
  }
  async function setItemCategory(itemId: string, input: unknown) {
    itemId = id(itemId);
    const parsed = SetItemCategoryInputSchema.safeParse(input);
    if (!parsed.success) throw new ConditionServiceError("CONDITION_INVALID");
    const { categoryTemplateId, clearCondition } = parsed.data;
    return database.$transaction(
      async (tx) => {
        const item = await lockItem(tx, itemId, actorUserId);
        if (categoryTemplateId !== null) {
          const rows = await tx.$queryRaw<
            Array<{ id: string }>
          >`SELECT id FROM "CategoryTemplate" WHERE id = ${categoryTemplateId}::uuid FOR KEY SHARE`;
          if (rows.length !== 1) throw new ConditionServiceError("CONDITION_NOT_FOUND");
        }
        if (
          item.conditionOptionId &&
          item.categoryTemplateId !== categoryTemplateId &&
          !clearCondition
        )
          throw new ConditionServiceError("CONDITION_CLEAR_REQUIRED");
        const optionId = clearCondition ? null : item.conditionOptionId;
        await tx.$queryRaw`UPDATE "CollectibleItem" SET "categoryTemplateId" = ${categoryTemplateId}::uuid, "conditionOptionId" = ${optionId}::uuid, "updatedAt" = now() WHERE id = ${itemId}::uuid RETURNING id`;
        return state(tx, itemId, actorUserId);
      },
      { isolationLevel: "ReadCommitted" },
    );
  }
  return { getConditionScheme, getItemCondition, setItemCondition, setItemCategory };
}

function definitionError(error: unknown): never {
  if (typeof error === "object" && error !== null && "meta" in error) {
    const meta = error.meta as
      | { code?: string; driverAdapterError?: { cause?: { originalCode?: string } } }
      | undefined;
    if (meta?.code === "23505" || meta?.driverAdapterError?.cause?.originalCode === "23505")
      throw new ConditionServiceError("CONDITION_DEFINITION_CONFLICT");
  }
  throw error;
}
async function insertOption(tx: Query, scheme: SchemeRow, input: unknown, position: number) {
  const parsed = ConditionOptionInputSchema.safeParse(input);
  if (!parsed.success) throw new ConditionServiceError("CONDITION_INVALID");
  const value = parsed.data;
  const optionId = randomUUID();
  const [row] = await tx.$queryRaw<OptionRow[]>`
    INSERT INTO "ConditionOption" (id, "schemeId", "categoryTemplateId", "labelKey", "labelDe", "labelEn", "normalizedBand", position, active)
    VALUES (${optionId}::uuid, ${scheme.id}::uuid, ${scheme.categoryTemplateId}::uuid, ${value.labelKey}, ${value.labels.de}, ${value.labels.en}, ${value.normalizedBand}, ${position}, ${value.active}) RETURNING *
  `;
  return optionDto(row!);
}
/** Server maintenance only; no ordinary-user route. Append a new key for semantic corrections.
 * V1 stores DE/EN columns; adding locales requires an additive schema extension.
 */
export function createConditionMaintenanceService(database: ConditionDatabase) {
  const within = async <T>(work: (tx: Query) => Promise<T>) => {
    try {
      return await database.$transaction(work, { isolationLevel: "ReadCommitted" });
    } catch (error) {
      definitionError(error);
    }
  };
  async function createConditionScheme(input: unknown) {
    const parsed = CreateConditionSchemeInputSchema.safeParse(input);
    if (!parsed.success) throw new ConditionServiceError("CONDITION_INVALID");
    const value = parsed.data;
    return within(async (tx) => {
      const category = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM "CategoryTemplate" WHERE id = ${value.categoryTemplateId}::uuid FOR KEY SHARE`;
      if (category.length !== 1) throw new ConditionServiceError("CONDITION_NOT_FOUND");
      const schemeId = randomUUID();
      const [scheme] = await tx.$queryRaw<SchemeRow[]>`
        INSERT INTO "ConditionScheme" (id, "categoryTemplateId", key, "labelDe", "labelEn", active)
        VALUES (${schemeId}::uuid, ${value.categoryTemplateId}::uuid, ${value.key}, ${value.labels.de}, ${value.labels.en}, ${value.active}) RETURNING *
      `;
      for (const [position, option] of value.options.entries())
        await insertOption(tx, scheme!, option, position);
      return schemeDto(tx, scheme!, false);
    });
  }
  async function addConditionOption(schemeId: string, input: unknown) {
    schemeId = id(schemeId);
    const parsed = ConditionOptionInputSchema.safeParse(input);
    if (!parsed.success) throw new ConditionServiceError("CONDITION_INVALID");
    return within(async (tx) => {
      const [scheme] = await tx.$queryRaw<
        SchemeRow[]
      >`SELECT * FROM "ConditionScheme" WHERE id = ${schemeId}::uuid FOR UPDATE`;
      if (!scheme) throw new ConditionServiceError("CONDITION_NOT_FOUND");
      const [next] = await tx.$queryRaw<
        Array<{ position: number }>
      >`SELECT COALESCE(MAX(position) + 1, 0)::int AS position FROM "ConditionOption" WHERE "schemeId" = ${schemeId}::uuid`;
      if (next!.position > 99) throw new ConditionServiceError("CONDITION_LIMIT_EXCEEDED");
      return insertOption(tx, scheme, parsed.data, next!.position);
    });
  }
  async function setConditionSchemeActive(schemeId: string, active: boolean) {
    schemeId = id(schemeId);
    if (typeof active !== "boolean") throw new ConditionServiceError("CONDITION_INVALID");
    return within(async (tx) => {
      const rows = await tx.$queryRaw<
        SchemeRow[]
      >`UPDATE "ConditionScheme" SET active = ${active} WHERE id = ${schemeId}::uuid RETURNING *`;
      if (!rows[0]) throw new ConditionServiceError("CONDITION_NOT_FOUND");
      return schemeDto(tx, rows[0], false);
    });
  }
  async function setConditionOptionActive(optionId: string, active: boolean) {
    optionId = id(optionId);
    if (typeof active !== "boolean") throw new ConditionServiceError("CONDITION_INVALID");
    return within(async (tx) => {
      const [identity] = await tx.$queryRaw<
        Array<{ schemeId: string }>
      >`SELECT "schemeId" FROM "ConditionOption" WHERE id = ${optionId}::uuid`;
      if (!identity) throw new ConditionServiceError("CONDITION_NOT_FOUND");
      await tx.$queryRaw`SELECT id FROM "ConditionScheme" WHERE id = ${identity.schemeId}::uuid FOR SHARE`;
      const [row] = await tx.$queryRaw<
        OptionRow[]
      >`UPDATE "ConditionOption" SET active = ${active} WHERE id = ${optionId}::uuid RETURNING *`;
      if (!row) throw new ConditionServiceError("CONDITION_NOT_FOUND");
      return optionDto(row);
    });
  }
  return {
    createConditionScheme,
    addConditionOption,
    setConditionSchemeActive,
    setConditionOptionActive,
  };
}
