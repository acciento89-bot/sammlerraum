-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'INTEGER', 'DECIMAL', 'DATE', 'BOOLEAN', 'SINGLE_SELECT', 'MULTI_SELECT', 'URL', 'MONEY');

-- CreateTable
CREATE TABLE "CustomFieldDefinition" (
    "id" UUID NOT NULL,
    "collectionId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldOption" (
    "id" UUID NOT NULL,
    "fieldDefinitionId" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "CustomFieldOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldValue" (
    "itemId" UUID NOT NULL,
    "fieldDefinitionId" UUID NOT NULL,
    "collectionId" UUID NOT NULL,
    "fieldType" "CustomFieldType" NOT NULL,
    "shortTextValue" VARCHAR(255),
    "longTextValue" TEXT,
    "integerValue" BIGINT,
    "decimalValue" DECIMAL(38,18),
    "dateValue" DATE,
    "booleanValue" BOOLEAN,
    "singleSelectOptionId" UUID,
    "urlValue" VARCHAR(2048),
    "moneyAmountMinor" BIGINT,
    "moneyCurrency" CHAR(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("itemId","fieldDefinitionId")
);

-- CreateTable
CREATE TABLE "CustomFieldMultiSelectValue" (
    "itemId" UUID NOT NULL,
    "fieldDefinitionId" UUID NOT NULL,
    "optionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "CustomFieldMultiSelectValue_pkey" PRIMARY KEY ("itemId","fieldDefinitionId","optionId")
);

-- AddCheckConstraints
ALTER TABLE "CustomFieldDefinition"
  ADD CONSTRAINT "CustomFieldDefinition_name_check" CHECK (char_length("name") BETWEEN 1 AND 120),
  ADD CONSTRAINT "CustomFieldDefinition_normalizedName_check" CHECK (char_length("normalizedName") BETWEEN 1 AND 120);

ALTER TABLE "CustomFieldOption"
  ADD CONSTRAINT "CustomFieldOption_value_check" CHECK (char_length("value") BETWEEN 1 AND 200),
  ADD CONSTRAINT "CustomFieldOption_normalizedValue_check" CHECK (char_length("normalizedValue") BETWEEN 1 AND 200),
  ADD CONSTRAINT "CustomFieldOption_position_check" CHECK ("position" >= 0);

ALTER TABLE "CustomFieldValue"
  ADD CONSTRAINT "CustomFieldValue_shortText_check" CHECK (
    "shortTextValue" IS NULL OR char_length("shortTextValue") BETWEEN 1 AND 255
  ),
  ADD CONSTRAINT "CustomFieldValue_longText_check" CHECK (
    "longTextValue" IS NULL OR char_length("longTextValue") BETWEEN 1 AND 10000
  ),
  ADD CONSTRAINT "CustomFieldValue_url_check" CHECK (
    "urlValue" IS NULL OR "urlValue" ~ '^https?://'
  ),
  ADD CONSTRAINT "CustomFieldValue_integer_check" CHECK (
    "integerValue" IS NULL OR "integerValue" BETWEEN -9007199254740991 AND 9007199254740991
  ),
  ADD CONSTRAINT "CustomFieldValue_moneyAmountMinor_check" CHECK (
    "moneyAmountMinor" IS NULL OR "moneyAmountMinor" BETWEEN 0 AND 9007199254740991
  ),
  ADD CONSTRAINT "CustomFieldValue_moneyCurrency_check" CHECK (
    "moneyCurrency" IS NULL OR "moneyCurrency" ~ '^[A-Z]{3}$'
  ),
  ADD CONSTRAINT "CustomFieldValue_typedShape_check" CHECK (
    ("fieldType" = 'SHORT_TEXT' AND "shortTextValue" IS NOT NULL AND "longTextValue" IS NULL AND "integerValue" IS NULL AND "decimalValue" IS NULL AND "dateValue" IS NULL AND "booleanValue" IS NULL AND "singleSelectOptionId" IS NULL AND "urlValue" IS NULL AND "moneyAmountMinor" IS NULL AND "moneyCurrency" IS NULL) OR
    ("fieldType" = 'LONG_TEXT' AND "shortTextValue" IS NULL AND "longTextValue" IS NOT NULL AND "integerValue" IS NULL AND "decimalValue" IS NULL AND "dateValue" IS NULL AND "booleanValue" IS NULL AND "singleSelectOptionId" IS NULL AND "urlValue" IS NULL AND "moneyAmountMinor" IS NULL AND "moneyCurrency" IS NULL) OR
    ("fieldType" = 'INTEGER' AND "shortTextValue" IS NULL AND "longTextValue" IS NULL AND "integerValue" IS NOT NULL AND "decimalValue" IS NULL AND "dateValue" IS NULL AND "booleanValue" IS NULL AND "singleSelectOptionId" IS NULL AND "urlValue" IS NULL AND "moneyAmountMinor" IS NULL AND "moneyCurrency" IS NULL) OR
    ("fieldType" = 'DECIMAL' AND "shortTextValue" IS NULL AND "longTextValue" IS NULL AND "integerValue" IS NULL AND "decimalValue" IS NOT NULL AND "dateValue" IS NULL AND "booleanValue" IS NULL AND "singleSelectOptionId" IS NULL AND "urlValue" IS NULL AND "moneyAmountMinor" IS NULL AND "moneyCurrency" IS NULL) OR
    ("fieldType" = 'DATE' AND "shortTextValue" IS NULL AND "longTextValue" IS NULL AND "integerValue" IS NULL AND "decimalValue" IS NULL AND "dateValue" IS NOT NULL AND "booleanValue" IS NULL AND "singleSelectOptionId" IS NULL AND "urlValue" IS NULL AND "moneyAmountMinor" IS NULL AND "moneyCurrency" IS NULL) OR
    ("fieldType" = 'BOOLEAN' AND "shortTextValue" IS NULL AND "longTextValue" IS NULL AND "integerValue" IS NULL AND "decimalValue" IS NULL AND "dateValue" IS NULL AND "booleanValue" IS NOT NULL AND "singleSelectOptionId" IS NULL AND "urlValue" IS NULL AND "moneyAmountMinor" IS NULL AND "moneyCurrency" IS NULL) OR
    ("fieldType" = 'SINGLE_SELECT' AND "shortTextValue" IS NULL AND "longTextValue" IS NULL AND "integerValue" IS NULL AND "decimalValue" IS NULL AND "dateValue" IS NULL AND "booleanValue" IS NULL AND "singleSelectOptionId" IS NOT NULL AND "urlValue" IS NULL AND "moneyAmountMinor" IS NULL AND "moneyCurrency" IS NULL) OR
    ("fieldType" = 'MULTI_SELECT' AND "shortTextValue" IS NULL AND "longTextValue" IS NULL AND "integerValue" IS NULL AND "decimalValue" IS NULL AND "dateValue" IS NULL AND "booleanValue" IS NULL AND "singleSelectOptionId" IS NULL AND "urlValue" IS NULL AND "moneyAmountMinor" IS NULL AND "moneyCurrency" IS NULL) OR
    ("fieldType" = 'URL' AND "shortTextValue" IS NULL AND "longTextValue" IS NULL AND "integerValue" IS NULL AND "decimalValue" IS NULL AND "dateValue" IS NULL AND "booleanValue" IS NULL AND "singleSelectOptionId" IS NULL AND "urlValue" IS NOT NULL AND "moneyAmountMinor" IS NULL AND "moneyCurrency" IS NULL) OR
    ("fieldType" = 'MONEY' AND "shortTextValue" IS NULL AND "longTextValue" IS NULL AND "integerValue" IS NULL AND "decimalValue" IS NULL AND "dateValue" IS NULL AND "booleanValue" IS NULL AND "singleSelectOptionId" IS NULL AND "urlValue" IS NULL AND "moneyAmountMinor" IS NOT NULL AND "moneyCurrency" IS NOT NULL)
  );

ALTER TABLE "CustomFieldMultiSelectValue"
  ADD CONSTRAINT "CustomFieldMultiSelectValue_position_check" CHECK ("position" >= 0);

-- CreateIndex
CREATE INDEX "CustomFieldDefinition_collectionId_idx" ON "CustomFieldDefinition"("collectionId");
CREATE UNIQUE INDEX "CustomFieldDefinition_collectionId_normalizedName_key" ON "CustomFieldDefinition"("collectionId", "normalizedName");
CREATE UNIQUE INDEX "CustomFieldDefinition_id_collectionId_key" ON "CustomFieldDefinition"("id", "collectionId");
CREATE UNIQUE INDEX "CustomFieldDefinition_id_collectionId_type_key" ON "CustomFieldDefinition"("id", "collectionId", "type");
CREATE INDEX "CustomFieldOption_fieldDefinitionId_idx" ON "CustomFieldOption"("fieldDefinitionId");
CREATE UNIQUE INDEX "CustomFieldOption_fieldDefinitionId_normalizedValue_key" ON "CustomFieldOption"("fieldDefinitionId", "normalizedValue");
CREATE UNIQUE INDEX "CustomFieldOption_fieldDefinitionId_position_key" ON "CustomFieldOption"("fieldDefinitionId", "position");
CREATE UNIQUE INDEX "CustomFieldOption_id_fieldDefinitionId_key" ON "CustomFieldOption"("id", "fieldDefinitionId");
CREATE INDEX "CustomFieldValue_fieldDefinitionId_collectionId_fieldType_idx" ON "CustomFieldValue"("fieldDefinitionId", "collectionId", "fieldType");
CREATE INDEX "CustomFieldValue_singleSelectOptionId_fieldDefinitionId_idx" ON "CustomFieldValue"("singleSelectOptionId", "fieldDefinitionId");
CREATE INDEX "CustomFieldMultiSelectValue_optionId_fieldDefinitionId_idx" ON "CustomFieldMultiSelectValue"("optionId", "fieldDefinitionId");
CREATE UNIQUE INDEX "CustomFieldMultiSelectValue_itemId_fieldDefinitionId_positi_key" ON "CustomFieldMultiSelectValue"("itemId", "fieldDefinitionId", "position");
CREATE UNIQUE INDEX "CollectibleItem_id_collectionId_key" ON "CollectibleItem"("id", "collectionId");

-- AddForeignKey
ALTER TABLE "CustomFieldDefinition" ADD CONSTRAINT "CustomFieldDefinition_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomFieldOption" ADD CONSTRAINT "CustomFieldOption_fieldDefinitionId_fkey" FOREIGN KEY ("fieldDefinitionId") REFERENCES "CustomFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_itemId_collectionId_fkey" FOREIGN KEY ("itemId", "collectionId") REFERENCES "CollectibleItem"("id", "collectionId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_fieldDefinitionId_collectionId_fieldType_fkey" FOREIGN KEY ("fieldDefinitionId", "collectionId", "fieldType") REFERENCES "CustomFieldDefinition"("id", "collectionId", "type") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_singleSelectOptionId_fieldDefinitionId_fkey" FOREIGN KEY ("singleSelectOptionId", "fieldDefinitionId") REFERENCES "CustomFieldOption"("id", "fieldDefinitionId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomFieldMultiSelectValue" ADD CONSTRAINT "CustomFieldMultiSelectValue_itemId_fieldDefinitionId_fkey" FOREIGN KEY ("itemId", "fieldDefinitionId") REFERENCES "CustomFieldValue"("itemId", "fieldDefinitionId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomFieldMultiSelectValue" ADD CONSTRAINT "CustomFieldMultiSelectValue_optionId_fieldDefinitionId_fkey" FOREIGN KEY ("optionId", "fieldDefinitionId") REFERENCES "CustomFieldOption"("id", "fieldDefinitionId") ON DELETE CASCADE ON UPDATE CASCADE;
