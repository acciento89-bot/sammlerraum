-- Link owner follows its asset; the item owner changes only at the final parent transition.
ALTER TABLE "MediaLink" DROP CONSTRAINT "MediaLink_itemId_ownerId_fkey";
ALTER TABLE "MediaLink" ADD CONSTRAINT "MediaLink_itemId_ownerId_fkey"
 FOREIGN KEY ("itemId","ownerId") REFERENCES "CollectibleItem"(id,"ownerId")
 ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "DocumentLink" DROP CONSTRAINT "DocumentLink_itemId_ownerId_fkey";
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_itemId_ownerId_fkey"
 FOREIGN KEY ("itemId","ownerId") REFERENCES "CollectibleItem"(id,"ownerId")
 ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE FUNCTION media_ownership_transition_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE authorized boolean;
BEGIN
 IF NEW."ownerId" IS NOT DISTINCT FROM OLD."ownerId" THEN RETURN NEW; END IF;
 IF OLD.status::text<>'READY' OR OLD."cleanupStartedAt" IS NOT NULL OR
    OLD."processingToken" IS NOT NULL OR OLD."processingLeaseUntil" IS NOT NULL OR
    (to_jsonb(NEW)-'ownerId') IS DISTINCT FROM (to_jsonb(OLD)-'ownerId') THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Ownership transition preserves only completed private media';
 END IF;
 EXECUTE format($sql$
   SELECT EXISTS(SELECT 1 FROM %1$I."CollectionOwnershipTransfer" receipt
    WHERE receipt."fromOwnerId"=$2 AND receipt."toOwnerId"=$3 AND receipt."transactionId"=pg_current_xact_id()::text
    AND (EXISTS(SELECT 1 FROM %1$I."MediaLink" link JOIN %1$I."CollectibleItem" item ON item.id=link."itemId" WHERE link."assetId"=$1 AND item."collectionId"=receipt."collectionId")
      OR EXISTS(SELECT 1 FROM %1$I."DocumentLink" link JOIN %1$I."CollectibleItem" item ON item.id=link."itemId" WHERE link."assetId"=$1 AND item."collectionId"=receipt."collectionId"))
    AND NOT EXISTS(SELECT 1 FROM %1$I."MediaLink" link JOIN %1$I."CollectibleItem" item ON item.id=link."itemId" WHERE link."assetId"=$1 AND item."collectionId"<>receipt."collectionId")
    AND NOT EXISTS(SELECT 1 FROM %1$I."DocumentLink" link JOIN %1$I."CollectibleItem" item ON item.id=link."itemId" WHERE link."assetId"=$1 AND item."collectionId"<>receipt."collectionId")
    AND NOT EXISTS(SELECT 1 FROM %1$I."UserProfile" WHERE "avatarAssetId"=$1)
    AND NOT EXISTS(SELECT 1 FROM %1$I."ExportJob" WHERE "artifactId"=$1)
    AND NOT EXISTS(SELECT 1 FROM %1$I."ReportJob" WHERE "artifactId"=$1))
 $sql$,TG_TABLE_SCHEMA) INTO authorized USING OLD.id,OLD."ownerId",NEW."ownerId";
 IF NOT authorized THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Private media requires a current exclusive collection transfer';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER media_ownership_transition_guard BEFORE UPDATE ON "MediaAsset"
 FOR EACH ROW EXECUTE FUNCTION media_ownership_transition_guard();
