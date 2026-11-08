-- CreateTable
CREATE TABLE "CatalogEntry" (
    "id" UUID NOT NULL,
    "categoryTemplateId" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "authored" JSONB NOT NULL,

    CONSTRAINT "CatalogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogVariant" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "authored" JSONB NOT NULL,

    CONSTRAINT "CatalogVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogExternalIdentifier" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "variantId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "namespace" VARCHAR(64) NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "value" VARCHAR(500) NOT NULL,
    "sources" JSONB NOT NULL,

    CONSTRAINT "CatalogExternalIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogAttributeValue" (
    "id" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "categoryTemplateId" UUID NOT NULL,
    "variantId" UUID,
    "targetKey" VARCHAR(36) NOT NULL,
    "definitionId" UUID NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "CatalogAttributeValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogRevision" (
    "entryId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "rollbackFromRevision" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogRevision_pkey" PRIMARY KEY ("entryId","revision")
);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogEntry_id_categoryTemplateId_key" ON "CatalogEntry"("id", "categoryTemplateId");

-- CreateIndex
CREATE INDEX "CatalogVariant_entryId_active_idx" ON "CatalogVariant"("entryId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogVariant_id_entryId_key" ON "CatalogVariant"("id", "entryId");

-- CreateIndex
CREATE INDEX "CatalogExternalIdentifier_entryId_active_idx" ON "CatalogExternalIdentifier"("entryId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogAttributeValue_entryId_targetKey_definitionId_key" ON "CatalogAttributeValue"("entryId", "targetKey", "definitionId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogAttributeDefinition_id_categoryTemplateId_key" ON "CatalogAttributeDefinition"("id", "categoryTemplateId");

-- AddForeignKey
ALTER TABLE "CatalogEntry" ADD CONSTRAINT "CatalogEntry_categoryTemplateId_fkey" FOREIGN KEY ("categoryTemplateId") REFERENCES "CategoryTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogVariant" ADD CONSTRAINT "CatalogVariant_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CatalogEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogExternalIdentifier" ADD CONSTRAINT "CatalogExternalIdentifier_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CatalogEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogExternalIdentifier" ADD CONSTRAINT "CatalogExternalIdentifier_variantId_entryId_fkey" FOREIGN KEY ("variantId", "entryId") REFERENCES "CatalogVariant"("id", "entryId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogAttributeValue" ADD CONSTRAINT "CatalogAttributeValue_entryId_categoryTemplateId_fkey" FOREIGN KEY ("entryId", "categoryTemplateId") REFERENCES "CatalogEntry"("id", "categoryTemplateId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogAttributeValue" ADD CONSTRAINT "CatalogAttributeValue_variantId_entryId_fkey" FOREIGN KEY ("variantId", "entryId") REFERENCES "CatalogVariant"("id", "entryId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogAttributeValue" ADD CONSTRAINT "CatalogAttributeValue_definitionId_categoryTemplateId_fkey" FOREIGN KEY ("definitionId", "categoryTemplateId") REFERENCES "CatalogAttributeDefinition"("id", "categoryTemplateId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogRevision" ADD CONSTRAINT "CatalogRevision_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CatalogEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

