ALTER TABLE "MediaAsset"
    ADD COLUMN "processingToken" UUID,
    ADD COLUMN "processingLeaseUntil" TIMESTAMP(3),
    ADD COLUMN "processingAttempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "processingErrorCode" VARCHAR(32),
    ADD COLUMN "lastDispatchedAt" TIMESTAMP(3);

CREATE INDEX "MediaAsset_status_processingLeaseUntil_idx"
    ON "MediaAsset"("status", "processingLeaseUntil");
CREATE INDEX "MediaAsset_status_lastDispatchedAt_createdAt_idx"
    ON "MediaAsset"("status", "lastDispatchedAt", "createdAt");
