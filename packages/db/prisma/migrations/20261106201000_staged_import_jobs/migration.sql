CREATE TYPE "ImportSourceFormat" AS ENUM ('CSV','XLSX');
CREATE TYPE "ImportJobStatus" AS ENUM ('AWAITING_UPLOAD','PARSING','PARSED','PREVIEWING','REVIEW_READY','COMMITTING','COMPLETED','FAILED','CANCELLED');
CREATE TYPE "ImportRowStatus" AS ENUM ('PENDING','READY','CONFLICT','INVALID','COMMITTED','SKIPPED');
CREATE TABLE "ImportJob" (
 "id" UUID NOT NULL PRIMARY KEY,"ownerId" TEXT NOT NULL,"collectionId" UUID NOT NULL,
 "locale" VARCHAR(2) NOT NULL,"status" "ImportJobStatus" NOT NULL DEFAULT 'AWAITING_UPLOAD',"revision" INTEGER NOT NULL DEFAULT 1,
 "sourceFormat" "ImportSourceFormat" NOT NULL,"sourceFileName" VARCHAR(255) NOT NULL,"sourceByteSize" BIGINT NOT NULL,
 "sourceChecksumSha256" CHAR(64) NOT NULL,"sourceStorageKey" TEXT NOT NULL,"sourceVerifiedAt" TIMESTAMP(3),
 "totalRows" INTEGER,"parsedRows" INTEGER NOT NULL DEFAULT 0,"previewedRows" INTEGER NOT NULL DEFAULT 0,"committedRows" INTEGER NOT NULL DEFAULT 0,
 "previewGeneration" INTEGER NOT NULL DEFAULT 0,"mappingSnapshot" JSONB,"mappingHash" CHAR(64),"mappingProfileId" UUID,"mappingProfileRevision" INTEGER,
 "errorCode" VARCHAR(64),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ImportJob_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ImportJob_collectionId_ownerId_fkey" FOREIGN KEY ("collectionId","ownerId") REFERENCES "Collection"(id,"ownerId") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ImportJob_source_bounds" CHECK ("locale" IN ('de','en') AND "sourceByteSize" BETWEEN 1 AND 20971520 AND "sourceChecksumSha256" ~ '^[0-9a-f]{64}$' AND "sourceStorageKey"='imports/'||id::text||'/source' AND length("sourceFileName")>0),
 CONSTRAINT "ImportJob_progress_bounds" CHECK (revision>0 AND "previewGeneration">=0 AND "parsedRows" BETWEEN 0 AND 10000 AND "previewedRows" BETWEEN 0 AND "parsedRows" AND "committedRows" BETWEEN 0 AND "previewedRows" AND ("totalRows" IS NULL OR ("totalRows" BETWEEN 0 AND 10000 AND "parsedRows"<="totalRows"))),
 CONSTRAINT "ImportJob_mapping_pair" CHECK ((("mappingSnapshot" IS NULL AND "mappingHash" IS NULL AND "previewGeneration"=0 AND "previewedRows"=0) OR (jsonb_typeof("mappingSnapshot")='object' AND octet_length("mappingSnapshot"::text)<=16384 AND "mappingHash" ~ '^[0-9a-f]{64}$' AND "previewGeneration">0)) IS TRUE),
 CONSTRAINT "ImportJob_profile_pair" CHECK (("mappingProfileId" IS NULL)=("mappingProfileRevision" IS NULL) AND ("mappingProfileRevision" IS NULL OR "mappingProfileRevision">0)),
 CONSTRAINT "ImportJob_verified_before_parse" CHECK (status IN ('AWAITING_UPLOAD','FAILED','CANCELLED') OR "sourceVerifiedAt" IS NOT NULL),
 CONSTRAINT "ImportJob_parsed_before_preview" CHECK (status NOT IN ('PARSED','PREVIEWING','REVIEW_READY','COMMITTING','COMPLETED') OR ("totalRows" IS NOT NULL AND "parsedRows"="totalRows")),
 CONSTRAINT "ImportJob_complete_preview" CHECK (status NOT IN ('REVIEW_READY','COMMITTING','COMPLETED') OR ("previewedRows"="totalRows" AND "mappingSnapshot" IS NOT NULL)),
 CONSTRAINT "ImportJob_complete_commit" CHECK (status<>'COMPLETED' OR "committedRows"="totalRows")
);
CREATE UNIQUE INDEX "ImportJob_sourceStorageKey_key" ON "ImportJob"("sourceStorageKey");
CREATE INDEX "ImportJob_ownerId_createdAt_id_idx" ON "ImportJob"("ownerId","createdAt" DESC,id);
CREATE INDEX "ImportJob_status_updatedAt_id_idx" ON "ImportJob"(status,"updatedAt",id);

