CREATE TYPE "AuditSource" AS ENUM ('USER','IMPORT','AI','MARKET_SYNC','SYSTEM','MODERATION');
CREATE TYPE "AuditResourceType" AS ENUM ('COLLECTION','NODE','ITEM','LOCATION','IMPORT_JOB','SHARE');
CREATE TABLE "AuditEvent" (
 id UUID PRIMARY KEY,
 sequence BIGSERIAL NOT NULL UNIQUE,
 "resourceType" "AuditResourceType" NOT NULL,
 "resourceId" UUID NOT NULL,
 "collectionId" UUID REFERENCES "Collection"(id) ON DELETE CASCADE,
 "itemId" UUID REFERENCES "CollectibleItem"(id) ON DELETE CASCADE,
 "locationOwnerUserId" TEXT REFERENCES "user"(id) ON DELETE CASCADE ON UPDATE RESTRICT,
 action VARCHAR(80) NOT NULL CHECK(action ~ '^[A-Z][A-Z0-9_]{1,79}$'),
 source "AuditSource" NOT NULL,
 "actorId" TEXT REFERENCES "user"(id) ON DELETE SET NULL ON UPDATE RESTRICT,
 before JSONB NOT NULL, after JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',clock_timestamp()),
 CONSTRAINT "AuditEvent_anchor" CHECK(num_nonnulls("collectionId","itemId","locationOwnerUserId")=1 AND ((
  ("resourceType"='ITEM' AND "itemId"="resourceId" AND "collectionId" IS NULL AND "locationOwnerUserId" IS NULL) OR
  ("resourceType"='LOCATION' AND "locationOwnerUserId" IS NOT NULL AND "itemId" IS NULL AND "collectionId" IS NULL) OR
  ("resourceType"='COLLECTION' AND "collectionId"="resourceId" AND "itemId" IS NULL AND "locationOwnerUserId" IS NULL) OR
  ("resourceType" IN ('NODE','IMPORT_JOB','SHARE') AND "collectionId" IS NOT NULL AND "itemId" IS NULL AND "locationOwnerUserId" IS NULL)
 ) IS TRUE)),
 CONSTRAINT "AuditEvent_payload" CHECK(jsonb_typeof(before) IN ('object','null') AND jsonb_typeof(after) IN ('object','null') AND octet_length(before::text)<=16384 AND octet_length(after::text)<=16384)
);
CREATE INDEX "AuditEvent_resourceType_resourceId_sequence_idx" ON "AuditEvent"("resourceType","resourceId",sequence DESC);
CREATE INDEX "AuditEvent_collectionId_idx" ON "AuditEvent"("collectionId");
CREATE INDEX "AuditEvent_itemId_idx" ON "AuditEvent"("itemId");
CREATE INDEX "AuditEvent_locationOwnerUserId_idx" ON "AuditEvent"("locationOwnerUserId");
CREATE INDEX "AuditEvent_actorId_idx" ON "AuditEvent"("actorId");
CREATE FUNCTION guard_append_only_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD."actorId" IS NOT NULL AND NEW."actorId" IS NULL AND NOT EXISTS(SELECT 1 FROM "user" WHERE id=OLD."actorId") AND (to_jsonb(NEW)-'actorId') IS NOT DISTINCT FROM (to_jsonb(OLD)-'actorId') THEN RETURN NEW; END IF;
 ELSIF TG_OP='DELETE' THEN
  IF (OLD."itemId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "CollectibleItem" WHERE id=OLD."itemId")) OR (OLD."collectionId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "Collection" WHERE id=OLD."collectionId")) OR (OLD."locationOwnerUserId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "user" WHERE id=OLD."locationOwnerUserId")) THEN RETURN OLD; END IF;
 END IF;
 RAISE EXCEPTION 'Audit events are append only' USING ERRCODE='23514';
END $$;
CREATE TRIGGER audit_event_immutable BEFORE UPDATE OR DELETE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION guard_append_only_audit();
