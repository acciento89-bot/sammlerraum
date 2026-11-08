-- Existing and future profiles remain opted out until their owner explicitly consents.
ALTER TABLE "UserProfile"
  ADD COLUMN "searchEngineIndexingEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publicLocale" TEXT NOT NULL DEFAULT 'de',
  ADD COLUMN "searchIndexingRevision" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "UserProfile_publicLocale_check" CHECK ("publicLocale" IN ('de', 'en')),
  ADD CONSTRAINT "UserProfile_searchIndexingRevision_check" CHECK ("searchIndexingRevision" >= 0);
CREATE INDEX "UserProfile_indexable_handle_idx" ON "UserProfile" (handle) WHERE "searchEngineIndexingEnabled" = true;
