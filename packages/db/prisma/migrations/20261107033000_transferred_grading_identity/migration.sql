-- A certificate remains bound to one physical specimen while its collection changes owner.
ALTER TABLE "Grading" DROP CONSTRAINT "Grading_itemId_ownerId_itemQuantity_fkey";
ALTER TABLE "Grading" ADD CONSTRAINT "Grading_itemId_ownerId_itemQuantity_fkey"
 FOREIGN KEY ("itemId","ownerId","itemQuantity") REFERENCES "CollectibleItem"(id,"ownerId",quantity)
 ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE FUNCTION grading_ownership_transition_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE collection_id uuid; authorized boolean;
BEGIN
 IF ROW(NEW.id,NEW."itemId",NEW."itemQuantity",NEW."createdAt") IS DISTINCT FROM
    ROW(OLD.id,OLD."itemId",OLD."itemQuantity",OLD."createdAt") THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Certificate specimen identity is immutable';
 END IF;
 IF NEW."ownerId" IS DISTINCT FROM OLD."ownerId" THEN
   IF (to_jsonb(NEW)-'ownerId') IS DISTINCT FROM (to_jsonb(OLD)-'ownerId') THEN
     RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Ownership transition preserves certificate facts';
   END IF;
   EXECUTE format('SELECT "collectionId" FROM %I."CollectibleItem" WHERE id=$1',TG_TABLE_SCHEMA)
     INTO collection_id USING OLD."itemId";
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."CollectionOwnershipTransfer" WHERE "collectionId"=$1 AND "fromOwnerId"=$2 AND "toOwnerId"=$3 AND "transactionId"=pg_current_xact_id()::text)',TG_TABLE_SCHEMA)
     INTO authorized USING collection_id,OLD."ownerId",NEW."ownerId";
   IF NOT authorized THEN
     RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Certificate owner requires a current complete ownership transition';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER grading_ownership_transition_guard BEFORE UPDATE ON "Grading"
 FOR EACH ROW EXECUTE FUNCTION grading_ownership_transition_guard();
