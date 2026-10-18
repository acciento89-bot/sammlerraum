ALTER TABLE "MediaAsset" ADD COLUMN "orphanedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "cleanupStartedAt" TIMESTAMP(3),
  ADD COLUMN "cleanupAttemptAt" TIMESTAMP(3);
UPDATE "MediaAsset" a SET "orphanedAt" = NULL WHERE
  EXISTS (SELECT 1 FROM "MediaLink" WHERE "assetId" = a.id) OR
  EXISTS (SELECT 1 FROM "DocumentLink" WHERE "assetId" = a.id) OR
  EXISTS (SELECT 1 FROM "UserProfile" WHERE "avatarAssetId" = a.id);
CREATE INDEX "MediaAsset_cleanupAttemptAt_orphanedAt_id_idx" ON "MediaAsset"("cleanupAttemptAt", "orphanedAt", "id");
CREATE TABLE "MediaCleanupKey" (
  "storageKey" TEXT PRIMARY KEY,
  "assetId" UUID NOT NULL,
  "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MediaCleanupKey_lastCheckedAt_storageKey_idx" ON "MediaCleanupKey"("lastCheckedAt", "storageKey");
-- Independent of asset/owner rows: these keys deliberately survive metadata deletion.
-- BEFORE locks serialize all reference writers, including item split/cascade and avatar replacement.
CREATE FUNCTION media_reference_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous UUID; following UUID; target UUID;
BEGIN
  IF TG_TABLE_NAME = 'UserProfile' THEN
    IF TG_OP <> 'INSERT' THEN previous := OLD."avatarAssetId"; END IF;
    IF TG_OP <> 'DELETE' THEN following := NEW."avatarAssetId"; END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN previous := OLD."assetId"; END IF;
    IF TG_OP <> 'DELETE' THEN following := NEW."assetId"; END IF;
  END IF;
  FOR target IN SELECT DISTINCT x FROM unnest(ARRAY[previous, following]) x WHERE x IS NOT NULL ORDER BY x LOOP
    PERFORM 1 FROM "MediaAsset" WHERE id = target FOR UPDATE;
    IF target = following AND EXISTS (SELECT 1 FROM "MediaAsset" WHERE id = target AND "cleanupStartedAt" IS NOT NULL) THEN
      RAISE EXCEPTION 'Media asset unavailable' USING ERRCODE = '23503';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE FUNCTION media_reference_retention() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous UUID; following UUID; target UUID;
BEGIN
  IF TG_TABLE_NAME = 'UserProfile' THEN
    IF TG_OP <> 'INSERT' THEN previous := OLD."avatarAssetId"; END IF;
    IF TG_OP <> 'DELETE' THEN following := NEW."avatarAssetId"; END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN previous := OLD."assetId"; END IF;
    IF TG_OP <> 'DELETE' THEN following := NEW."assetId"; END IF;
  END IF;
  FOR target IN SELECT DISTINCT x FROM unnest(ARRAY[previous, following]) x WHERE x IS NOT NULL ORDER BY x LOOP
    UPDATE "MediaAsset" a SET "orphanedAt" = CASE WHEN
      EXISTS (SELECT 1 FROM "MediaLink" WHERE "assetId" = target) OR
      EXISTS (SELECT 1 FROM "DocumentLink" WHERE "assetId" = target) OR
      EXISTS (SELECT 1 FROM "UserProfile" WHERE "avatarAssetId" = target)
      THEN NULL ELSE COALESCE(a."orphanedAt", clock_timestamp()) END
    WHERE a.id = target;
  END LOOP;
  RETURN NULL;
END $$;
CREATE TRIGGER media_link_guard BEFORE INSERT OR UPDATE OR DELETE ON "MediaLink" FOR EACH ROW EXECUTE FUNCTION media_reference_guard();
CREATE TRIGGER media_link_retention AFTER INSERT OR UPDATE OR DELETE ON "MediaLink" FOR EACH ROW EXECUTE FUNCTION media_reference_retention();
CREATE TRIGGER document_link_guard BEFORE INSERT OR UPDATE OR DELETE ON "DocumentLink" FOR EACH ROW EXECUTE FUNCTION media_reference_guard();
CREATE TRIGGER document_link_retention AFTER INSERT OR UPDATE OR DELETE ON "DocumentLink" FOR EACH ROW EXECUTE FUNCTION media_reference_retention();
CREATE TRIGGER avatar_guard BEFORE INSERT OR UPDATE OR DELETE ON "UserProfile" FOR EACH ROW EXECUTE FUNCTION media_reference_guard();
CREATE TRIGGER avatar_retention AFTER INSERT OR UPDATE OR DELETE ON "UserProfile" FOR EACH ROW EXECUTE FUNCTION media_reference_retention();
