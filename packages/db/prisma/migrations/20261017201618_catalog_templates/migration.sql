-- CreateTable
CREATE TABLE "CategoryTemplate" (
    "id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryTemplateLabel" (
    "categoryTemplateId" UUID NOT NULL,
    "locale" VARCHAR(2) NOT NULL,
    "label" VARCHAR(200) NOT NULL,

    CONSTRAINT "CategoryTemplateLabel_pkey" PRIMARY KEY ("categoryTemplateId","locale")
);

-- CreateTable
CREATE TABLE "CatalogAttributeDefinition" (
    "id" UUID NOT NULL,
    "categoryTemplateId" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "CatalogAttributeDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogAttributeLabel" (
    "definitionId" UUID NOT NULL,
    "locale" VARCHAR(2) NOT NULL,
    "label" VARCHAR(200) NOT NULL,

    CONSTRAINT "CatalogAttributeLabel_pkey" PRIMARY KEY ("definitionId","locale")
);

-- CreateTable
CREATE TABLE "CatalogAttributeOption" (
    "id" UUID NOT NULL,
    "definitionId" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "CatalogAttributeOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogAttributeOptionLabel" (
    "optionId" UUID NOT NULL,
    "locale" VARCHAR(2) NOT NULL,
    "label" VARCHAR(200) NOT NULL,

    CONSTRAINT "CatalogAttributeOptionLabel_pkey" PRIMARY KEY ("optionId","locale")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoryTemplate_key_key" ON "CategoryTemplate"("key");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogAttributeDefinition_categoryTemplateId_key_key" ON "CatalogAttributeDefinition"("categoryTemplateId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogAttributeDefinition_categoryTemplateId_position_key" ON "CatalogAttributeDefinition"("categoryTemplateId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogAttributeOption_definitionId_key_key" ON "CatalogAttributeOption"("definitionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogAttributeOption_definitionId_position_key" ON "CatalogAttributeOption"("definitionId", "position");

-- AddForeignKey
ALTER TABLE "CategoryTemplateLabel" ADD CONSTRAINT "CategoryTemplateLabel_categoryTemplateId_fkey" FOREIGN KEY ("categoryTemplateId") REFERENCES "CategoryTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogAttributeDefinition" ADD CONSTRAINT "CatalogAttributeDefinition_categoryTemplateId_fkey" FOREIGN KEY ("categoryTemplateId") REFERENCES "CategoryTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogAttributeLabel" ADD CONSTRAINT "CatalogAttributeLabel_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CatalogAttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogAttributeOption" ADD CONSTRAINT "CatalogAttributeOption_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CatalogAttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogAttributeOptionLabel" ADD CONSTRAINT "CatalogAttributeOptionLabel_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "CatalogAttributeOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
