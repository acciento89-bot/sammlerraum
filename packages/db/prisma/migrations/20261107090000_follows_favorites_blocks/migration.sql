-- CreateEnum
CREATE TYPE "FavoriteTargetType" AS ENUM ('COLLECTION', 'ITEM');

-- CreateTable
CREATE TABLE "UserFollow" (
    "id" UUID NOT NULL,
    "followerId" TEXT NOT NULL,
    "followedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBlock" (
    "id" UUID NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "FavoriteTargetType" NOT NULL,
    "collectionId" UUID,
    "itemId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserFollow_followerId_id_idx" ON "UserFollow"("followerId", "id");

-- CreateIndex
CREATE INDEX "UserFollow_followedId_id_idx" ON "UserFollow"("followedId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "UserFollow_followerId_followedId_key" ON "UserFollow"("followerId", "followedId");

-- CreateIndex
CREATE INDEX "UserBlock_blockedId_blockerId_idx" ON "UserBlock"("blockedId", "blockerId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBlock_blockerId_blockedId_key" ON "UserBlock"("blockerId", "blockedId");

-- CreateIndex
CREATE INDEX "Favorite_userId_id_idx" ON "Favorite"("userId", "id");

-- CreateIndex
CREATE INDEX "Favorite_collectionId_idx" ON "Favorite"("collectionId");

-- CreateIndex
CREATE INDEX "Favorite_itemId_idx" ON "Favorite"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_collectionId_key" ON "Favorite"("userId", "collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_itemId_key" ON "Favorite"("userId", "itemId");

-- AddForeignKey
ALTER TABLE "UserFollow" ADD CONSTRAINT "UserFollow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFollow" ADD CONSTRAINT "UserFollow_followedId_fkey" FOREIGN KEY ("followedId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CollectibleItem"("id") ON DELETE CASCADE ON UPDATE RESTRICT;


ALTER TABLE "UserFollow" ADD CONSTRAINT "follow_not_self" CHECK ("followerId"<>"followedId");
ALTER TABLE "UserBlock" ADD CONSTRAINT "block_not_self" CHECK ("blockerId"<>"blockedId");
ALTER TABLE "Favorite" ADD CONSTRAINT "favorite_exact_target" CHECK (
 (type='COLLECTION' AND "collectionId" IS NOT NULL AND "itemId" IS NULL)
 OR (type='ITEM' AND "itemId" IS NOT NULL AND "collectionId" IS NULL)
);
-- Raw block insertion shares the actual interaction fence, so an in-flight follow cannot escape it.
CREATE FUNCTION apply_community_block_pair() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 EXECUTE format('SELECT id FROM %I."user" WHERE id IN ($1,$2) ORDER BY id COLLATE "C" FOR NO KEY UPDATE',TG_TABLE_SCHEMA) USING NEW."blockerId",NEW."blockedId";
 EXECUTE format('DELETE FROM %I."UserFollow" WHERE ("followerId"=$1 AND "followedId"=$2) OR ("followerId"=$2 AND "followedId"=$1)',TG_TABLE_SCHEMA) USING NEW."blockerId",NEW."blockedId";
 EXECUTE format('DELETE FROM %1$I."Favorite" f WHERE (f."userId"=$1 AND (EXISTS(SELECT 1 FROM %1$I."Collection" c WHERE c.id=f."collectionId" AND c."ownerId"=$2) OR EXISTS(SELECT 1 FROM %1$I."CollectibleItem" i WHERE i.id=f."itemId" AND i."ownerId"=$2))) OR (f."userId"=$2 AND (EXISTS(SELECT 1 FROM %1$I."Collection" c WHERE c.id=f."collectionId" AND c."ownerId"=$1) OR EXISTS(SELECT 1 FROM %1$I."CollectibleItem" i WHERE i.id=f."itemId" AND i."ownerId"=$1)))',TG_TABLE_SCHEMA) USING NEW."blockerId",NEW."blockedId";
 RETURN NEW;
END $$;
CREATE TRIGGER community_block_pair BEFORE INSERT OR UPDATE OF "blockerId","blockedId" ON "UserBlock" FOR EACH ROW EXECUTE FUNCTION apply_community_block_pair();
