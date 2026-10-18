-- CreateEnum
CREATE TYPE "AcquisitionType" AS ENUM ('PURCHASE', 'GIFT', 'TRADE', 'INHERITANCE', 'FOUND', 'OTHER');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('NOT_FOR_TRADE', 'OPEN_TO_TRADE', 'FOR_SALE', 'RESERVED');

-- CreateTable
CREATE TABLE "CollectibleItem" (
    "id" UUID NOT NULL,
    "collectionId" UUID NOT NULL,
    "nodeId" UUID,
    "title" TEXT NOT NULL,
    "publicDescription" TEXT,
    "privateNotes" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "acquisitionType" "AcquisitionType" NOT NULL DEFAULT 'OTHER',
    "acquisitionDate" DATE,
    "purchaseAmountMinor" BIGINT,
    "purchaseCurrency" CHAR(3),
    "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "tradeStatus" "TradeStatus" NOT NULL DEFAULT 'NOT_FOR_TRADE',
    "archivedAt" TIMESTAMP(3),
    "disposedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectibleItem_pkey" PRIMARY KEY ("id")
);

-- AddCheckConstraints
ALTER TABLE "CollectibleItem"
  ADD CONSTRAINT "CollectibleItem_quantity_check" CHECK ("quantity" > 0),
  ADD CONSTRAINT "CollectibleItem_purchaseAmountMinor_check" CHECK (
    "purchaseAmountMinor" IS NULL OR
    ("purchaseAmountMinor" >= 0 AND "purchaseAmountMinor" <= 9007199254740991)
  ),
  ADD CONSTRAINT "CollectibleItem_purchaseMoneyPair_check" CHECK (
    ("purchaseAmountMinor" IS NULL) = ("purchaseCurrency" IS NULL)
  ),
  ADD CONSTRAINT "CollectibleItem_purchaseCurrency_check" CHECK (
    "purchaseCurrency" IS NULL OR "purchaseCurrency" ~ '^[A-Z]{3}$'
  );

-- CreateIndex
CREATE INDEX "CollectibleItem_collectionId_idx" ON "CollectibleItem"("collectionId");

-- CreateIndex
CREATE INDEX "CollectibleItem_nodeId_collectionId_idx" ON "CollectibleItem"("nodeId", "collectionId");

-- AddForeignKey
ALTER TABLE "CollectibleItem" ADD CONSTRAINT "CollectibleItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectibleItem" ADD CONSTRAINT "CollectibleItem_nodeId_collectionId_fkey" FOREIGN KEY ("nodeId", "collectionId") REFERENCES "CollectionNode"("id", "collectionId") ON DELETE RESTRICT ON UPDATE CASCADE;
