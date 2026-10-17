import { randomUUID } from "node:crypto";

import {
  CatalogEntryPatchSchema,
  CatalogExternalIdentifierInputSchema,
  CatalogSnapshotSchema,
  CatalogVariantInputSchema,
  CreateCatalogEntryInputSchema,
  type CatalogEntryRevision,
  type CatalogSnapshot,
  type CatalogText,
} from "@sammlerraum/contracts/catalog";
import type {
  CatalogDatabase,
  CatalogJson,
  CatalogTransaction,
} from "@sammlerraum/db/catalog-types";

import { validateAttributeValue } from "./category-template-service";

type ErrorCode =
  | "CATALOG_INPUT_INVALID"
  | "CATALOG_NOT_FOUND"
  | "CATALOG_REVISION_CONFLICT"
  | "CATALOG_ATTRIBUTE_CATEGORY_MISMATCH"
  | "CATALOG_VARIANT_NOT_FOUND"
  | "CATALOG_LIMIT_EXCEEDED";
export class CatalogServiceError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
    this.name = "CatalogServiceError";
  }
}
function invalid(): never {
  throw new CatalogServiceError("CATALOG_INPUT_INVALID");
}
function validId(id: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(id)) invalid();
}
function validRevision(revision: number): void {
  if (!Number.isSafeInteger(revision) || revision < 1 || revision > 2_147_483_647) invalid();
}
export function catalogTextForLocale(text: CatalogText, locale: string) {
  const authored = text.translations.find((translation) => translation.language === locale) ?? text;
  return { title: authored.title, description: authored.description };
}
/** Stable serialization for comparison and snapshot writes; precision remains in canonical strings. */
export function serializeCatalogSnapshot(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(serializeCatalogSnapshot).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${serializeCatalogSnapshot(item)}`)
      .join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) invalid();
  return serialized;
}
function ordered(state: CatalogSnapshot): CatalogSnapshot {
  state.text.translations.sort((a, b) => a.language.localeCompare(b.language, "en"));
  state.attributes.sort((a, b) => a.definitionId.localeCompare(b.definitionId));
  state.variants.sort((a, b) => a.id.localeCompare(b.id));
  for (const variant of state.variants) {
    variant.text.translations.sort((a, b) => a.language.localeCompare(b.language, "en"));
    variant.attributes.sort((a, b) => a.definitionId.localeCompare(b.definitionId));
  }
  state.identifiers.sort((a, b) => a.id.localeCompare(b.id));
  return state;
}
function json(value: unknown): CatalogJson {
  return JSON.parse(serializeCatalogSnapshot(value)) as CatalogJson;
}
type AttributeInput = { definitionId: string; value?: unknown };
async function attributes(
  tx: CatalogTransaction,
  categoryTemplateId: string,
  values: AttributeInput[],
) {
  const result: CatalogSnapshot["attributes"] = [];
  if (values.length === 0) return result;
  const definitions = await tx.catalogAttributeDefinition.findMany({
    where: { id: { in: values.map((value) => value.definitionId) } },
    include: { labels: true, options: { orderBy: { position: "asc" }, include: { labels: true } } },
  });
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  for (const value of values) {
    const definition = byId.get(value.definitionId);
    if (!definition || definition.categoryTemplateId !== categoryTemplateId) {
      throw new CatalogServiceError("CATALOG_ATTRIBUTE_CATEGORY_MISMATCH");
    }
    const canonical = await validateAttributeValue(
      {
        key: definition.key,
        labels: Object.fromEntries(definition.labels.map((label) => [label.locale, label.label])),
        type: definition.type,
        options: definition.options.map((option) => ({
          key: option.key,
          labels: Object.fromEntries(option.labels.map((label) => [label.locale, label.label])),
        })),
      },
      value.value,
    );
    result.push({
      definitionId: definition.id,
      key: definition.key,
      type: definition.type,
      value: canonical,
    });
  }
  return result;
}
async function readState(tx: CatalogTransaction, entryId: string): Promise<CatalogEntryRevision> {
  const row = await tx.catalogEntry.findUnique({ where: { id: entryId } });
  if (!row) throw new CatalogServiceError("CATALOG_NOT_FOUND");
  // Prisma's multi-relation include can schedule simultaneous queries on the
  // same pg transaction client. Read each bounded relation sequentially instead.
  const variants = await tx.catalogVariant.findMany({ where: { entryId, active: true } });
  const identifiers = await tx.catalogExternalIdentifier.findMany({
    where: { entryId, active: true },
  });
  const values = await tx.catalogAttributeValue.findMany({
    where: { entryId },
    include: { definition: true },
  });
  const authored = row.authored as { text: CatalogText; sources: CatalogSnapshot["sources"] };
  const dtoAttributes = (variantId: string | null) =>
    values
      .filter((value) => value.variantId === variantId)
      .map((value) => ({
        definitionId: value.definitionId,
        key: value.definition.key,
        type: value.definition.type,
        value: value.value,
      }));
  const state = CatalogSnapshotSchema.parse({
    schemaVersion: 1,
    id: row.id,
    categoryTemplateId: row.categoryTemplateId,
    ...authored,
    attributes: dtoAttributes(null),
    variants: variants.map((variant) => ({
      ...(variant.authored as object),
      id: variant.id,
      attributes: dtoAttributes(variant.id),
    })),
    identifiers: identifiers.map((identifier) => ({
      id: identifier.id,
      ...(identifier.variantId ? { variantId: identifier.variantId } : {}),
      namespace: identifier.namespace,
      type: identifier.type,
      value: identifier.value,
      sources: identifier.sources,
    })),
  });
  const history = await tx.catalogRevision.findUniqueOrThrow({
    where: { entryId_revision: { entryId, revision: row.revision } },
    select: { rollbackFromRevision: true },
  });
  return {
    revision: row.revision,
    state: ordered(state),
    rollbackFromRevision: history.rollbackFromRevision,
  };
}
async function persistState(
  tx: CatalogTransaction,
  state: CatalogSnapshot,
  revision: number,
  rollbackFromRevision: number | null,
): Promise<CatalogEntryRevision> {
  // UUID identities survive rollback. Later personal-item links can retain their target.
  await tx.catalogVariant.updateMany({ where: { entryId: state.id }, data: { active: false } });
  for (const variant of state.variants) {
    const { id, attributes: _attributes, ...authored } = variant;
    await tx.catalogVariant.upsert({
      where: { id },
      create: { id, entryId: state.id, active: true, authored: json(authored) },
      update: { active: true, authored: json(authored) },
    });
  }
  await tx.catalogExternalIdentifier.updateMany({
    where: { entryId: state.id },
    data: { active: false },
  });
  for (const identifier of state.identifiers) {
    const { id, sources, ...data } = identifier;
    await tx.catalogExternalIdentifier.upsert({
      where: { id },
      create: {
        ...data,
        variantId: data.variantId ?? null,
        id,
        entryId: state.id,
        active: true,
        sources: json(sources),
      },
      update: { ...data, variantId: data.variantId ?? null, active: true, sources: json(sources) },
    });
  }
  await tx.catalogAttributeValue.deleteMany({ where: { entryId: state.id } });
  const values = [
    ...state.attributes.map((attribute) => ({ ...attribute, variantId: null })),
    ...state.variants.flatMap((variant) =>
      variant.attributes.map((attribute) => ({ ...attribute, variantId: variant.id })),
    ),
  ];
  if (values.length)
    await tx.catalogAttributeValue.createMany({
      data: values.map((value) => ({
        entryId: state.id,
        categoryTemplateId: state.categoryTemplateId,
        variantId: value.variantId,
        targetKey: value.variantId ?? "entry",
        definitionId: value.definitionId,
        value: json(value.value),
      })),
    });
  await tx.catalogEntry.update({
    where: { id: state.id },
    data: {
      revision,
      authored: json({ text: state.text, sources: state.sources }),
    },
  });
  await tx.catalogRevision.create({
    data: {
      entryId: state.id,
      revision,
      snapshot: json(state),
      rollbackFromRevision,
    },
  });
  return { revision, state, rollbackFromRevision };
}

/**
 * Server-only canonical seam. Caller must supply an ACTIVE enclosing transaction.
 * Task3 verifies persisted moderator authority and proposal state before calling it.
 * This factory neither starts nor commits a transaction; errors must abort its caller.
 */
export function createCatalogMutationService(tx: CatalogTransaction) {
  async function mutate(
    entryId: string,
    expectedRevision: number,
    change: (state: CatalogSnapshot) => Promise<void>,
    rollbackFromRevision: number | null = null,
  ) {
    validId(entryId);
    validRevision(expectedRevision);
    await tx.$queryRaw`SELECT "id" FROM "CatalogEntry" WHERE "id" = ${entryId}::uuid FOR UPDATE`;
    const current = await readState(tx, entryId);
    // CAS is required even for a no-op: stale proposals must never be silently approved.
    if (current.revision !== expectedRevision)
      throw new CatalogServiceError("CATALOG_REVISION_CONFLICT");
    const state = structuredClone(current.state);
    await change(state);
    const parsed = CatalogSnapshotSchema.safeParse(state);
    if (!parsed.success) throw new CatalogServiceError("CATALOG_LIMIT_EXCEEDED");
    ordered(parsed.data);
    if (serializeCatalogSnapshot(parsed.data) === serializeCatalogSnapshot(current.state))
      return current;
    if (current.revision === 2_147_483_647) throw new CatalogServiceError("CATALOG_LIMIT_EXCEEDED");
    return persistState(tx, parsed.data, current.revision + 1, rollbackFromRevision);
  }
  async function createCatalogEntry(input: unknown): Promise<CatalogEntryRevision> {
    const parsed = CreateCatalogEntryInputSchema.safeParse(input);
    if (!parsed.success) invalid();
    const data = parsed.data;
    if (!(await tx.categoryTemplate.findUnique({ where: { id: data.categoryTemplateId } }))) {
      throw new CatalogServiceError("CATALOG_NOT_FOUND");
    }
    const state = ordered(
      CatalogSnapshotSchema.parse({
        schemaVersion: 1,
        id: randomUUID(),
        ...data,
        attributes: await attributes(tx, data.categoryTemplateId, data.attributes),
        variants: [],
        identifiers: [],
      }),
    );
    await tx.catalogEntry.create({
      data: {
        id: state.id,
        categoryTemplateId: state.categoryTemplateId,
        authored: json({ text: state.text, sources: state.sources }),
      },
    });
    return persistState(tx, state, 1, null);
  }
  async function updateCatalogEntry(entryId: string, expectedRevision: number, input: unknown) {
    const parsed = CatalogEntryPatchSchema.safeParse(input);
    if (!parsed.success) invalid();
    return mutate(entryId, expectedRevision, async (state) => {
      const patch = parsed.data;
      if (patch.text) state.text = patch.text;
      if (patch.sources) state.sources = patch.sources;
      if (patch.attributes)
        state.attributes = await attributes(tx, state.categoryTemplateId, patch.attributes);
    });
  }
  async function addCatalogVariant(entryId: string, expectedRevision: number, input: unknown) {
    const parsed = CatalogVariantInputSchema.safeParse(input);
    if (!parsed.success) invalid();
    const id = randomUUID();
    const result = await mutate(entryId, expectedRevision, async (state) => {
      if (state.variants.length >= 100) throw new CatalogServiceError("CATALOG_LIMIT_EXCEEDED");
      state.variants.push({
        id,
        ...parsed.data,
        attributes: await attributes(tx, state.categoryTemplateId, parsed.data.attributes),
      });
    });
    return {
      ...result.state.variants.find((variant) => variant.id === id)!,
      revision: result.revision,
    };
  }
  async function updateCatalogVariant(
    entryId: string,
    expectedRevision: number,
    variantId: string,
    input: unknown,
  ) {
    validId(variantId);
    const parsed = CatalogVariantInputSchema.safeParse(input);
    if (!parsed.success) invalid();
    return mutate(entryId, expectedRevision, async (state) => {
      const index = state.variants.findIndex((variant) => variant.id === variantId);
      if (index < 0) throw new CatalogServiceError("CATALOG_VARIANT_NOT_FOUND");
      state.variants[index] = {
        id: variantId,
        ...parsed.data,
        attributes: await attributes(tx, state.categoryTemplateId, parsed.data.attributes),
      };
    });
  }
  async function addExternalIdentifier(entryId: string, expectedRevision: number, input: unknown) {
    const parsed = CatalogExternalIdentifierInputSchema.safeParse(input);
    if (!parsed.success) invalid();
    let id: string = randomUUID();
    const result = await mutate(entryId, expectedRevision, async (state) => {
      const data = parsed.data;
      if (data.variantId && !state.variants.some((variant) => variant.id === data.variantId)) {
        throw new CatalogServiceError("CATALOG_VARIANT_NOT_FOUND");
      }
      const existing = state.identifiers.find(
        (identifier) =>
          identifier.variantId === data.variantId &&
          identifier.namespace === data.namespace &&
          identifier.type === data.type &&
          identifier.value === data.value,
      );
      // Duplicate authored identifiers with identical provenance are a no-op; differing sources are a canonical change.
      if (existing) {
        id = existing.id;
        existing.sources = data.sources;
      } else {
        if (state.identifiers.length >= 200)
          throw new CatalogServiceError("CATALOG_LIMIT_EXCEEDED");
        state.identifiers.push({ id, ...data });
      }
    });
    return {
      ...result.state.identifiers.find((identifier) => identifier.id === id)!,
      revision: result.revision,
    };
  }
  async function rollbackCatalogEntry(
    entryId: string,
    expectedRevision: number,
    targetRevision: number,
  ) {
    validRevision(targetRevision);
    return mutate(
      entryId,
      expectedRevision,
      async (state) => {
        const target = await tx.catalogRevision.findUnique({
          where: { entryId_revision: { entryId, revision: targetRevision } },
        });
        if (!target) throw new CatalogServiceError("CATALOG_NOT_FOUND");
        const restored = CatalogSnapshotSchema.parse(target.snapshot);
        if (restored.id !== state.id || restored.categoryTemplateId !== state.categoryTemplateId)
          invalid();
        restored.attributes = await attributes(tx, state.categoryTemplateId, restored.attributes);
        for (const variant of restored.variants) {
          variant.attributes = await attributes(tx, state.categoryTemplateId, variant.attributes);
        }
        Object.assign(state, restored);
      },
      targetRevision,
    );
  }
  return {
    createCatalogEntry,
    updateCatalogEntry,
    addCatalogVariant,
    updateCatalogVariant,
    addExternalIdentifier,
    rollbackCatalogEntry,
  };
}

/** Maintenance-only wrappers; never expose canonical writes as ordinary-user routes. */
export function createCatalogMaintenanceService(database: CatalogDatabase) {
  const within = <T>(
    work: (service: ReturnType<typeof createCatalogMutationService>) => Promise<T>,
  ) =>
    database.$transaction((tx) => work(createCatalogMutationService(tx)), {
      isolationLevel: "ReadCommitted",
    });
  async function getCatalogEntryAtRevision(
    entryId: string,
    revision: number,
  ): Promise<CatalogEntryRevision | null> {
    validId(entryId);
    validRevision(revision);
    const row = await database.catalogRevision.findUnique({
      where: { entryId_revision: { entryId, revision } },
    });
    return row
      ? {
          revision: row.revision,
          state: CatalogSnapshotSchema.parse(row.snapshot),
          rollbackFromRevision: row.rollbackFromRevision,
        }
      : null;
  }
  return {
    createCatalogEntry: (input: unknown) => within((service) => service.createCatalogEntry(input)),
    updateCatalogEntry: (entryId: string, expectedRevision: number, input: unknown) =>
      within((service) => service.updateCatalogEntry(entryId, expectedRevision, input)),
    addCatalogVariant: (entryId: string, expectedRevision: number, input: unknown) =>
      within((service) => service.addCatalogVariant(entryId, expectedRevision, input)),
    updateCatalogVariant: (
      entryId: string,
      expectedRevision: number,
      variantId: string,
      input: unknown,
    ) =>
      within((service) =>
        service.updateCatalogVariant(entryId, expectedRevision, variantId, input),
      ),
    addExternalIdentifier: (entryId: string, expectedRevision: number, input: unknown) =>
      within((service) => service.addExternalIdentifier(entryId, expectedRevision, input)),
    rollbackCatalogEntry: (entryId: string, expectedRevision: number, targetRevision: number) =>
      within((service) => service.rollbackCatalogEntry(entryId, expectedRevision, targetRevision)),
    getCatalogEntryAtRevision,
  };
}
