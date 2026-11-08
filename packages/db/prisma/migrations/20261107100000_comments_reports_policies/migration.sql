-- CreateEnum
CREATE TYPE "CommunityReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "CommunityReportTarget" AS ENUM ('USER', 'COMMENT');

-- AlterTable
ALTER TABLE "CollectibleItem" ADD COLUMN     "commentsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Collection" ADD COLUMN     "commentsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "CommunityPreference" (
    "userId" TEXT NOT NULL,
    "commentsEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CommunityPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CommunityComment" (
    "id" UUID NOT NULL,
    "authorId" TEXT NOT NULL,
    "collectionId" UUID NOT NULL,
    "itemId" UUID,
    "parentId" UUID,
    "body" TEXT NOT NULL,
    "ownerHiddenAt" TIMESTAMP(3),
    "moderationHiddenAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityReport" (
    "id" UUID NOT NULL,
    "reporterId" TEXT,
    "targetType" "CommunityReportTarget" NOT NULL,
    "targetSnapshotId" VARCHAR(128) NOT NULL,
    "userId" TEXT,
    "commentId" UUID,
    "category" VARCHAR(32) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CommunityReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionReason" TEXT,

    CONSTRAINT "CommunityReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityComment_collectionId_itemId_id_idx" ON "CommunityComment"("collectionId", "itemId", "id");

-- CreateIndex
CREATE INDEX "CommunityComment_authorId_createdAt_idx" ON "CommunityComment"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityComment_itemId_idx" ON "CommunityComment"("itemId");

-- CreateIndex
CREATE INDEX "CommunityComment_parentId_idx" ON "CommunityComment"("parentId");

-- CreateIndex
CREATE INDEX "CommunityReport_status_createdAt_id_idx" ON "CommunityReport"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "CommunityReport_reporterId_targetType_targetSnapshotId_idx" ON "CommunityReport"("reporterId", "targetType", "targetSnapshotId");

-- CreateIndex
CREATE INDEX "CommunityReport_commentId_idx" ON "CommunityReport"("commentId");

-- CreateIndex
CREATE INDEX "CommunityReport_userId_idx" ON "CommunityReport"("userId");

-- CreateIndex
CREATE INDEX "CommunityReport_resolvedById_idx" ON "CommunityReport"("resolvedById");

-- AddForeignKey
ALTER TABLE "CommunityPreference" ADD CONSTRAINT "CommunityPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_itemId_collectionId_fkey" FOREIGN KEY ("itemId", "collectionId") REFERENCES "CollectibleItem"("id", "collectionId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CommunityComment"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "CommunityComment"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "CommunityComment" ADD CONSTRAINT "comment_safe_body" CHECK(char_length(body)<=4000 AND ("deletedAt" IS NOT NULL OR char_length(body)>0));
ALTER TABLE "CommunityComment" ADD CONSTRAINT "comment_not_own_parent" CHECK("parentId" IS NULL OR "parentId"<>id);
ALTER TABLE "CommunityReport" ADD CONSTRAINT "report_safe_reason" CHECK(char_length(reason) BETWEEN 1 AND 2000 AND category IN ('SPAM','HARASSMENT','ILLEGAL_CONTENT','OTHER'));
CREATE UNIQUE INDEX community_report_one_open_per_actor_target ON "CommunityReport"("reporterId","targetType","targetSnapshotId") WHERE status='OPEN' AND "reporterId" IS NOT NULL;
CREATE FUNCTION guard_comment_context() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE parent_collection uuid; parent_item uuid;
BEGIN
 IF TG_OP='UPDATE' AND (NEW."authorId" IS DISTINCT FROM OLD."authorId" OR NEW."collectionId" IS DISTINCT FROM OLD."collectionId" OR NEW."itemId" IS DISTINCT FROM OLD."itemId" OR NEW."parentId" IS DISTINCT FROM OLD."parentId") THEN
  -- Parent erasure may detach a reply through the actual FK; arbitrary rethreading is forbidden.
  IF NEW."parentId" IS NULL AND OLD."parentId" IS NOT NULL AND NEW."authorId"=OLD."authorId" AND NEW."collectionId"=OLD."collectionId" AND NEW."itemId" IS NOT DISTINCT FROM OLD."itemId" THEN
   EXECUTE format('SELECT "collectionId" FROM %I."CommunityComment" WHERE id=$1',TG_TABLE_SCHEMA) INTO parent_collection USING OLD."parentId";
   IF parent_collection IS NULL THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'Comment context is immutable' USING ERRCODE='23514';
 END IF;
 IF NEW."parentId" IS NOT NULL THEN
  EXECUTE format('SELECT "collectionId","itemId" FROM %I."CommunityComment" WHERE id=$1 FOR KEY SHARE',TG_TABLE_SCHEMA) INTO parent_collection,parent_item USING NEW."parentId";
  IF parent_collection IS NULL OR parent_collection<>NEW."collectionId" OR parent_item IS DISTINCT FROM NEW."itemId" THEN RAISE EXCEPTION 'Reply must remain in its actual thread' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_comment_context BEFORE INSERT OR UPDATE ON "CommunityComment" FOR EACH ROW EXECUTE FUNCTION guard_comment_context();

-- Canonical snapshots deduplicate UUID spelling aliases; nullable FKs remain erasable.
ALTER TABLE "CommunityReport" ADD CONSTRAINT "report_coherent_target" CHECK (
 ("targetType"='COMMENT' AND "userId" IS NULL AND ("commentId" IS NULL OR "targetSnapshotId"="commentId"::text))
 OR ("targetType"='USER' AND "commentId" IS NULL AND ("userId" IS NULL OR "targetSnapshotId"="userId"))
);
