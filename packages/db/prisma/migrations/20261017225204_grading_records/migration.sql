-- CreateTable
CREATE TABLE "Grading" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "itemQuantity" INTEGER NOT NULL DEFAULT 1,
    "provider" VARCHAR(120) NOT NULL,
    "providerKey" VARCHAR(120) NOT NULL,
    "grade" VARCHAR(120) NOT NULL,
    "comparableValue" DECIMAL(12,4),
    "comparableScale" VARCHAR(120),
    "certificateNo" VARCHAR(160),
    "certificateKey" VARCHAR(160),
    "gradedAt" DATE,
    "verificationUrl" VARCHAR(2048),
    "source" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Grading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Grading_itemId_ownerId_idx" ON "Grading"("itemId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Grading_ownerId_providerKey_certificateKey_key" ON "Grading"("ownerId", "providerKey", "certificateKey");

-- CreateIndex
CREATE UNIQUE INDEX "CollectibleItem_id_ownerId_quantity_key" ON "CollectibleItem"("id", "ownerId", "quantity");

-- AddForeignKey
ALTER TABLE "Grading" ADD CONSTRAINT "Grading_itemId_ownerId_itemQuantity_fkey" FOREIGN KEY ("itemId", "ownerId", "itemQuantity") REFERENCES "CollectibleItem"("id", "ownerId", "quantity") ON DELETE CASCADE ON UPDATE RESTRICT;

-- Current grading belongs to one physical specimen, including under direct SQL writes.
ALTER TABLE "Grading" ADD CONSTRAINT "Grading_single_specimen_check" CHECK ("itemQuantity" = 1);
ALTER TABLE "Grading" ADD CONSTRAINT "Grading_comparable_pair_check" CHECK (
  ("comparableValue" IS NULL AND "comparableScale" IS NULL) OR
  ("comparableValue" IS NOT NULL AND "comparableValue" >= 0 AND "comparableScale" IS NOT NULL AND length(btrim("comparableScale")) > 0)
);
ALTER TABLE "Grading" ADD CONSTRAINT "Grading_certificate_identity_check" CHECK (
  "certificateKey" IS NOT DISTINCT FROM "certificateNo" AND
  ("certificateNo" IS NULL OR length(btrim("certificateNo")) > 0)
);
ALTER TABLE "Grading" ADD CONSTRAINT "Grading_provider_identity_check" CHECK (
  length(btrim(provider)) > 0 AND
  "providerKey" = translate(provider, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')
);
ALTER TABLE "Grading" ADD CONSTRAINT "Grading_grade_nonempty_check" CHECK (length(btrim(grade)) > 0);
