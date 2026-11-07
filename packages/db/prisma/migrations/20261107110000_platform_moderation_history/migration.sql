-- CreateTable
CREATE TABLE "CommunityModerationEvent" (
    "id" UUID NOT NULL,
    "actorId" TEXT,
    "reportId" UUID,
    "commentId" UUID,
    "targetSnapshotId" VARCHAR(128) NOT NULL,
    "source" "AuditSource" NOT NULL DEFAULT 'MODERATION',
    "action" VARCHAR(40) NOT NULL,
    "reason" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityModerationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityModerationEvent_reportId_createdAt_idx" ON "CommunityModerationEvent"("reportId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityModerationEvent_commentId_createdAt_idx" ON "CommunityModerationEvent"("commentId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityModerationEvent_actorId_idx" ON "CommunityModerationEvent"("actorId");

-- AddForeignKey
ALTER TABLE "CommunityModerationEvent" ADD CONSTRAINT "CommunityModerationEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CommunityModerationEvent" ADD CONSTRAINT "CommunityModerationEvent_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "CommunityReport"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CommunityModerationEvent" ADD CONSTRAINT "CommunityModerationEvent_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "CommunityComment"("id") ON DELETE SET NULL ON UPDATE RESTRICT;


ALTER TABLE "CommunityModerationEvent" ADD CONSTRAINT moderation_history_source_reason CHECK (
 source='MODERATION' AND char_length(btrim(reason)) BETWEEN 1 AND 2000
 AND action IN ('COMMENT_HIDDEN','COMMENT_RESTORED','REPORT_RESOLVED','REPORT_DISMISSED')
);
CREATE FUNCTION protect_community_moderation_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'moderation history is append only'; END IF;
 IF (to_jsonb(NEW)-'actorId'-'reportId'-'commentId') IS DISTINCT FROM (to_jsonb(OLD)-'actorId'-'reportId'-'commentId')
 OR (NEW."actorId" IS DISTINCT FROM OLD."actorId" AND NOT (NEW."actorId" IS NULL AND NOT EXISTS(SELECT 1 FROM "user" WHERE id=OLD."actorId")))
 OR (NEW."reportId" IS DISTINCT FROM OLD."reportId" AND NOT (NEW."reportId" IS NULL AND NOT EXISTS(SELECT 1 FROM "CommunityReport" WHERE id=OLD."reportId")))
 OR (NEW."commentId" IS DISTINCT FROM OLD."commentId" AND NOT (NEW."commentId" IS NULL AND NOT EXISTS(SELECT 1 FROM "CommunityComment" WHERE id=OLD."commentId")))
 THEN RAISE EXCEPTION 'moderation history is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_community_moderation_history BEFORE UPDATE OR DELETE ON "CommunityModerationEvent" FOR EACH ROW EXECUTE FUNCTION protect_community_moderation_history();
