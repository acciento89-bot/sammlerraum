-- Physical locations remain personal; transfers clone the required hierarchy with new QR identities.
ALTER TABLE "CollectibleItem" DROP CONSTRAINT "CollectibleItem_storageLocationId_ownerId_fkey";
ALTER TABLE "CollectibleItem" ADD CONSTRAINT "CollectibleItem_storageLocationId_ownerId_fkey"
 FOREIGN KEY ("storageLocationId","ownerId") REFERENCES "StorageLocation"(id,"ownerId")
 ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "ItemLocationHistory" DROP CONSTRAINT "ItemLocationHistory_itemId_ownerId_fkey";
ALTER TABLE "ItemLocationHistory" ADD CONSTRAINT "ItemLocationHistory_itemId_ownerId_fkey"
 FOREIGN KEY ("itemId","ownerId") REFERENCES "CollectibleItem"(id,"ownerId")
 ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "ItemLocationHistory" ALTER COLUMN "assignedById" DROP NOT NULL;
ALTER TABLE "ItemLocationHistory" DROP CONSTRAINT "ItemLocationHistory_assignedById_fkey";
ALTER TABLE "ItemLocationHistory" ADD CONSTRAINT "ItemLocationHistory_assignedById_fkey"
 FOREIGN KEY ("assignedById") REFERENCES "user"(id) ON DELETE SET NULL ON UPDATE RESTRICT;
CREATE FUNCTION location_history_insert_author_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW."assignedById" IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='A new location assignment requires its actual author'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER location_history_insert_author_guard BEFORE INSERT ON "ItemLocationHistory"
 FOR EACH ROW EXECUTE FUNCTION location_history_insert_author_guard();
CREATE FUNCTION location_history_transition_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE collection_id uuid; authorized boolean;
BEGIN
 IF NEW."ownerId" IS DISTINCT FROM OLD."ownerId"
    AND ROW(NEW.id,NEW."itemId",NEW."assignedById",NEW."movedAt") IS NOT DISTINCT FROM ROW(OLD.id,OLD."itemId",OLD."assignedById",OLD."movedAt")
    AND (NEW."fromLocationId" IS NULL)=(OLD."fromLocationId" IS NULL)
    AND (NEW."toLocationId" IS NULL)=(OLD."toLocationId" IS NULL) THEN
   EXECUTE format('SELECT "collectionId" FROM %I."CollectibleItem" WHERE id=$1',TG_TABLE_SCHEMA) INTO collection_id USING OLD."itemId";
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."CollectionOwnershipTransfer" WHERE "collectionId"=$1 AND "fromOwnerId"=$2 AND "toOwnerId"=$3 AND "transactionId"=pg_current_xact_id()::text)',TG_TABLE_SCHEMA)
     INTO authorized USING collection_id,OLD."ownerId",NEW."ownerId";
   IF authorized THEN RETURN NEW; END IF;
 ELSIF OLD."assignedById" IS NOT NULL AND NEW."assignedById" IS NULL
    AND (to_jsonb(NEW)-'assignedById') IS NOT DISTINCT FROM (to_jsonb(OLD)-'assignedById') THEN
   EXECUTE format('SELECT NOT EXISTS(SELECT 1 FROM %I."user" WHERE id=$1)',TG_TABLE_SCHEMA) INTO authorized USING OLD."assignedById";
   IF authorized THEN RETURN NEW; END IF;
 END IF;
 RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Location history facts are immutable';
END $$;
CREATE TRIGGER location_history_transition_guard BEFORE UPDATE ON "ItemLocationHistory"
 FOR EACH ROW EXECUTE FUNCTION location_history_transition_guard();
