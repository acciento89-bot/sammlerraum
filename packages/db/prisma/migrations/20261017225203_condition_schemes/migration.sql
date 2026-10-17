-- AlterTable
ALTER TABLE "CollectibleItem" ADD COLUMN     "categoryTemplateId" UUID,
ADD COLUMN     "conditionOptionId" UUID;

-- CreateTable
CREATE TABLE "ConditionScheme" (
    "id" UUID NOT NULL,
    "categoryTemplateId" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "labelDe" VARCHAR(200) NOT NULL,
    "labelEn" VARCHAR(200) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ConditionScheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConditionOption" (
    "id" UUID NOT NULL,
    "schemeId" UUID NOT NULL,
    "categoryTemplateId" UUID NOT NULL,
    "labelKey" VARCHAR(128) NOT NULL,
    "labelDe" VARCHAR(200) NOT NULL,
    "labelEn" VARCHAR(200) NOT NULL,
    "normalizedBand" INTEGER,
    "position" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ConditionOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConditionScheme_categoryTemplateId_key" ON "ConditionScheme"("categoryTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "ConditionScheme_key_key" ON "ConditionScheme"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ConditionScheme_id_categoryTemplateId_key" ON "ConditionScheme"("id", "categoryTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "ConditionOption_id_categoryTemplateId_key" ON "ConditionOption"("id", "categoryTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "ConditionOption_schemeId_labelKey_key" ON "ConditionOption"("schemeId", "labelKey");

-- CreateIndex
CREATE UNIQUE INDEX "ConditionOption_schemeId_position_key" ON "ConditionOption"("schemeId", "position");

-- CreateIndex
CREATE INDEX "CollectibleItem_categoryTemplateId_idx" ON "CollectibleItem"("categoryTemplateId");

-- CreateIndex
CREATE INDEX "CollectibleItem_conditionOptionId_categoryTemplateId_idx" ON "CollectibleItem"("conditionOptionId", "categoryTemplateId");

-- AddForeignKey
ALTER TABLE "CollectibleItem" ADD CONSTRAINT "CollectibleItem_categoryTemplateId_fkey" FOREIGN KEY ("categoryTemplateId") REFERENCES "CategoryTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectibleItem" ADD CONSTRAINT "CollectibleItem_conditionOptionId_categoryTemplateId_fkey" FOREIGN KEY ("conditionOptionId", "categoryTemplateId") REFERENCES "ConditionOption"("id", "categoryTemplateId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConditionScheme" ADD CONSTRAINT "ConditionScheme_categoryTemplateId_fkey" FOREIGN KEY ("categoryTemplateId") REFERENCES "CategoryTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConditionOption" ADD CONSTRAINT "ConditionOption_schemeId_categoryTemplateId_fkey" FOREIGN KEY ("schemeId", "categoryTemplateId") REFERENCES "ConditionScheme"("id", "categoryTemplateId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- MATCH SIMPLE on the nullable composite FK must not permit an option without category.
ALTER TABLE "CollectibleItem" ADD CONSTRAINT "item_condition_requires_category"
CHECK ("conditionOptionId" IS NULL OR "categoryTemplateId" IS NOT NULL);
ALTER TABLE "ConditionOption" ADD CONSTRAINT "condition_band_range"
CHECK ("normalizedBand" IS NULL OR "normalizedBand" BETWEEN 1 AND 5);
ALTER TABLE "ConditionOption" ADD CONSTRAINT "condition_option_position_range"
CHECK ("position" BETWEEN 0 AND 99);

-- Active/order changes remain possible. Semantic corrections append a new identity.
-- Native RESTRICT FKs retain selected definitions; unused fixtures remain deletable.
CREATE FUNCTION "guard_condition_scheme_semantics"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."id", NEW."categoryTemplateId", NEW."key", NEW."labelDe", NEW."labelEn")
     IS DISTINCT FROM ROW(OLD."id", OLD."categoryTemplateId", OLD."key", OLD."labelDe", OLD."labelEn") THEN
    RAISE EXCEPTION 'condition scheme semantics are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "condition_scheme_semantics_immutable" BEFORE UPDATE ON "ConditionScheme"
FOR EACH ROW EXECUTE FUNCTION "guard_condition_scheme_semantics"();
CREATE FUNCTION "guard_condition_option_semantics"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."id", NEW."schemeId", NEW."categoryTemplateId", NEW."labelKey", NEW."labelDe", NEW."labelEn", NEW."normalizedBand")
     IS DISTINCT FROM ROW(OLD."id", OLD."schemeId", OLD."categoryTemplateId", OLD."labelKey", OLD."labelDe", OLD."labelEn", OLD."normalizedBand") THEN
    RAISE EXCEPTION 'condition option semantics are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "condition_option_semantics_immutable" BEFORE UPDATE ON "ConditionOption"
FOR EACH ROW EXECUTE FUNCTION "guard_condition_option_semantics"();
