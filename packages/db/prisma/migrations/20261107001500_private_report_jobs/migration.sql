CREATE TABLE "ReportJob" (
 id UUID NOT NULL PRIMARY KEY,"ownerId" TEXT NOT NULL,format VARCHAR(3) NOT NULL DEFAULT 'PDF',locale VARCHAR(2) NOT NULL,request JSONB NOT NULL,
 status "ExportJobStatus" NOT NULL DEFAULT 'PENDING',revision INTEGER NOT NULL DEFAULT 1,"sourceJson" TEXT,"sourceHash" CHAR(64),"sourceAt" TIMESTAMP(3),"artifactId" UUID,
 "processingToken" UUID,"processingLeaseUntil" TIMESTAMP(3),"processingAttempts" INTEGER NOT NULL DEFAULT 0,"lastDispatchedAt" TIMESTAMP(3),"errorCode" VARCHAR(64),"expiresAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ReportJob_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ReportJob_artifactId_ownerId_fkey" FOREIGN KEY ("artifactId","ownerId") REFERENCES "MediaAsset"(id,"ownerId") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ReportJob_bounds" CHECK (locale IN ('de','en') AND revision>0 AND format='PDF' AND jsonb_typeof(request)='object' AND octet_length(request::text)<=65536 AND "processingAttempts" BETWEEN 0 AND 5 AND "expiresAt">"createdAt"),
 CONSTRAINT "ReportJob_lease_pair" CHECK (("processingToken" IS NULL)=("processingLeaseUntil" IS NULL)),
 CONSTRAINT "ReportJob_source_pair" CHECK ((("sourceJson" IS NULL AND "sourceHash" IS NULL AND "sourceAt" IS NULL) OR ("sourceJson" IS NOT NULL AND "sourceHash" ~ '^[0-9a-f]{64}$' AND "sourceAt" IS NOT NULL AND octet_length("sourceJson")<=8388608 AND jsonb_typeof("sourceJson"::jsonb)='object')) IS TRUE),
 CONSTRAINT "ReportJob_ready" CHECK (status<>'READY' OR ("artifactId" IS NOT NULL AND "sourceJson" IS NOT NULL AND "processingToken" IS NULL))
);
CREATE INDEX "ReportJob_ownerId_createdAt_id_idx" ON "ReportJob"("ownerId","createdAt" DESC,id);
CREATE INDEX "ReportJob_status_processingLeaseUntil_id_idx" ON "ReportJob"(status,"processingLeaseUntil",id);
CREATE INDEX "ReportJob_status_lastDispatchedAt_id_idx" ON "ReportJob"(status,"lastDispatchedAt",id);
CREATE TRIGGER report_job_identity_guard BEFORE UPDATE ON "ReportJob" FOR EACH ROW EXECUTE FUNCTION export_job_identity_guard();
