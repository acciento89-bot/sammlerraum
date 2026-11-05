import { randomUUID } from "node:crypto";
import { createItemService } from "@sammlerraum/domain/items/item-service";
import { createValuationService } from "@sammlerraum/domain/valuations/valuation-service";
import { createCategoryTemplateMaintenanceService } from "@sammlerraum/domain/catalog/category-template-service";
import {
  createConditionMaintenanceService,
  createConditionService,
} from "@sammlerraum/domain/condition/condition-service";
import { createGradingService } from "@sammlerraum/domain/grading/grading-service";
import { db, searchFixture, cleanupSearchFixture } from "./search-fixture";

/** Synthetic owned data only, behind searchFixture's database/version guard. */
export async function dashboardFixture() {
  const f = { ...(await searchFixture()), categoryId: "" };
  try {
    if (!db) throw new Error("Guarded database required");
    const items = createItemService(db, f.ownerId);
    const values = createValuationService(db, f.ownerId);
    const dates = ["2026-01-01T00:00:00.001Z", "2026-01-01T00:00:00.002Z"];
    const add = async (id: string, currency: string, amount: bigint, index: number) =>
      values.addManualValuation(id, { currency, amountMinor: amount, observedAt: dates[index] });
    await add(f.itemId, "EUR", 9223372036854775807n, 0);
    await add(f.itemId, "EUR", 9223372036854775806n, 1);
    let gradedItemId = "";
    for (const [title, quantity, observations] of [
      [
        "Synthetic USD",
        2,
        [
          ["USD", 100n],
          ["USD", 250n],
        ],
      ],
      [
        "Synthetic JPY zero",
        1,
        [
          ["JPY", 0n],
          ["JPY", 0n],
        ],
      ],
      ["Synthetic BHD single", 1, [["BHD", 1234n]]],
      [
        "Synthetic changed denomination",
        4,
        [
          ["EUR", 5n],
          ["USD", 900n],
        ],
      ],
      ["Synthetic missing estimate", 4, []],
    ] as const) {
      const item = await items.createItem({ collectionId: f.collectionId, title, quantity });
      if (title === "Synthetic JPY zero") gradedItemId = item.id;
      for (const [index, [currency, amount]] of observations.entries())
        await add(item.id, currency, amount, index);
    }
    await db.collection.create({
      data: { ownerId: f.ownerId, name: "Synthetic empty collection" },
    });
    const category = await createCategoryTemplateMaintenanceService(db).createCategoryTemplate({
      key: `dashboard_${f.ownerId.replaceAll("-", "")}`,
      labels: { de: "Übersichtskarten", en: "Dashboard cards" },
      definitions: [],
    });
    f.categoryId = category.id;
    const condition = createConditionService(db, f.ownerId);
    await condition.setItemCategory(f.itemId, { categoryTemplateId: category.id });
    const maintenance = createConditionMaintenanceService(db);
    const scheme = await maintenance.createConditionScheme({
      categoryTemplateId: category.id,
      key: `dashboard_${f.ownerId.replaceAll("-", "")}`,
      labels: { de: "Eigener Zustand", en: "Recorded condition" },
      options: [
        { labelKey: "retained", labels: { de: "Beibehaltener Zustand", en: "Retained condition" } },
      ],
    });
    await condition.setItemCondition(f.itemId, scheme.options[0]!.id);
    await maintenance.setConditionOptionActive(scheme.options[0]!.id, false);
    await maintenance.setConditionSchemeActive(scheme.id, false);
    for (const provider of ["Synthetic first", "Synthetic second"])
      await createGradingService(db, f.ownerId).addGrading(gradedItemId, {
        provider,
        grade: "Recorded grade",
      });
    // Persisted media states exercise aggregate interpretation, not the upload worker.
    for (const [position, status, cleanup] of [
      [0, "READY", false],
      [1, "PENDING", false],
      [2, "READY", true],
    ] as const) {
      const asset = await db.mediaAsset.create({
        data: {
          ownerId: f.ownerId,
          kind: "IMAGE",
          status,
          storageKey: `test/dashboard/${randomUUID()}`,
          mimeType: "image/png",
          byteSize: 10n,
          checksumSha256: "a".repeat(64),
          originalFileName: "synthetic.png",
        },
      });
      await db.mediaLink.create({
        data: { itemId: f.itemId, ownerId: f.ownerId, assetId: asset.id, position },
      });
      if (cleanup)
        await db.mediaAsset.update({
          where: { id: asset.id },
          data: { cleanupStartedAt: new Date() },
        });
    }
    return f;
  } catch (error) {
    await cleanupDashboardFixture(f);
    throw error;
  }
}

export async function cleanupDashboardFixture(f: Awaited<ReturnType<typeof dashboardFixture>>) {
  if (!db) return;
  await db.mediaLink.deleteMany({ where: { ownerId: f.ownerId } });
  await db.mediaAsset.deleteMany({ where: { ownerId: f.ownerId } });
  await cleanupSearchFixture(f);
  if (f.categoryId) {
    await db.conditionOption.deleteMany({ where: { categoryTemplateId: f.categoryId } });
    await db.conditionScheme.deleteMany({ where: { categoryTemplateId: f.categoryId } });
    await db.categoryTemplate.deleteMany({ where: { id: f.categoryId } });
  }
}
