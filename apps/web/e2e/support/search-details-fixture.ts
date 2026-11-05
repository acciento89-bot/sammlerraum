import { createItemService } from "@sammlerraum/domain/items/item-service";
import { createCustomFieldService } from "@sammlerraum/domain/custom-fields/custom-field-service";
import { createCategoryTemplateMaintenanceService } from "@sammlerraum/domain/catalog/category-template-service";
import { createCatalogMaintenanceService } from "@sammlerraum/domain/catalog/catalog-service";
import {
  createConditionMaintenanceService,
  createConditionService,
} from "@sammlerraum/domain/condition/condition-service";
import { createGradingService } from "@sammlerraum/domain/grading/grading-service";
import { createValuationService } from "@sammlerraum/domain/valuations/valuation-service";
import type { CustomFieldType } from "@sammlerraum/contracts/custom-fields";
import { db, searchFixture, cleanupSearchFixture } from "./search-fixture";
const typedValues: Record<CustomFieldType, unknown> = {
  SHORT_TEXT: "private custom alpha",
  LONG_TEXT: "private custom long alpha",
  INTEGER: 0,
  DECIMAL: "1.25",
  DATE: "2025-01-02",
  BOOLEAN: false,
  SINGLE_SELECT: "Alpha",
  MULTI_SELECT: [],
  URL: "https://example.test/",
  MONEY: { amountMinor: 0, currency: "EUR" },
};
export async function searchDetailsFixture() {
  const f = {
    ...(await searchFixture()),
    categoryId: "",
    entryId: "",
    conditionId: "",
    custom: {} as Record<string, string>,
    catalog: {} as Record<string, string>,
  };
  try {
    if (!db) throw Error();
    const items = createItemService(db, f.ownerId);
    await items.updateItem(f.itemId, {
      quantity: 1,
      acquisitionDate: "2025-01-02",
      purchaseAmountMinor: 0,
      purchaseCurrency: "EUR",
    });
    const fields = createCustomFieldService(db, f.ownerId);
    for (const [type, value] of Object.entries(typedValues)) {
      const definition = await fields.createFieldDefinition({
        collectionId: f.collectionId,
        name: `Synthetic ${type}`,
        type: type as CustomFieldType,
        options: type.endsWith("SELECT") ? ["Alpha", "Beta"] : [],
      });
      f.custom[type] = definition.id;
      await fields.setFieldValue(f.itemId, definition.id, value);
    }
    const category = await createCategoryTemplateMaintenanceService(db).createCategoryTemplate({
      key: `search_${f.ownerId.replaceAll("-", "")}`,
      labels: { de: "Suchkarten", en: "Search cards" },
      definitions: Object.keys(typedValues).map((type) => ({
        key: type.toLowerCase(),
        type,
        labels: { de: `Katalog ${type}`, en: `Catalog ${type}` },
        options: type.endsWith("SELECT")
          ? [
              { key: "alpha", labels: { de: "Alpha Deutsch", en: "Alpha English" } },
              { key: "beta", labels: { de: "Beta Deutsch", en: "Beta English" } },
            ]
          : [],
      })),
    });
    f.categoryId = category.id;
    for (const definition of category.definitions) f.catalog[definition.type] = definition.id;
    const attributes = category.definitions.map((definition) => ({
      definitionId: definition.id,
      value: definition.type === "SINGLE_SELECT" ? "alpha" : typedValues[definition.type],
    }));
    const catalog = createCatalogMaintenanceService(db);
    const entry = await catalog.createCatalogEntry({
      categoryTemplateId: category.id,
      text: { language: "en", title: "Synthetic search reference" },
      attributes,
    });
    f.entryId = entry.state.id;
    const variant = await catalog.addCatalogVariant(f.entryId, 1, {
      text: { language: "en", title: "Synthetic selected variant" },
      attributes,
    });
    await items.linkItemToCatalog(f.itemId, f.entryId, variant.id);
    const maintenance = createConditionMaintenanceService(db);
    const scheme = await maintenance.createConditionScheme({
      categoryTemplateId: category.id,
      key: `search_${f.ownerId.replaceAll("-", "")}`,
      labels: { de: "Suchzustand", en: "Search condition" },
      options: [
        { labelKey: "mint", labels: { de: "Beibehaltener Zustand", en: "Retained condition" } },
      ],
    });
    f.conditionId = scheme.options[0]!.id;
    await createConditionService(db, f.ownerId).setItemCondition(f.itemId, f.conditionId);
    await maintenance.setConditionOptionActive(f.conditionId, false);
    await createGradingService(db, f.ownerId).addGrading(f.itemId, {
      provider: "Synthetic provider",
      grade: "Mint",
      certificateNo: "private-certificate-sentinel",
      comparableValue: "9.5",
      comparableScale: "ten",
    });
    await createValuationService(db, f.ownerId).addManualValuation(f.itemId, {
      amountMinor: 0n,
      currency: "EUR",
    });
    const archived = await items.createItem({
      collectionId: f.collectionId,
      title: "Synthetic archived card",
    });
    await items.archiveItem(archived.id);
    const disposed = await items.createItem({
      collectionId: f.collectionId,
      title: "Synthetic disposed card",
    });
    await items.updateItem(disposed.id, { disposedAt: "2025-01-02T00:00:00.000Z" });
    return f;
  } catch (error) {
    await cleanupSearchDetailsFixture(f);
    throw error;
  }
}
export async function cleanupSearchDetailsFixture(
  f: Awaited<ReturnType<typeof searchDetailsFixture>>,
) {
  if (!db) return;
  await cleanupSearchFixture(f);
  if (f.entryId) {
    await db.catalogAttributeValue.deleteMany({ where: { entryId: f.entryId } });
    await db.catalogVariant.deleteMany({ where: { entryId: f.entryId } });
    await db.catalogRevision.deleteMany({ where: { entryId: f.entryId } });
    await db.catalogEntry.deleteMany({ where: { id: f.entryId } });
  }
  if (f.categoryId) {
    await db.conditionOption.deleteMany({ where: { categoryTemplateId: f.categoryId } });
    await db.conditionScheme.deleteMany({ where: { categoryTemplateId: f.categoryId } });
    await db.categoryTemplate.deleteMany({ where: { id: f.categoryId } });
  }
}
