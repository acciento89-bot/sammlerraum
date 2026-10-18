import { randomUUID } from "node:crypto";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createItemService } from "../items/item-service";
import {
  createConditionMaintenanceService,
  createConditionService,
} from "../condition/condition-service";
import { createGradingService, type GradingDatabase } from "./grading-service";

const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const db = enabled ? createTestDatabaseClient() : undefined;
const ownerId = `GradingOwner_${randomUUID()}`;
const foreignOwnerId = `ForeignGradingOwner_${randomUUID()}`;
let collectionId: string;
let foreignCollectionId: string;
const service = () => createGradingService(db!, ownerId);
const item = (quantity = 1) =>
  createItemService(db!, ownerId).createItem({ collectionId, title: "Grading fixture", quantity });

describe.runIf(enabled)("personal grading PostgreSQL", () => {
  beforeAll(async () => {
    await db!.user.create({
      data: {
        id: ownerId,
        name: "Grading fixture",
        email: `${ownerId}@example.invalid`,
        emailVerified: true,
      },
    });
    await db!.user.create({
      data: {
        id: foreignOwnerId,
        name: "Foreign grading fixture",
        email: `${foreignOwnerId}@example.invalid`,
        emailVerified: true,
      },
    });
    foreignCollectionId = (
      await db!.collection.create({
        data: { ownerId: foreignOwnerId, name: "Foreign grading fixture" },
      })
    ).id;
    collectionId = (await db!.collection.create({ data: { ownerId, name: "Grading fixture" } })).id;
  });
  afterAll(async () => {
    if (db) {
      await db.user.deleteMany({ where: { id: { in: [ownerId, foreignOwnerId] } } });
      await db.$disconnect();
    }
  });
  it("allows equal certificate numbers across different providers", async () => {
    const itemA = await item();
    const itemB = await item();
    const first = await service().addGrading(itemA.id, {
      provider: "PSA",
      certificateNo: "123",
      grade: "10",
    });
    await expect(
      service().addGrading(itemB.id, { provider: "CGC", certificateNo: "123", grade: "10" }),
    ).resolves.toBeDefined();
    const rows = await db!.grading.findMany({
      where: { itemId: { in: [itemA.id, itemB.id] } },
      orderBy: { provider: "asc" },
    });
    expect(
      rows.map(({ provider, certificateNo, grade }) => ({ provider, certificateNo, grade })),
    ).toEqual([
      { provider: "CGC", certificateNo: "123", grade: "10" },
      { provider: "PSA", certificateNo: "123", grade: "10" },
    ]);
    expect(first.itemId).toBe(itemA.id);
  });
  it("preserves authored facts, leading zeros and exact optional decimal strings", async () => {
    const target = await item();
    const row = await service().addGrading(target.id.toUpperCase(), {
      provider: "  Unknown Provider  ",
      grade: "  Gem  Mint +  ",
      certificateNo: "  00123-A b  ",
      comparableValue: "99999999.9999",
      comparableScale: "  Authored scale  ",
      gradedAt: "2024-02-29",
      verificationUrl: "https://example.invalid/certificate/00123",
      source: "  Owner's receipt — unverifiziert  ",
    });
    expect(row).toMatchObject({
      provider: "Unknown Provider",
      grade: "Gem  Mint +",
      certificateNo: "00123-A b",
      comparableValue: "99999999.9999",
      comparableScale: "Authored scale",
      gradedAt: "2024-02-29",
      source: "Owner's receipt — unverifiziert",
    });
    expect(await service().getGrading(target.id, row.id.toUpperCase())).toEqual(row);
    expect(await service().listGradings(target.id)).toEqual([row]);
    expect(row).not.toHaveProperty("ownerId");
    expect(row).not.toHaveProperty("providerKey");
    expect(row).not.toHaveProperty("verified");
    const zero = await service().addGrading(target.id, {
      provider: "Unknown Provider",
      grade: "zero",
      certificateNo: "123-A b",
      comparableValue: "0.0000",
      comparableScale: "scale",
    });
    expect(zero.comparableValue).toBe("0.0000");
  });
  it("scopes certificate conflicts to one owner and provider without guessing number equivalence", async () => {
    const a = await item();
    const b = await item();
    await service().addGrading(a.id, { provider: "PSA", grade: "10", certificateNo: "000456" });
    await expect(
      service().addGrading(b.id, { provider: "psa", grade: "9", certificateNo: "000456" }),
    ).rejects.toMatchObject({ code: "GRADING_CERTIFICATE_CONFLICT" });
    await service().addGrading(b.id, { provider: "PSA", grade: "9", certificateNo: "456" });
    for (const certificateNo of ["abc", "ABC", "a bc", "a-bc"])
      await service().addGrading(b.id, { provider: "PSA", grade: "9", certificateNo });
    const foreign = await createItemService(db!, foreignOwnerId).createItem({
      collectionId: foreignCollectionId,
      title: "Foreign certificate",
    });
    await expect(
      createGradingService(db!, foreignOwnerId).addGrading(foreign.id, {
        provider: "PSA",
        grade: "10",
        certificateNo: "000456",
      }),
    ).resolves.toMatchObject({ certificateNo: "000456" });
    await expect(
      service().addGrading(foreign.id, { provider: "PSA", grade: "10", certificateNo: "000456" }),
    ).rejects.toMatchObject({ code: "ITEM_NOT_FOUND" });
  });
  it("supports multiple uncertified records and full replacement/removal releasing a certificate", async () => {
    const target = await item();
    for (let i = 0; i < 2; i++)
      expect(
        await service().addGrading(target.id, { provider: "Author", grade: "A" }),
      ).toMatchObject({ certificateNo: null, comparableValue: null, comparableScale: null });
    const before = await service().addGrading(target.id, {
      provider: "History",
      grade: "A",
      certificateNo: "old",
      source: "Original",
      comparableValue: "9.5",
      comparableScale: "ten",
    });
    const after = await service().updateGrading(target.id, before.id, {
      provider: "History",
      grade: "B",
      certificateNo: "replacement",
    });
    expect(after).toMatchObject({
      id: before.id,
      createdAt: before.createdAt,
      source: null,
      comparableValue: null,
      comparableScale: null,
      grade: "B",
    });
    expect(Date.parse(after.updatedAt)).toBeGreaterThanOrEqual(Date.parse(before.updatedAt));
    await service().addGrading(target.id, {
      provider: "History",
      grade: "C",
      certificateNo: "old",
    });
    await service().removeGrading(target.id, before.id);
    await expect(service().getGrading(target.id, before.id)).rejects.toMatchObject({
      code: "GRADING_NOT_FOUND",
    });
    await service().addGrading(target.id, {
      provider: "History",
      grade: "D",
      certificateNo: "replacement",
    });
  });
  it("hides foreign and mismatched grading IDs on reads and all mutations", async () => {
    const target = await item();
    const other = await item();
    const row = await service().addGrading(target.id, { provider: "Owner", grade: "A" });
    const foreign = createGradingService(db!, foreignOwnerId);
    for (const call of [
      () => foreign.listGradings(target.id),
      () => foreign.getGrading(target.id, row.id),
      () => foreign.addGrading(target.id, { provider: "A", grade: "A" }),
      () => foreign.updateGrading(target.id, row.id, { provider: "A", grade: "A" }),
      () => foreign.removeGrading(target.id, row.id),
    ])
      await expect(call()).rejects.toMatchObject({ code: "ITEM_NOT_FOUND" });
    for (const call of [
      () => service().getGrading(other.id, row.id),
      () => service().updateGrading(other.id, row.id, { provider: "A", grade: "A" }),
      () => service().removeGrading(other.id, row.id),
    ])
      await expect(call()).rejects.toMatchObject({ code: "GRADING_NOT_FOUND" });
    expect((await service().getGrading(target.id, row.id)).grade).toBe("A");
  });
  it("retains inactive item reads but rejects lifecycle mutations and deleted parents", async () => {
    for (const column of ["archivedAt", "disposedAt", "deletedAt"] as const) {
      const target = await item();
      const row = await service().addGrading(target.id, { provider: "Lifecycle", grade: "A" });
      await db!.collectibleItem.update({
        where: { id: target.id },
        data: { [column]: new Date() },
      });
      const code = column === "deletedAt" ? "ITEM_NOT_FOUND" : "ITEM_INACTIVE";
      for (const call of [
        () => service().addGrading(target.id, { provider: "X", grade: "B" }),
        () => service().updateGrading(target.id, row.id, { provider: "X", grade: "B" }),
        () => service().removeGrading(target.id, row.id),
      ])
        await expect(call()).rejects.toMatchObject({ code });
      if (column !== "deletedAt") expect(await service().listGradings(target.id)).toHaveLength(1);
      else await expect(service().listGradings(target.id)).rejects.toMatchObject({ code });
    }
    const collection = await db!.collection.create({
      data: { ownerId, name: "Deleted grading parent" },
    });
    const target = await createItemService(db!, ownerId).createItem({
      collectionId: collection.id,
      title: "Hidden",
    });
    const row = await service().addGrading(target.id, { provider: "Parent", grade: "A" });
    await db!.collection.update({ where: { id: collection.id }, data: { deletedAt: new Date() } });
    await expect(service().getGrading(target.id, row.id)).rejects.toMatchObject({
      code: "ITEM_NOT_FOUND",
    });
    await expect(service().removeGrading(target.id, row.id)).rejects.toMatchObject({
      code: "ITEM_NOT_FOUND",
    });
  });
  it("requires split before grading and enforces the shared item quantity mutation path", async () => {
    const bulk = await item(3);
    await expect(
      service().addGrading(bulk.id, { provider: "Bulk", grade: "10" }),
    ).rejects.toMatchObject({ code: "GRADING_REQUIRES_SINGLE_ITEM" });
    const split = await createItemService(db!, ownerId).splitQuantityItem(bulk.id, 1);
    const row = await service().addGrading(split.created.id, {
      provider: "Bulk",
      grade: "10",
      certificateNo: "physical",
    });
    expect(await service().listGradings(split.source.id)).toEqual([]);
    await expect(
      createItemService(db!, ownerId).updateItem(split.created.id, { quantity: 2 }),
    ).rejects.toMatchObject({ code: "ITEM_GRADING_QUANTITY_INVALID" });
    await expect(
      createItemService(db!, ownerId).splitQuantityItem(split.created.id, 1),
    ).rejects.toMatchObject({ code: "ITEM_GRADING_QUANTITY_INVALID" });
    await createItemService(db!, ownerId).updateItem(split.created.id, {
      title: "Still graded",
      quantity: 1,
    });
    expect((await service().getGrading(split.created.id, row.id)).certificateNo).toBe("physical");
    await service().removeGrading(split.created.id, row.id);
    expect(
      (await createItemService(db!, ownerId).updateItem(split.created.id, { quantity: 2 }))
        .quantity,
    ).toBe(2);
  });
  it("rejects malformed authored facts and never rounds or synthesizes comparable values", async () => {
    const target = await item();
    const base = { provider: "Bounds", grade: "Gem" };
    for (const patch of [
      { provider: " " },
      { grade: "" },
      { provider: "x".repeat(121) },
      { grade: "x".repeat(121) },
      { certificateNo: "" },
      { certificateNo: "x".repeat(161) },
      { comparableValue: 10, comparableScale: "ten" },
      { comparableValue: "1e1", comparableScale: "ten" },
      { comparableValue: "-1", comparableScale: "ten" },
      { comparableValue: "10.00001", comparableScale: "ten" },
      { comparableValue: "100000000", comparableScale: "large" },
      { comparableValue: "10" },
      { comparableScale: "ten" },
      { comparableValue: "10", comparableScale: " " },
      { comparableValue: "10", comparableScale: "x".repeat(121) },
      { verificationUrl: "javascript:alert(1)" },
      { verificationUrl: "https://user:password@example.invalid" },
      { verificationUrl: "https://example.invalid/\nattack" },
      { source: "x".repeat(1001) },
      { source: "bad\u0000value" },
      { provider: "bad\u0001value" },
      { gradedAt: "2023-02-29" },
      { gradedAt: "2026-13-01" },
      { ownerId: foreignOwnerId },
      { verified: true },
      { normalizedBand: 5 },
    ])
      await expect(service().addGrading(target.id, { ...base, ...patch })).rejects.toMatchObject({
        code: "GRADING_INVALID",
      });
    expect(await service().listGradings(target.id)).toEqual([]);
    await expect(service().listGradings("invalid")).rejects.toMatchObject({
      code: "GRADING_INVALID",
    });
  });
  it("caps records under the shared item lock and handles racing certificate additions", async () => {
    const target = await item();
    for (let i = 0; i < 100; i++)
      await service().addGrading(target.id, { provider: "Capacity", grade: String(i) });
    await expect(
      service().addGrading(target.id, { provider: "Capacity", grade: "overflow" }),
    ).rejects.toMatchObject({ code: "GRADING_LIMIT_EXCEEDED" });
    expect(await service().listGradings(target.id)).toHaveLength(100);
    const a = await item();
    const b = await item();
    const result = await Promise.allSettled([
      service().addGrading(a.id, { provider: "Race", grade: "10", certificateNo: "same" }),
      service().addGrading(b.id, { provider: "Race", grade: "10", certificateNo: "same" }),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(result.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "GRADING_CERTIFICATE_CONFLICT" },
    });
  });
  it("enforces owner, single-specimen, paired scale and provider identity in PostgreSQL", async () => {
    const target = await item();
    const bulk = await item(2);
    const data = { itemId: target.id, ownerId, provider: "DB", providerKey: "db", grade: "A" };
    for (const patch of [
      { ownerId: foreignOwnerId },
      { itemId: bulk.id },
      { itemId: bulk.id, itemQuantity: 2 },
      { comparableValue: "1" },
      { comparableValue: "-1", comparableScale: "scale" },
      { certificateNo: "x", certificateKey: "y" },
      { providerKey: "DB" },
    ])
      await expect(db!.grading.create({ data: { ...data, ...patch } })).rejects.toThrow();
    await expect(
      db!
        .$queryRaw`INSERT INTO "Grading" (id,"itemId","ownerId",provider,"providerKey",grade,"comparableValue","comparableScale","updatedAt") VALUES (${randomUUID()}::uuid,${target.id}::uuid,${ownerId},'DB','db','A','NaN'::numeric,'scale',now()) RETURNING id`,
    ).rejects.toThrow();
    const row = await service().addGrading(target.id, { provider: "DB", grade: "A" });
    await expect(
      db!.collectibleItem.update({ where: { id: target.id }, data: { quantity: 2 } }),
    ).rejects.toThrow();
    expect((await db!.grading.findUniqueOrThrow({ where: { id: row.id } })).itemQuantity).toBe(1);
  });
  it("keeps exact condition and grading independent through condition edits and grading removal", async () => {
    const key = `grading_condition_${randomUUID().replaceAll("-", "")}`;
    const category = await db!.categoryTemplate.create({ data: { key } });
    try {
      const scheme = await createConditionMaintenanceService(db!).createConditionScheme({
        categoryTemplateId: category.id,
        key,
        labels: { de: "Zustand", en: "Condition" },
        options: [
          {
            labelKey: "vinyl.vg_plus",
            labels: { de: "Sehr gut plus", en: "Very good plus" },
            normalizedBand: 4,
          },
        ],
      });
      const target = await item();
      const condition = createConditionService(db!, ownerId);
      await condition.setItemCategory(target.id, { categoryTemplateId: category.id });
      await condition.setItemCondition(target.id, scheme.options[0]!.id);
      const row = await service().addGrading(target.id, {
        provider: "Separate",
        grade: "MS 70",
        source: "Private provenance",
      });
      await condition.setItemCondition(target.id, null);
      expect((await service().getGrading(target.id, row.id)).grade).toBe("MS 70");
      await condition.setItemCondition(target.id, scheme.options[0]!.id);
      await service().removeGrading(target.id, row.id);
      expect(await condition.getItemCondition(target.id)).toMatchObject({
        conditionOption: { labelKey: "vinyl.vg_plus" },
        normalizedBand: 4,
      });
      await condition.setItemCategory(target.id, {
        categoryTemplateId: null,
        clearCondition: true,
      });
    } finally {
      await db!.collectibleItem.updateMany({
        where: { ownerId, categoryTemplateId: category.id },
        data: { conditionOptionId: null, categoryTemplateId: null },
      });
      await db!.conditionOption.deleteMany({ where: { categoryTemplateId: category.id } });
      await db!.conditionScheme.deleteMany({ where: { categoryTemplateId: category.id } });
      await db!.categoryTemplate.delete({ where: { id: category.id } });
    }
  });

  it("serializes actual item quantity updates behind grading's item lock", async () => {
    const target = await item();
    let release!: () => void;
    let reached!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const wrapped: GradingDatabase = {
      $queryRaw: db!.$queryRaw.bind(db!),
      $transaction: (work, options) =>
        db!.$transaction(
          (tx) =>
            work({
              async $queryRaw<T>(query: TemplateStringsArray, ...values: unknown[]): Promise<T> {
                const result = await tx.$queryRaw<T>(query, ...values);
                if (query.join("").includes("FOR UPDATE OF item")) {
                  reached();
                  await blocked;
                }
                return result;
              },
            }),
          options,
        ),
    };
    const grading = createGradingService(wrapped, ownerId).addGrading(target.id, {
      provider: "Quantity race",
      grade: "10",
    });
    await locked;
    const update = createItemService(db!, ownerId)
      .updateItem(target.id, { quantity: 2 })
      .then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
    try {
      await expectDatabaseWait("CollectibleItem");
    } finally {
      release();
    }
    await grading;
    expect(await update).toMatchObject({ error: { code: "ITEM_GRADING_QUANTITY_INVALID" } });
    expect(
      (await db!.collectibleItem.findUniqueOrThrow({ where: { id: target.id } })).quantity,
    ).toBe(1);
  });
  it("rechecks quantity after waiting for a concurrent committed change", async () => {
    const target = await item();
    let release!: () => void;
    let reached!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const locked = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const update = db!.$transaction(async (tx) => {
      await tx.collectibleItem.update({ where: { id: target.id }, data: { quantity: 2 } });
      reached();
      await blocked;
    });
    await locked;
    const grading = service()
      .addGrading(target.id, { provider: "Quantity race inverse", grade: "10" })
      .then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
    try {
      await expectDatabaseWait("CollectibleItem");
    } finally {
      release();
    }
    await update;
    expect(await grading).toMatchObject({ error: { code: "GRADING_REQUIRES_SINGLE_ITEM" } });
    expect(await service().listGradings(target.id)).toEqual([]);
  });
  it("uses native FK locking to reject a racing direct SQL quantity change", async () => {
    const target = await item();
    let release!: () => void;
    let reached!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inserted = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const insert = db!.$transaction(async (tx) => {
      await tx.grading.create({
        data: {
          itemId: target.id,
          ownerId,
          provider: "Native race",
          providerKey: "native race",
          grade: "10",
        },
      });
      reached();
      await blocked;
    });
    await inserted;
    const update = db!.collectibleItem
      .update({ where: { id: target.id }, data: { quantity: 2 } })
      .then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
    try {
      await expectDatabaseWait("CollectibleItem");
    } finally {
      release();
    }
    await insert;
    expect(await update).toHaveProperty("error");
    expect(
      (await db!.collectibleItem.findUniqueOrThrow({ where: { id: target.id } })).quantity,
    ).toBe(1);
  });
  it("retains owner-scoped certificate reservations on item soft deletion", async () => {
    const target = await item();
    const row = await service().addGrading(target.id, {
      provider: "Retained",
      grade: "10",
      certificateNo: "retained-physical",
    });
    await createItemService(db!, ownerId).deleteItem(target.id);
    await expect(service().getGrading(target.id, row.id)).rejects.toMatchObject({
      code: "ITEM_NOT_FOUND",
    });
    expect(await db!.grading.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      certificateNo: "retained-physical",
    });
    const replacement = await item();
    await expect(
      service().addGrading(replacement.id, {
        provider: "Retained",
        grade: "10",
        certificateNo: "retained-physical",
      }),
    ).rejects.toMatchObject({ code: "GRADING_CERTIFICATE_CONFLICT" });
    const foreign = await createItemService(db!, foreignOwnerId).createItem({
      collectionId: foreignCollectionId,
      title: "Independent retained claim",
    });
    await expect(
      createGradingService(db!, foreignOwnerId).addGrading(foreign.id, {
        provider: "Retained",
        grade: "10",
        certificateNo: "retained-physical",
      }),
    ).resolves.toMatchObject({ certificateNo: "retained-physical" });
  });
});

async function expectDatabaseWait(table: string) {
  const until = Date.now() + 3000;
  while (Date.now() < until) {
    const [row] = await db!.$queryRaw<
      Array<{ waiting: boolean }>
    >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE ${`%${table}%`}) AS waiting`;
    if (row!.waiting) return;
  }
  throw new Error("Expected PostgreSQL to observe a blocked lock");
}
