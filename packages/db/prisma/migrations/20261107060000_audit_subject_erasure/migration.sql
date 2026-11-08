ALTER TABLE "AuditEvent" ADD COLUMN "subjectUserId" TEXT;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "user"(id) ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_subject_actions" CHECK ("subjectUserId" IS NULL OR action IN ('MEMBERSHIP_ADDED','MEMBERSHIP_ROLE_CHANGED','MEMBERSHIP_REMOVED','MEMBERSHIP_JOINED','COLLECTION_OWNERSHIP_TRANSFERRED'));
CREATE INDEX "AuditEvent_subjectUserId_idx" ON "AuditEvent"("subjectUserId");
CREATE OR REPLACE FUNCTION guard_append_only_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-'actorId'-'subjectUserId') IS NOT DISTINCT FROM (to_jsonb(OLD)-'actorId'-'subjectUserId')
   AND (NEW."actorId" IS NOT DISTINCT FROM OLD."actorId" OR (OLD."actorId" IS NOT NULL AND NEW."actorId" IS NULL AND NOT EXISTS(SELECT 1 FROM "user" WHERE id=OLD."actorId")))
   AND (NEW."subjectUserId" IS NOT DISTINCT FROM OLD."subjectUserId" OR (OLD."subjectUserId" IS NOT NULL AND NEW."subjectUserId" IS NULL AND NOT EXISTS(SELECT 1 FROM "user" WHERE id=OLD."subjectUserId")))
   AND (NEW."actorId" IS DISTINCT FROM OLD."actorId" OR NEW."subjectUserId" IS DISTINCT FROM OLD."subjectUserId") THEN RETURN NEW; END IF;
 ELSIF TG_OP='DELETE' THEN
  IF (OLD."itemId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CollectibleItem" WHERE id=OLD."itemId")) OR (OLD."collectionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Collection" WHERE id=OLD."collectionId")) OR (OLD."locationOwnerUserId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "user" WHERE id=OLD."locationOwnerUserId")) THEN RETURN OLD; END IF;
 END IF;
 RAISE EXCEPTION 'Audit events are append only' USING ERRCODE='23514';
END $$;
