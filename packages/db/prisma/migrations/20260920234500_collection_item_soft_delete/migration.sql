ALTER TABLE "Collection" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "CollectibleItem" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Collection_ownerId_deletedAt_idx" ON "Collection"("ownerId", "deletedAt");
CREATE INDEX "CollectibleItem_collectionId_deletedAt_idx" ON "CollectibleItem"("collectionId", "deletedAt");
