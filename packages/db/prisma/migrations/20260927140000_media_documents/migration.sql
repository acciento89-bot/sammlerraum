-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "MediaProcessingStatus" AS ENUM ('UPLOADING', 'PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "MediaPurpose" AS ENUM ('GALLERY', 'DETAIL');

-- CreateEnum
CREATE TYPE "DocumentCategory" AS ENUM ('PURCHASE_RECEIPT', 'INVOICE', 'AUTHENTICITY_CERTIFICATE', 'GRADING_PROOF', 'APPRAISAL', 'INSURANCE', 'PROVENANCE', 'WARRANTY', 'OTHER_PRIVATE');

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "status" "MediaProcessingStatus" NOT NULL DEFAULT 'UPLOADING',
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "checksumSha256" CHAR(64) NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "originalFileName" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaVariant" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "name" VARCHAR(32) NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "checksumSha256" CHAR(64) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaLink" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "itemId" UUID NOT NULL,
    "purpose" "MediaPurpose" NOT NULL DEFAULT 'GALLERY',
    "position" INTEGER NOT NULL,
    "title" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentLink" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "itemId" UUID NOT NULL,
    "category" "DocumentCategory" NOT NULL DEFAULT 'OTHER_PRIVATE',
    "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "position" INTEGER NOT NULL,
    "title" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "MediaAsset_ownerId_status_createdAt_idx" ON "MediaAsset"("ownerId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_id_ownerId_key" ON "MediaAsset"("id", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaVariant_storageKey_key" ON "MediaVariant"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "MediaVariant_assetId_name_key" ON "MediaVariant"("assetId", "name");

-- CreateIndex
CREATE INDEX "MediaLink_itemId_position_idx" ON "MediaLink"("itemId", "position");

-- CreateIndex
CREATE INDEX "MediaLink_assetId_idx" ON "MediaLink"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaLink_itemId_assetId_purpose_key" ON "MediaLink"("itemId", "assetId", "purpose");

-- CreateIndex
CREATE INDEX "DocumentLink_itemId_position_idx" ON "DocumentLink"("itemId", "position");

-- CreateIndex
CREATE INDEX "DocumentLink_assetId_idx" ON "DocumentLink"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentLink_itemId_assetId_key" ON "DocumentLink"("itemId", "assetId");

-- Earlier profile writes could contain arbitrary UUIDs. There was no media table
-- or original to restore, so clear unverifiable avatar pointers before enforcing
-- the owned asset foreign key.
UPDATE "UserProfile" SET "avatarAssetId" = NULL WHERE "avatarAssetId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_avatarAssetId_userId_fkey" FOREIGN KEY ("avatarAssetId", "userId") REFERENCES "MediaAsset"("id", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaVariant" ADD CONSTRAINT "MediaVariant_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaLink" ADD CONSTRAINT "MediaLink_assetId_ownerId_fkey" FOREIGN KEY ("assetId", "ownerId") REFERENCES "MediaAsset"("id", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaLink" ADD CONSTRAINT "MediaLink_itemId_ownerId_fkey" FOREIGN KEY ("itemId", "ownerId") REFERENCES "CollectibleItem"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_assetId_ownerId_fkey" FOREIGN KEY ("assetId", "ownerId") REFERENCES "MediaAsset"("id", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_itemId_ownerId_fkey" FOREIGN KEY ("itemId", "ownerId") REFERENCES "CollectibleItem"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;
