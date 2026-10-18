-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('ROOM', 'CABINET', 'SHELF', 'DRAWER', 'BOX', 'OTHER');

-- Make item ownership explicit so owner-wide locations can be protected by composite keys.
ALTER TABLE "CollectibleItem" ADD COLUMN "ownerId" TEXT;
UPDATE "CollectibleItem" item
SET "ownerId" = collection."ownerId"
FROM "Collection" collection
WHERE collection."id" = item."collectionId";
ALTER TABLE "CollectibleItem" ALTER COLUMN "ownerId" SET NOT NULL;

CREATE UNIQUE INDEX "Collection_id_ownerId_key" ON "Collection"("id", "ownerId");
CREATE UNIQUE INDEX "CollectibleItem_id_ownerId_key" ON "CollectibleItem"("id", "ownerId");

ALTER TABLE "CollectibleItem" DROP CONSTRAINT "CollectibleItem_collectionId_fkey";
ALTER TABLE "CollectibleItem" ADD CONSTRAINT "CollectibleItem_collectionId_ownerId_fkey"
  FOREIGN KEY ("collectionId", "ownerId") REFERENCES "Collection"("id", "ownerId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "StorageLocation" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "parentId" UUID,
    "name" TEXT NOT NULL,
    "type" "LocationType" NOT NULL DEFAULT 'OTHER',
    "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "qrToken" VARCHAR(43) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StorageLocation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CollectibleItem" ADD COLUMN "storageLocationId" UUID;

CREATE TABLE "ItemLocationHistory" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "fromLocationId" UUID,
    "toLocationId" UUID,
    "assignedById" TEXT NOT NULL,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ItemLocationHistory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ItemLocationHistory_has_endpoint_check" CHECK (
      "fromLocationId" IS NOT NULL OR "toLocationId" IS NOT NULL
    )
);

ALTER TABLE "StorageLocation"
  ADD CONSTRAINT "StorageLocation_name_check" CHECK (
    char_length("name") BETWEEN 1 AND 120 AND "name" !~ '[[:cntrl:]]'
  ),
  ADD CONSTRAINT "StorageLocation_qrToken_check" CHECK (
    "qrToken" ~ '^[A-Za-z0-9_-]{43}$'
  );

CREATE UNIQUE INDEX "StorageLocation_qrToken_key" ON "StorageLocation"("qrToken");
CREATE UNIQUE INDEX "StorageLocation_id_ownerId_key" ON "StorageLocation"("id", "ownerId");
CREATE INDEX "StorageLocation_ownerId_idx" ON "StorageLocation"("ownerId");
CREATE INDEX "StorageLocation_parentId_ownerId_idx" ON "StorageLocation"("parentId", "ownerId");
CREATE INDEX "CollectibleItem_storageLocationId_ownerId_idx" ON "CollectibleItem"("storageLocationId", "ownerId");
CREATE INDEX "ItemLocationHistory_itemId_movedAt_idx" ON "ItemLocationHistory"("itemId", "movedAt");
CREATE INDEX "ItemLocationHistory_fromLocationId_ownerId_idx" ON "ItemLocationHistory"("fromLocationId", "ownerId");
CREATE INDEX "ItemLocationHistory_toLocationId_ownerId_idx" ON "ItemLocationHistory"("toLocationId", "ownerId");
CREATE INDEX "ItemLocationHistory_assignedById_idx" ON "ItemLocationHistory"("assignedById");

ALTER TABLE "StorageLocation" ADD CONSTRAINT "StorageLocation_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StorageLocation" ADD CONSTRAINT "StorageLocation_parentId_ownerId_fkey"
  FOREIGN KEY ("parentId", "ownerId") REFERENCES "StorageLocation"("id", "ownerId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CollectibleItem" ADD CONSTRAINT "CollectibleItem_storageLocationId_ownerId_fkey"
  FOREIGN KEY ("storageLocationId", "ownerId") REFERENCES "StorageLocation"("id", "ownerId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ItemLocationHistory" ADD CONSTRAINT "ItemLocationHistory_itemId_ownerId_fkey"
  FOREIGN KEY ("itemId", "ownerId") REFERENCES "CollectibleItem"("id", "ownerId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ItemLocationHistory" ADD CONSTRAINT "ItemLocationHistory_fromLocationId_ownerId_fkey"
  FOREIGN KEY ("fromLocationId", "ownerId") REFERENCES "StorageLocation"("id", "ownerId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ItemLocationHistory" ADD CONSTRAINT "ItemLocationHistory_toLocationId_ownerId_fkey"
  FOREIGN KEY ("toLocationId", "ownerId") REFERENCES "StorageLocation"("id", "ownerId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ItemLocationHistory" ADD CONSTRAINT "ItemLocationHistory_assignedById_fkey"
  FOREIGN KEY ("assignedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
