-- This cleanup-only manifest intentionally survives owner/collection/job erasure.
-- It contains no user identity or source contents, only one fixed server-owned object key.
CREATE TABLE "ImportSourceObject" (
 id UUID PRIMARY KEY,"jobId" UUID UNIQUE,"storageKey" TEXT NOT NULL UNIQUE,
 "expiresAt" TIMESTAMP(3) NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',CURRENT_TIMESTAMP),
 "cleanupStartedAt" TIMESTAMP(3),"deletedAt" TIMESTAMP(3),"lastAttemptAt" TIMESTAMP(3),"lastReconciledAt" TIMESTAMP(3),
 CONSTRAINT "ImportSourceObject_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ImportJob"(id) ON DELETE SET NULL,
 CONSTRAINT "ImportSourceObject_identity" CHECK (("jobId" IS NULL OR "jobId"=id) AND "storageKey"='imports/'||id::text||'/source'),
 CONSTRAINT "ImportSourceObject_deletion" CHECK ("deletedAt" IS NULL OR ("cleanupStartedAt" IS NOT NULL AND "jobId" IS NULL))
);
CREATE INDEX "ImportSourceObject_lastAttemptAt_expiresAt_id_idx" ON "ImportSourceObject"("lastAttemptAt","expiresAt",id);
INSERT INTO "ImportSourceObject" (id,"jobId","storageKey","expiresAt") SELECT id,id,"sourceStorageKey","sourceExpiresAt" FROM "ImportJob";
CREATE FUNCTION import_source_object_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF ROW(NEW.id,NEW."storageKey",NEW."expiresAt",NEW."createdAt") IS DISTINCT FROM ROW(OLD.id,OLD."storageKey",OLD."expiresAt",OLD."createdAt") OR
 (OLD."jobId" IS NULL AND NEW."jobId" IS NOT NULL) OR
 (OLD."cleanupStartedAt" IS NOT NULL AND NEW."cleanupStartedAt" IS DISTINCT FROM OLD."cleanupStartedAt") OR
 (OLD."deletedAt" IS NOT NULL AND NEW."deletedAt" IS DISTINCT FROM OLD."deletedAt") THEN
 RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Import source cleanup identity is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER import_source_object_guard BEFORE UPDATE ON "ImportSourceObject" FOR EACH ROW EXECUTE FUNCTION import_source_object_guard();
