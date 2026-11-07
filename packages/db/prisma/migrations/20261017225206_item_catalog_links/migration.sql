-- Nullable canonical links never own the personal item's lifecycle or category.
ALTER TABLE "CollectibleItem"
  ADD COLUMN "catalogEntryId" UUID,
  ADD COLUMN "catalogVariantId" UUID;
CREATE INDEX "CollectibleItem_catalogEntryId_categoryTemplateId_idx"
  ON "CollectibleItem" ("catalogEntryId", "categoryTemplateId");
CREATE INDEX "CollectibleItem_catalogVariantId_catalogEntryId_idx"
  ON "CollectibleItem" ("catalogVariantId", "catalogEntryId");
CREATE INDEX "CatalogExternalIdentifier_value_active_entryId_idx"
  ON "CatalogExternalIdentifier" ("value", "active", "entryId");
ALTER TABLE "CollectibleItem" ADD CONSTRAINT "item_catalog_entry_requires_category"
  CHECK ("catalogEntryId" IS NULL OR "categoryTemplateId" IS NOT NULL);
ALTER TABLE "CollectibleItem" ADD CONSTRAINT "item_catalog_variant_requires_entry"
  CHECK ("catalogVariantId" IS NULL OR "catalogEntryId" IS NOT NULL);
-- Prisma cannot express PostgreSQL's column-specific SET NULL. Preserve these
-- column lists in future generated FK replacements; integration tests check them.
ALTER TABLE "CollectibleItem"
  ADD CONSTRAINT "CollectibleItem_catalogEntryId_categoryTemplateId_fkey"
  FOREIGN KEY ("catalogEntryId", "categoryTemplateId")
  REFERENCES "CatalogEntry" ("id", "categoryTemplateId")
  ON DELETE SET NULL ("catalogEntryId") ON UPDATE RESTRICT;
ALTER TABLE "CollectibleItem"
  ADD CONSTRAINT "CollectibleItem_catalogVariantId_catalogEntryId_fkey"
  FOREIGN KEY ("catalogVariantId", "catalogEntryId")
  REFERENCES "CatalogVariant" ("id", "entryId")
  ON DELETE SET NULL ("catalogVariantId") ON UPDATE RESTRICT;
