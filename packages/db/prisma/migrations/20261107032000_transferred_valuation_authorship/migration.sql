-- Preserve immutable financial facts and their real author across explicit ownership transfer.
-- A transferred historic estimate is never relabeled as authored by the new owner.
ALTER TABLE "Valuation" ADD COLUMN "ownershipTransferred" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Valuation" ALTER COLUMN "actorUserId" DROP NOT NULL;
ALTER TABLE "Valuation" DROP CONSTRAINT "Valuation_itemId_ownerId_fkey", DROP CONSTRAINT "Valuation_actorUserId_fkey", DROP CONSTRAINT "Valuation_owner_actor_check";
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_itemId_ownerId_fkey" FOREIGN KEY("itemId","ownerId") REFERENCES "CollectibleItem"(id,"ownerId") ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_actorUserId_fkey" FOREIGN KEY("actorUserId") REFERENCES "user"(id) ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_owner_actor_check" CHECK("actorUserId" IS NULL OR "actorUserId"="ownerId" OR "ownershipTransferred");
CREATE FUNCTION valuation_insert_author_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW."actorUserId" IS NULL OR NEW."actorUserId" IS DISTINCT FROM NEW."ownerId" OR NEW."ownershipTransferred" IS DISTINCT FROM false THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='New manual valuation requires its actual owner author'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER valuation_insert_author_guard BEFORE INSERT ON "Valuation" FOR EACH ROW EXECUTE FUNCTION valuation_insert_author_guard();
CREATE OR REPLACE FUNCTION reject_valuation_update() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE collection_id uuid; valid boolean;
BEGIN
 IF NEW."ownerId" IS DISTINCT FROM OLD."ownerId" AND NEW."ownershipTransferred" AND (to_jsonb(NEW)-ARRAY['ownerId','ownershipTransferred']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['ownerId','ownershipTransferred']) THEN
   EXECUTE format('SELECT "collectionId" FROM %I."CollectibleItem" WHERE id=$1',TG_TABLE_SCHEMA) INTO collection_id USING OLD."itemId";
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."CollectionOwnershipTransfer" WHERE "collectionId"=$1 AND "fromOwnerId"=$2 AND "toOwnerId"=$3 AND "transactionId"=pg_current_xact_id()::text)',TG_TABLE_SCHEMA) INTO valid USING collection_id,OLD."ownerId",NEW."ownerId";
   IF valid THEN RETURN NEW; END IF;
 ELSIF OLD."actorUserId" IS NOT NULL AND NEW."actorUserId" IS NULL AND (to_jsonb(NEW)-ARRAY['actorUserId','note']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['actorUserId','note']) THEN
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."user" WHERE id=$1)',TG_TABLE_SCHEMA) INTO valid USING OLD."actorUserId";
   IF NOT valid THEN NEW.note:=NULL; RETURN NEW; END IF;
 END IF;
 RAISE EXCEPTION 'Valuation history is append-only' USING ERRCODE='23514';
END $$;
