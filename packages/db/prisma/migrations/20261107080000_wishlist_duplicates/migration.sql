-- CreateTable
CREATE TABLE "WishlistEntry" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "catalogEntryId" UUID,
    "catalogVariantId" UUID,
    "desiredCondition" TEXT,
    "targetAmountMinor" BIGINT,
    "targetCurrency" CHAR(3),
    "targetMinorUnitExponent" INTEGER,
    "targetUnitKey" VARCHAR(40),
    "priority" INTEGER NOT NULL DEFAULT 3,
    "notes" TEXT,
    "fulfilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WishlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateRelation" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "itemAId" UUID NOT NULL,
    "itemBId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuplicateRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WishlistEntry_ownerId_id_idx" ON "WishlistEntry"("ownerId", "id");

-- CreateIndex
CREATE INDEX "WishlistEntry_ownerId_fulfilledAt_id_idx" ON "WishlistEntry"("ownerId", "fulfilledAt", "id");

-- CreateIndex
CREATE INDEX "WishlistEntry_catalogEntryId_idx" ON "WishlistEntry"("catalogEntryId");

-- CreateIndex
CREATE INDEX "WishlistEntry_catalogVariantId_catalogEntryId_idx" ON "WishlistEntry"("catalogVariantId", "catalogEntryId");

-- CreateIndex
CREATE INDEX "DuplicateRelation_itemAId_idx" ON "DuplicateRelation"("itemAId");

-- CreateIndex
CREATE INDEX "DuplicateRelation_itemBId_idx" ON "DuplicateRelation"("itemBId");

-- CreateIndex
CREATE UNIQUE INDEX "DuplicateRelation_ownerId_itemAId_itemBId_key" ON "DuplicateRelation"("ownerId", "itemAId", "itemBId");

-- AddForeignKey
ALTER TABLE "WishlistEntry" ADD CONSTRAINT "WishlistEntry_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistEntry" ADD CONSTRAINT "WishlistEntry_catalogEntryId_fkey" FOREIGN KEY ("catalogEntryId") REFERENCES "CatalogEntry"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WishlistEntry" ADD CONSTRAINT "WishlistEntry_catalogVariantId_catalogEntryId_fkey" FOREIGN KEY ("catalogVariantId", "catalogEntryId") REFERENCES "CatalogVariant"("id", "entryId") ON DELETE SET NULL ("catalogVariantId") ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DuplicateRelation" ADD CONSTRAINT "DuplicateRelation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DuplicateRelation" ADD CONSTRAINT "DuplicateRelation_itemAId_fkey" FOREIGN KEY ("itemAId") REFERENCES "CollectibleItem"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DuplicateRelation" ADD CONSTRAINT "DuplicateRelation_itemBId_fkey" FOREIGN KEY ("itemBId") REFERENCES "CollectibleItem"("id") ON DELETE CASCADE ON UPDATE RESTRICT;


-- Prospective target prices declare their own immutable registry/scale; never infer legacy money.
ALTER TABLE "WishlistEntry" ADD CONSTRAINT "wishlist_safe_values" CHECK (
 char_length(title) BETWEEN 1 AND 200 AND priority BETWEEN 1 AND 5
 AND ("desiredCondition" IS NULL OR char_length("desiredCondition") BETWEEN 1 AND 200)
 AND (notes IS NULL OR char_length(notes) BETWEEN 1 AND 10000)
 AND ("catalogVariantId" IS NULL OR "catalogEntryId" IS NOT NULL)
 AND (num_nonnulls("targetAmountMinor","targetCurrency","targetMinorUnitExponent","targetUnitKey")=0 OR
      (num_nonnulls("targetAmountMinor","targetCurrency","targetMinorUnitExponent","targetUnitKey")=4
       AND "targetAmountMinor">=0 AND "targetCurrency"::text ~ '^[A-Z]{3}$'
       AND "targetMinorUnitExponent" BETWEEN 0 AND 6
       AND "targetUnitKey"='iso4217-2026-09-17:'||"targetCurrency"::text))
);
ALTER TABLE "DuplicateRelation" ADD CONSTRAINT "duplicate_canonical_distinct_pair" CHECK ("itemAId" < "itemBId");
CREATE FUNCTION guard_owned_duplicate_pair() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE matched integer;
BEGIN
 -- Same actor fence/order as real ownership mutations; avoids a stale direct-SQL owner witness.
 EXECUTE format('SELECT id FROM %I."user" WHERE id=$1 FOR NO KEY UPDATE',TG_TABLE_SCHEMA) USING NEW."ownerId";
 EXECUTE format('SELECT c.id FROM %1$I."Collection" c WHERE c."ownerId"=$1 AND c."deletedAt" IS NULL AND c.id IN (SELECT i."collectionId" FROM %1$I."CollectibleItem" i WHERE i.id IN ($2,$3)) ORDER BY c.id FOR SHARE OF c',TG_TABLE_SCHEMA) USING NEW."ownerId",NEW."itemAId",NEW."itemBId";
 EXECUTE format('SELECT count(*) FROM (SELECT i.id FROM %1$I."CollectibleItem" i JOIN %1$I."Collection" c ON c.id=i."collectionId" WHERE i.id IN ($2,$3) AND i."ownerId"=$1 AND c."ownerId"=$1 AND i."deletedAt" IS NULL AND c."deletedAt" IS NULL ORDER BY i.id FOR SHARE OF i) owned',TG_TABLE_SCHEMA) INTO matched USING NEW."ownerId",NEW."itemAId",NEW."itemBId";
 IF matched<>2 THEN RAISE EXCEPTION 'Duplicate pair must reference two current owned specimens' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER owned_duplicate_pair BEFORE INSERT OR UPDATE OF "ownerId","itemAId","itemBId" ON "DuplicateRelation" FOR EACH ROW EXECUTE FUNCTION guard_owned_duplicate_pair();
CREATE FUNCTION retire_duplicate_pairs_on_transfer() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW."ownerId" IS DISTINCT FROM OLD."ownerId" THEN
  EXECUTE format('DELETE FROM %I."DuplicateRelation" WHERE "itemAId"=$1 OR "itemBId"=$1',TG_TABLE_SCHEMA) USING OLD.id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER retire_owned_duplicate_pairs BEFORE UPDATE OF "ownerId" ON "CollectibleItem" FOR EACH ROW EXECUTE FUNCTION retire_duplicate_pairs_on_transfer();
