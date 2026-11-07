ALTER TABLE "ExportJob" ADD COLUMN "lastDispatchedAt" TIMESTAMP(3);
CREATE INDEX "ExportJob_status_lastDispatchedAt_id_idx" ON "ExportJob"(status,"lastDispatchedAt",id);
