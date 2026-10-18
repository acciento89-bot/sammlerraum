import { randomUUID } from "node:crypto";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createItemService } from "../items/item-service";
import {
  createConditionService,
  createConditionMaintenanceService,
  type ConditionDatabase,
} from "./condition-service";
import { createResourceQuery } from "../api/resource-query";

const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const ownerId = `ConditionOwner_${randomUUID()}`;
const prefix = `condition_${randomUUID().replaceAll("-", "")}`;
let categoryId: string;
let optionId: string;
let collectionId: string;
const maintenance = () => createConditionMaintenanceService(db!);
const service = () => createConditionService(db!, ownerId);
const item = () =>
  createItemService(db!, ownerId).createItem({
    collectionId,
    title: "Condition test",
    quantity: 3,
  });
const newScheme = async (suffix: string, band: number | null = 4) => {
  const category = await db!.categoryTemplate.create({ data: { key: `${prefix}_${suffix}` } });
  return maintenance().createConditionScheme({
    categoryTemplateId: category.id,
    key: `${prefix}_${suffix}`,
    labels: { de: "Zustand", en: "Condition" },
    options: [
      {
        labelKey: "vinyl.vg_plus",
        labels: { de: "Sehr gut plus", en: "Very good plus" },
        normalizedBand: band,
      },
    ],
  });
};
const assigned = async (schemeCategory = categoryId, chosenOption = optionId) => {
  const result = await item();
  await service().setItemCategory(result.id, { categoryTemplateId: schemeCategory });
  await service().setItemCondition(result.id, chosenOption);
  return result;
};

