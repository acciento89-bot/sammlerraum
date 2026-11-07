ALTER TABLE "ImportJob" ADD COLUMN "uploadRequestId" UUID,
 ADD COLUMN "uploadOptions" JSONB, ADD COLUMN "uploadCompletedAt" TIMESTAMP(3),
 ADD COLUMN "sourceExpiresAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + interval '24 hours'),
 ADD COLUMN "lastDispatchedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "ImportJob_ownerId_uploadRequestId_key" ON "ImportJob"("ownerId","uploadRequestId");
CREATE INDEX "ImportJob_sourceExpiresAt_id_idx" ON "ImportJob"("sourceExpiresAt",id);
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_upload_bounds" CHECK (
 (("uploadRequestId" IS NULL)=("uploadOptions" IS NULL)) AND
 ("uploadOptions" IS NULL OR (jsonb_typeof("uploadOptions")='object' AND octet_length("uploadOptions"::text)<=1024)) AND
 ("uploadCompletedAt" IS NULL OR "parserOptions" IS NOT NULL));
CREATE FUNCTION import_upload_identity_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF ROW(NEW."uploadRequestId",NEW."uploadOptions",NEW."sourceExpiresAt") IS DISTINCT FROM ROW(OLD."uploadRequestId",OLD."uploadOptions",OLD."sourceExpiresAt") OR
 (OLD."uploadCompletedAt" IS NOT NULL AND NEW."uploadCompletedAt" IS DISTINCT FROM OLD."uploadCompletedAt") THEN
 RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Import upload identity is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER import_upload_identity_guard BEFORE UPDATE ON "ImportJob" FOR EACH ROW EXECUTE FUNCTION import_upload_identity_guard();
