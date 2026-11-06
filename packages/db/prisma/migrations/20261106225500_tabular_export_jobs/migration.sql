CREATE TYPE "ExportFormat" AS ENUM ('CSV','XLSX');
CREATE TYPE "ExportJobStatus" AS ENUM ('PENDING','BUILDING','READY','FAILED','CANCELLED');
CREATE TABLE "ExportJob" (
 id UUID NOT NULL PRIMARY KEY,"ownerId" TEXT NOT NULL,format "ExportFormat" NOT NULL,locale VARCHAR(2) NOT NULL,request JSONB NOT NULL,
 status "ExportJobStatus" NOT NULL DEFAULT 'PENDING',revision INTEGER NOT NULL DEFAULT 1,"sourceJson" TEXT,"sourceHash" CHAR(64),"sourceAt" TIMESTAMP(3),"artifactId" UUID,
 "processingToken" UUID,"processingLeaseUntil" TIMESTAMP(3),"processingAttempts" INTEGER NOT NULL DEFAULT 0,"errorCode" VARCHAR(64),"expiresAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ExportJob_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ExportJob_artifactId_ownerId_fkey" FOREIGN KEY ("artifactId","ownerId") REFERENCES "MediaAsset"(id,"ownerId") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ExportJob_bounds" CHECK (locale IN ('de','en') AND revision>0 AND jsonb_typeof(request)='object' AND octet_length(request::text)<=65536 AND "processingAttempts" BETWEEN 0 AND 5 AND "expiresAt">"createdAt"),
 CONSTRAINT "ExportJob_lease_pair" CHECK (("processingToken" IS NULL)=("processingLeaseUntil" IS NULL)),
 CONSTRAINT "ExportJob_source_pair" CHECK ((("sourceJson" IS NULL AND "sourceHash" IS NULL AND "sourceAt" IS NULL) OR ("sourceJson" IS NOT NULL AND "sourceHash" ~ '^[0-9a-f]{64}$' AND "sourceAt" IS NOT NULL AND octet_length("sourceJson")<=8388608 AND jsonb_typeof("sourceJson"::jsonb)='object')) IS TRUE),
 CONSTRAINT "ExportJob_ready" CHECK (status<>'READY' OR ("artifactId" IS NOT NULL AND "sourceJson" IS NOT NULL AND "processingToken" IS NULL))
);
CREATE INDEX "ExportJob_ownerId_createdAt_id_idx" ON "ExportJob"("ownerId","createdAt" DESC,id);
CREATE INDEX "ExportJob_status_processingLeaseUntil_id_idx" ON "ExportJob"(status,"processingLeaseUntil",id);
CREATE FUNCTION export_job_identity_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF ROW(NEW.id,NEW."ownerId",NEW.format,NEW.locale,NEW.request,NEW."expiresAt",NEW."createdAt") IS DISTINCT FROM ROW(OLD.id,OLD."ownerId",OLD.format,OLD.locale,OLD.request,OLD."expiresAt",OLD."createdAt") THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Export request identity is immutable'; END IF;
 IF OLD."sourceJson" IS NOT NULL AND ROW(NEW."sourceJson",NEW."sourceHash",NEW."sourceAt") IS DISTINCT FROM ROW(OLD."sourceJson",OLD."sourceHash",OLD."sourceAt") THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Export source snapshot is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER export_job_identity_guard BEFORE UPDATE ON "ExportJob" FOR EACH ROW EXECUTE FUNCTION export_job_identity_guard();