describe.runIf(enabled)("category conditions PostgreSQL", () => {
  beforeAll(async () => {
    await db!.user.create({
      data: {
        id: ownerId,
        name: "Condition fixture",
        email: `${ownerId}@example.invalid`,
        emailVerified: true,
      },
    });
    const category = await db!.categoryTemplate.create({ data: { key: prefix } });
    categoryId = category.id;
    const scheme = await db!.conditionScheme.create({
      data: {
        categoryTemplateId: categoryId,
        key: prefix,
        labelDe: "Vinyl-Zustand",
        labelEn: "Vinyl condition",
      },
    });
    const option = await db!.conditionOption.create({
      data: {
        schemeId: scheme.id,
        categoryTemplateId: categoryId,
        labelKey: "vinyl.vg_plus",
        labelDe: "Sehr gut plus",
        labelEn: "Very good plus",
        normalizedBand: 4,
        position: 0,
      },
    });
    optionId = option.id;
    collectionId = (await db!.collection.create({ data: { ownerId, name: "Condition fixture" } }))
      .id;
  });
  afterAll(async () => {
    if (!db) return;
    await db.user.deleteMany({ where: { id: ownerId } });
    await db.conditionOption.deleteMany({ where: { scheme: { key: { startsWith: prefix } } } });
    await db.conditionScheme.deleteMany({ where: { key: { startsWith: prefix } } });
    await db.categoryTemplate.deleteMany({ where: { key: { startsWith: prefix } } });
    await db.$disconnect();
  });

  it("stores exact condition label and optional normalized band separately", async () => {
    const item = await createItemService(db!, ownerId).createItem({
      collectionId,
      title: "Vinyl",
      quantity: 3,
    });
    await db!.collectibleItem.update({
      where: { id: item.id },
      data: { categoryTemplateId: categoryId },
    });
    const saved = await createConditionService(db!, ownerId).setItemCondition(item.id, optionId);
    expect(saved.conditionOption?.labelKey).toBe("vinyl.vg_plus");
    expect(saved.normalizedBand).toBe(4);
    const reread = await db!.collectibleItem.findUniqueOrThrow({
      where: { id: item.id },
      include: { conditionOption: true },
    });
    expect(reread.conditionOption?.labelKey).toBe("vinyl.vg_plus");
    expect(reread.conditionOption?.normalizedBand).toBe(4);
  });
  it("keeps category optional and independent while deriving a nullable band", async () => {
    const fresh = await item();
    expect(await service().getItemCondition(fresh.id)).toMatchObject({
      categoryTemplateId: null,
      conditionOption: null,
      normalizedBand: null,
    });
    await expect(service().setItemCondition(fresh.id, optionId)).rejects.toMatchObject({
      code: "CONDITION_CATEGORY_MISMATCH",
    });
    const scheme = await newScheme("unmapped", null);
    await service().setItemCategory(fresh.id.toUpperCase(), {
      categoryTemplateId: scheme.categoryTemplateId.toUpperCase(),
    });
    const saved = await service().setItemCondition(
      fresh.id.toUpperCase(),
      scheme.options[0]!.id.toUpperCase(),
    );
    expect(saved.conditionOption?.labelKey).toBe("vinyl.vg_plus");
    expect(saved.normalizedBand).toBeNull();
    expect(saved.categoryTemplateId).toBe(scheme.categoryTemplateId);
    const edited = await createItemService(db!, ownerId).updateItem(fresh.id, { title: "Edited" });
    expect(edited).toMatchObject({
      categoryTemplateId: scheme.categoryTemplateId,
      conditionOptionId: scheme.options[0]!.id,
    });
    expect((await createResourceQuery(db!).loadItem(fresh.id)).item).toMatchObject({
      categoryTemplateId: scheme.categoryTemplateId,
      conditionOptionId: scheme.options[0]!.id,
    });
    expect(
      (await createResourceQuery(db!).listItems(collectionId, ownerId)).find(
        (row) => row.id === fresh.id,
      ),
    ).toMatchObject({ conditionOptionId: scheme.options[0]!.id });
  });

  it("rejects cross-category selections in domain and PostgreSQL including null-category bypass", async () => {
    const other = await newScheme("foreign");
    const current = await assigned();
    await expect(
      service().setItemCondition(current.id, other.options[0]!.id),
    ).rejects.toMatchObject({ code: "CONDITION_CATEGORY_MISMATCH" });
    await expect(
      db!.collectibleItem.update({
        where: { id: current.id },
        data: { conditionOptionId: other.options[0]!.id },
      }),
    ).rejects.toThrow();
    await expect(
      db!.collectibleItem.update({ where: { id: current.id }, data: { categoryTemplateId: null } }),
    ).rejects.toThrow();
    await expect(
      db!.conditionOption.create({
        data: {
          schemeId: other.id,
          categoryTemplateId: categoryId,
          labelKey: "foreign.option",
          labelDe: "A",
          labelEn: "A",
          position: 1,
        },
      }),
    ).rejects.toThrow();
    await expect(
      db!.conditionOption.create({
        data: {
          schemeId: other.id,
          categoryTemplateId: other.categoryTemplateId,
          labelKey: "foreign.band",
          labelDe: "A",
          labelEn: "A",
          position: 1,
          normalizedBand: 6,
        },
      }),
    ).rejects.toThrow();
    expect((await service().getItemCondition(current.id)).conditionOption?.id).toBe(optionId);
  });

  it("requires explicit atomic clear before category replacement or removal", async () => {
    const other = await newScheme("replacement");
    const current = await assigned();
    for (const categoryTemplateId of [null, other.categoryTemplateId]) {
      await expect(
        service().setItemCategory(current.id, { categoryTemplateId }),
      ).rejects.toMatchObject({ code: "CONDITION_CLEAR_REQUIRED" });
      expect((await service().getItemCondition(current.id)).conditionOption?.id).toBe(optionId);
    }
    expect(
      await service().setItemCategory(current.id, { categoryTemplateId: categoryId.toUpperCase() }),
    ).toMatchObject({ conditionOption: { id: optionId } });
    expect(
      await service().setItemCategory(current.id, {
        categoryTemplateId: other.categoryTemplateId,
        clearCondition: true,
      }),
    ).toMatchObject({
      categoryTemplateId: other.categoryTemplateId,
      conditionOption: null,
      normalizedBand: null,
    });
    await service().setItemCondition(current.id, other.options[0]!.id);
    expect(
      await service().setItemCategory(current.id, {
        categoryTemplateId: null,
        clearCondition: true,
      }),
    ).toMatchObject({ categoryTemplateId: null, conditionOption: null });
  });

  it("retains inactive exact choices on reads and split but rejects new selections", async () => {
    const scheme = await newScheme("retired");
    const current = await assigned(scheme.categoryTemplateId, scheme.options[0]!.id);
    await maintenance().setConditionOptionActive(scheme.options[0]!.id, false);
    expect((await service().getConditionScheme(scheme.categoryTemplateId))?.options).toEqual([]);
    await expect(
      service().setItemCondition(current.id, scheme.options[0]!.id),
    ).rejects.toMatchObject({ code: "CONDITION_INACTIVE" });
    await maintenance().setConditionSchemeActive(scheme.id, false);
    expect(await service().getConditionScheme(scheme.categoryTemplateId)).toBeNull();
    expect(await service().getItemCondition(current.id)).toMatchObject({
      conditionOption: { labelKey: "vinyl.vg_plus", active: false },
      normalizedBand: 4,
      schemeActive: false,
    });
    const split = await createItemService(db!, ownerId).splitQuantityItem(current.id, 1);
    for (const row of [split.source, split.created]) {
      expect(row).toMatchObject({
        categoryTemplateId: scheme.categoryTemplateId,
        conditionOptionId: scheme.options[0]!.id,
      });
      expect(await service().getItemCondition(row.id)).toMatchObject({
        conditionOption: { labelKey: "vinyl.vg_plus", active: false },
        normalizedBand: 4,
      });
    }
    expect(await service().setItemCondition(current.id, null)).toMatchObject({
      conditionOption: null,
      normalizedBand: null,
      categoryTemplateId: scheme.categoryTemplateId,
    });
    expect(
      await service().setItemCategory(split.created.id, {
        categoryTemplateId: null,
        clearCondition: true,
      }),
    ).toMatchObject({ conditionOption: null });
  });

  it("checks exact persisted owner and item lifecycle on every write", async () => {
    const current = await assigned();
    for (const actor of ["foreign-owner", ownerId.toLowerCase()]) {
      const foreign = createConditionService(db!, actor);
      await expect(foreign.getItemCondition(current.id)).rejects.toMatchObject({
        code: "ITEM_NOT_FOUND",
      });
      await expect(foreign.setItemCondition(current.id, null)).rejects.toMatchObject({
        code: "ITEM_NOT_FOUND",
      });
      await expect(
        foreign.setItemCategory(current.id, { categoryTemplateId: null, clearCondition: true }),
      ).rejects.toMatchObject({ code: "ITEM_NOT_FOUND" });
    }
    for (const column of ["archivedAt", "disposedAt", "deletedAt"] as const) {
      const target = await assigned();
      await db!.collectibleItem.update({
        where: { id: target.id },
        data: { [column]: new Date() },
      });
      const code = column === "deletedAt" ? "ITEM_NOT_FOUND" : "ITEM_INACTIVE";
      await expect(service().setItemCondition(target.id, null)).rejects.toMatchObject({ code });
      await expect(
        service().setItemCategory(target.id, { categoryTemplateId: null, clearCondition: true }),
      ).rejects.toMatchObject({ code });
      if (column !== "deletedAt")
        expect((await service().getItemCondition(target.id)).normalizedBand).toBe(4);
    }
    const collection = await db!.collection.create({ data: { ownerId, name: "Deleted parent" } });
    const target = await createItemService(db!, ownerId).createItem({
      collectionId: collection.id,
      title: "Hidden",
    });
    await db!.collection.update({ where: { id: collection.id }, data: { deletedAt: new Date() } });
    await expect(service().setItemCondition(target.id, null)).rejects.toMatchObject({
      code: "ITEM_NOT_FOUND",
    });
  });

  it("protects semantic keys, authored labels and mapping while allowing safe retirement and unused deletion", async () => {
    const scheme = await newScheme("immutable");
    const selected = scheme.options[0]!;
    const target = await assigned(scheme.categoryTemplateId, selected.id);
    for (const data of [
      { labelKey: "changed.key" },
      { labelDe: "Geändert" },
      { labelEn: "Changed" },
      { normalizedBand: 1 },
      { categoryTemplateId: categoryId },
      { id: randomUUID() },
    ]) {
      await expect(
        db!.conditionOption.update({ where: { id: selected.id }, data }),
      ).rejects.toThrow(/immutable/i);
    }
    for (const data of [
      { labelDe: "Geändert" },
      { labelEn: "Changed" },
      { key: `${prefix}_changed` },
    ]) {
      await expect(db!.conditionScheme.update({ where: { id: scheme.id }, data })).rejects.toThrow(
        /immutable/i,
      );
    }
    await expect(db!.conditionOption.delete({ where: { id: selected.id } })).rejects.toThrow();
    await expect(
      db!.categoryTemplate.delete({ where: { id: scheme.categoryTemplateId } }),
    ).rejects.toThrow();
    expect((await service().getItemCondition(target.id)).conditionOption).toMatchObject({
      labelKey: "vinyl.vg_plus",
      labels: { de: "Sehr gut plus", en: "Very good plus" },
      normalizedBand: 4,
    });
    const unused = await maintenance().addConditionOption(scheme.id, {
      labelKey: "vinyl.retired",
      labels: { de: "Alt", en: "Old" },
    });
    await db!.conditionOption.delete({ where: { id: unused.id } });
  });

  it("bounds and validates maintenance definitions, scoped identity and ordered additions", async () => {
    const scheme = await newScheme("maintenance");
    const base = {
      labelKey: "vinyl.new",
      labels: { de: " Neu ", en: " New " },
      normalizedBand: null,
    };
    for (const invalid of [
      { ...base, normalizedBand: 0 },
      { ...base, normalizedBand: 6 },
      { ...base, normalizedBand: 4.5 },
      { ...base, ownerId },
      { ...base, labels: { de: "Nur Deutsch" } },
      { ...base, labelKey: "x".repeat(129) },
      { ...base, labels: { de: "x".repeat(401), en: "New" } },
    ]) {
      await expect(maintenance().addConditionOption(scheme.id, invalid)).rejects.toMatchObject({
        code: "CONDITION_INVALID",
      });
    }
    const invalidCreate = {
      categoryTemplateId: scheme.categoryTemplateId,
      key: "invalid",
      labels: { de: "A", en: "A" },
      options: Array.from({ length: 101 }, (_, i) => ({ ...base, labelKey: `option.n${i}` })),
    };
    await expect(maintenance().createConditionScheme(invalidCreate)).rejects.toMatchObject({
      code: "CONDITION_INVALID",
    });
    await expect(
      maintenance().createConditionScheme({ ...invalidCreate, options: [base, base] }),
    ).rejects.toMatchObject({ code: "CONDITION_INVALID" });
    await expect(
      maintenance().createConditionScheme({ ...invalidCreate, options: [] }),
    ).rejects.toMatchObject({ code: "CONDITION_DEFINITION_CONFLICT" });
    await expect(
      maintenance().addConditionOption(scheme.id, { ...base, labelKey: "vinyl.vg_plus" }),
    ).rejects.toMatchObject({ code: "CONDITION_DEFINITION_CONFLICT" });
    const additions = await Promise.all([
      maintenance().addConditionOption(scheme.id, base),
      maintenance().addConditionOption(scheme.id, { ...base, labelKey: "vinyl.other" }),
    ]);
    expect(additions.map((row) => row.position).sort()).toEqual([1, 2]);
    expect(additions[0]!.labels).toEqual({ de: "Neu", en: "New" });
    expect(
      (await service().getConditionScheme(scheme.categoryTemplateId))?.options.map(
        (row) => row.position,
      ),
    ).toEqual([0, 1, 2]);
  });

  it("caps a complete scheme at 100 persisted options and rejects invalid identities without writes", async () => {
    const category = await db!.categoryTemplate.create({ data: { key: `${prefix}_capacity` } });
    const scheme = await maintenance().createConditionScheme({
      categoryTemplateId: category.id,
      key: `${prefix}_capacity`,
      labels: { de: "Zustand", en: "Condition" },
      options: Array.from({ length: 100 }, (_, index) => ({
        labelKey: `option.n${index}`,
        labels: { de: `Stufe ${index}`, en: `Level ${index}` },
      })),
    });
    expect(scheme.options).toHaveLength(100);
    expect(scheme.options.at(-1)?.position).toBe(99);
    await expect(
      maintenance().addConditionOption(scheme.id, {
        labelKey: "option.excess",
        labels: { de: "Mehr", en: "More" },
      }),
    ).rejects.toMatchObject({ code: "CONDITION_LIMIT_EXCEEDED" });
    expect(await db!.conditionOption.count({ where: { schemeId: scheme.id } })).toBe(100);
    const target = await item();
    await expect(
      service().setItemCategory(target.id, { categoryTemplateId: randomUUID() }),
    ).rejects.toMatchObject({ code: "CONDITION_NOT_FOUND" });
    await expect(service().setItemCondition(target.id, "invalid")).rejects.toMatchObject({
      code: "CONDITION_INVALID",
    });
    await expect(
      maintenance().addConditionOption(randomUUID(), {
        labelKey: "option.missing",
        labels: { de: "A", en: "A" },
      }),
    ).rejects.toMatchObject({ code: "CONDITION_NOT_FOUND" });
    expect(await service().getItemCondition(target.id)).toMatchObject({
      categoryTemplateId: null,
      conditionOption: null,
    });
  });

  it("holds active definition locks until assignment commits before operator deactivation", async () => {
    const scheme = await newScheme("locking");
    const current = await item();
    await service().setItemCategory(current.id, { categoryTemplateId: scheme.categoryTemplateId });
    for (const kind of ["option", "scheme"] as const) {
      await maintenance().setConditionSchemeActive(scheme.id, true);
      await maintenance().setConditionOptionActive(scheme.options[0]!.id, true);
      let release!: () => void;
      let reached!: () => void;
      const blocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      const locked = new Promise<void>((resolve) => {
        reached = resolve;
      });
      const wrapped: ConditionDatabase = {
        $queryRaw: db!.$queryRaw.bind(db!),
        $transaction: (work, options) =>
          db!.$transaction(
            async (tx) =>
              work({
                async $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T> {
                  const result = await tx.$queryRaw<T>(query, ...values);
                  if (
                    query.join("").includes('"ConditionOption"') &&
                    query.join("").includes("FOR SHARE")
                  ) {
                    reached();
                    await blocked;
                  }
                  return result;
                },
              }),
            options,
          ),
      };
      const selection = createConditionService(wrapped, ownerId).setItemCondition(
        current.id,
        scheme.options[0]!.id,
      );
      await locked;
      let finished = false;
      const retire = (
        kind === "option"
          ? maintenance().setConditionOptionActive(scheme.options[0]!.id, false)
          : maintenance().setConditionSchemeActive(scheme.id, false)
      ).then((result) => {
        finished = true;
        return result;
      });
      try {
        // Wait for PostgreSQL itself to report a blocked lock, not an arbitrary delay.
        let waiting = false;
        const until = Date.now() + 3000;
        while (Date.now() < until && !waiting) {
          const rows = await db!.$queryRaw<
            Array<{ waiting: boolean }>
          >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%Condition%') AS waiting`;
          waiting = rows[0]!.waiting;
        }
        expect(waiting).toBe(true);
        expect(finished).toBe(false);
      } finally {
        release();
      }
      await expect(selection).resolves.toMatchObject({ normalizedBand: 4 });
      await retire;
      await expect(
        service().setItemCondition(current.id, scheme.options[0]!.id),
      ).rejects.toMatchObject({ code: "CONDITION_INACTIVE" });
      expect((await service().getItemCondition(current.id)).normalizedBand).toBe(4);
    }
  });
});
