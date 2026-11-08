CREATE TABLE "SmartCollection" (
 "id" UUID NOT NULL,
 "ownerId" TEXT NOT NULL,
 "name" VARCHAR(100) NOT NULL,
 "filterVersion" INTEGER NOT NULL DEFAULT 1,
 "definition" JSONB NOT NULL,
 "revision" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 "deletedAt" TIMESTAMP(3),
 CONSTRAINT "SmartCollection_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "SmartCollection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "SmartCollection_version_check" CHECK ("filterVersion" = 1),
 CONSTRAINT "SmartCollection_revision_check" CHECK ("revision" BETWEEN 1 AND 2147483647),
 CONSTRAINT "SmartCollection_definition_check" CHECK (
  jsonb_typeof("definition") = 'object' AND
  "definition" ?& ARRAY['version','text','filter','lifecycle'] AND
  "definition"->'version' = '1'::jsonb AND
  jsonb_typeof("definition"->'text') = 'string' AND
  jsonb_typeof("definition"->'filter') IN ('object','null') AND
  "definition"->>'lifecycle' IN ('ACTIVE','ARCHIVED','DISPOSED','ALL') AND
  octet_length("definition"::text) <= 32768
 )
);
CREATE INDEX "SmartCollection_ownerId_deletedAt_createdAt_id_idx" ON "SmartCollection"("ownerId", "deletedAt", "createdAt" DESC, "id" DESC);