-- Validate compact JSON byte size without removing whitespace inside cell text.
CREATE FUNCTION import_raw_cells_valid(cells JSONB) RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
DECLARE cell JSONB; bytes INTEGER:=2; count INTEGER:=0;
BEGIN
 IF jsonb_typeof(cells)<>'array' THEN RETURN FALSE; END IF;
 IF jsonb_array_length(cells)>256 THEN RETURN FALSE; END IF;
 FOR cell IN SELECT value FROM jsonb_array_elements(cells) LOOP
  IF jsonb_typeof(cell) NOT IN ('string','null') THEN RETURN FALSE; END IF;
  IF jsonb_typeof(cell)='string' AND octet_length(cell #>> '{}')>16384 THEN RETURN FALSE; END IF;
  bytes:=bytes+octet_length(cell::text)+CASE WHEN count>0 THEN 1 ELSE 0 END;
  IF bytes>65536 THEN RETURN FALSE; END IF;
  count:=count+1;
 END LOOP;
 RETURN TRUE;
END $$;
CREATE TABLE "ImportRow" (
 id UUID NOT NULL PRIMARY KEY,"jobId" UUID NOT NULL,"rowNumber" INTEGER NOT NULL,"rowKey" VARCHAR(128) NOT NULL,"rawCells" JSONB NOT NULL,
 status "ImportRowStatus" NOT NULL DEFAULT 'PENDING',"previewGeneration" INTEGER NOT NULL DEFAULT 0,preview JSONB,
 "normalizedIdentifierType" VARCHAR(64),"normalizedIdentifierValue" VARCHAR(512),decision JSONB,"committedItemId" UUID,"commitReceipt" JSONB,"committedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ImportRow_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ImportJob"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ImportRow_source_bounds" CHECK ("rowNumber" BETWEEN 1 AND 10000 AND "rowKey"="jobId"::text||':'||"rowNumber"::text AND import_raw_cells_valid("rawCells")),
 CONSTRAINT "ImportRow_preview_bounds" CHECK ("previewGeneration">=0 AND (preview IS NULL OR (jsonb_typeof(preview)='object' AND octet_length(preview::text)<=1048576)) AND (("normalizedIdentifierType" IS NULL)=("normalizedIdentifierValue" IS NULL))),
 CONSTRAINT "ImportRow_preview_state" CHECK (((status='PENDING' AND preview IS NULL AND "previewGeneration"=0) OR (status<>'PENDING' AND preview IS NOT NULL AND "previewGeneration">0 AND preview->>'rowKey'="rowKey")) IS TRUE),
 CONSTRAINT "ImportRow_decision_object" CHECK (decision IS NULL OR jsonb_typeof(decision)='object'),
 CONSTRAINT "ImportRow_commit_receipt" CHECK ((
  (status='COMMITTED' AND "committedItemId" IS NOT NULL AND "commitReceipt" IS NOT NULL AND "committedAt" IS NOT NULL AND jsonb_typeof("commitReceipt")='object' AND decision->>'action' IN ('CREATE','MERGE','CREATE_SEPARATE'))
  OR (status='SKIPPED' AND "committedItemId" IS NULL AND "commitReceipt" IS NOT NULL AND "committedAt" IS NOT NULL AND jsonb_typeof("commitReceipt")='object' AND decision->>'action'='SKIP')
  OR (status NOT IN ('COMMITTED','SKIPPED') AND "committedItemId" IS NULL AND "commitReceipt" IS NULL AND "committedAt" IS NULL)
 ) IS TRUE)
);
CREATE UNIQUE INDEX "ImportRow_rowKey_key" ON "ImportRow"("rowKey");
CREATE UNIQUE INDEX "ImportRow_jobId_rowNumber_key" ON "ImportRow"("jobId","rowNumber");
CREATE INDEX "ImportRow_jobId_status_rowNumber_idx" ON "ImportRow"("jobId",status,"rowNumber");
CREATE INDEX "ImportRow_jobId_normalizedIdentifierType_normalizedIdentifierValue_idx" ON "ImportRow"("jobId","normalizedIdentifierType","normalizedIdentifierValue");
CREATE TABLE "ImportMappingProfile" (
 id UUID NOT NULL PRIMARY KEY,"ownerId" TEXT NOT NULL,name VARCHAR(120) NOT NULL,"normalizedName" VARCHAR(120) NOT NULL,revision INTEGER NOT NULL DEFAULT 1,mapping JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ImportMappingProfile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ImportMappingProfile_bounds" CHECK (revision>0 AND length(name)>0 AND length("normalizedName")>0 AND jsonb_typeof(mapping)='object' AND octet_length(mapping::text)<=16384)
);
CREATE UNIQUE INDEX "ImportMappingProfile_ownerId_normalizedName_key" ON "ImportMappingProfile"("ownerId","normalizedName");
CREATE INDEX "ImportMappingProfile_ownerId_updatedAt_id_idx" ON "ImportMappingProfile"("ownerId","updatedAt" DESC,id);

CREATE FUNCTION import_job_identity_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF ROW(NEW.id,NEW."ownerId",NEW."collectionId",NEW.locale,NEW."sourceFormat",NEW."sourceFileName",NEW."sourceByteSize",NEW."sourceChecksumSha256",NEW."sourceStorageKey") IS DISTINCT FROM ROW(OLD.id,OLD."ownerId",OLD."collectionId",OLD.locale,OLD."sourceFormat",OLD."sourceFileName",OLD."sourceByteSize",OLD."sourceChecksumSha256",OLD."sourceStorageKey") THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Import source identity is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER import_job_identity_guard BEFORE UPDATE ON "ImportJob" FOR EACH ROW EXECUTE FUNCTION import_job_identity_guard();
CREATE FUNCTION import_row_identity_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF ROW(NEW.id,NEW."jobId",NEW."rowNumber",NEW."rowKey",NEW."rawCells") IS DISTINCT FROM ROW(OLD.id,OLD."jobId",OLD."rowNumber",OLD."rowKey",OLD."rawCells") THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Import row source is immutable'; END IF;
 IF OLD.status IN ('COMMITTED','SKIPPED') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Import row commit receipt is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER import_row_identity_guard BEFORE UPDATE ON "ImportRow" FOR EACH ROW EXECUTE FUNCTION import_row_identity_guard();
