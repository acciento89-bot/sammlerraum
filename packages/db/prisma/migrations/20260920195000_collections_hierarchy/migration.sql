-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PRIVATE', 'UNLISTED', 'PUBLIC');

-- CreateTable
CREATE TABLE "Collection" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionNode" (
    "id" UUID NOT NULL,
    "collectionId" UUID NOT NULL,
    "parentId" UUID,
    "name" TEXT NOT NULL,
    "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionNode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Collection_ownerId_idx" ON "Collection"("ownerId");

-- CreateIndex
CREATE INDEX "CollectionNode_collectionId_idx" ON "CollectionNode"("collectionId");

-- CreateIndex
CREATE INDEX "CollectionNode_parentId_collectionId_idx" ON "CollectionNode"("parentId", "collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionNode_id_collectionId_key" ON "CollectionNode"("id", "collectionId");

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionNode" ADD CONSTRAINT "CollectionNode_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionNode" ADD CONSTRAINT "CollectionNode_parentId_collectionId_fkey" FOREIGN KEY ("parentId", "collectionId") REFERENCES "CollectionNode"("id", "collectionId") ON DELETE RESTRICT ON UPDATE CASCADE;
