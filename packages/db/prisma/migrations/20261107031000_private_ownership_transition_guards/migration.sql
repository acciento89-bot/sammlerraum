-- Keep the original insurance identity rule. Only the same complete, confirmed ownership
-- transition may change owner identity, with values unchanged and a fresh revision.
ALTER TABLE "InsuranceRecord" DROP CONSTRAINT "InsuranceRecord_collectionId_ownerId_fkey", DROP CONSTRAINT "InsuranceRecord_itemId_ownerId_fkey";
ALTER TABLE "InsuranceRecord" ADD CONSTRAINT "InsuranceRecord_collectionId_ownerId_fkey" FOREIGN KEY("collectionId","ownerId") REFERENCES "Collection"(id,"ownerId") ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "InsuranceRecord" ADD CONSTRAINT "InsuranceRecord_itemId_ownerId_fkey" FOREIGN KEY("itemId","ownerId") REFERENCES "CollectibleItem"(id,"ownerId") ON DELETE CASCADE ON UPDATE NO ACTION DEFERRABLE INITIALLY IMMEDIATE;
CREATE OR REPLACE FUNCTION insurance_record_revision_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE collection_id uuid; authorized boolean;
BEGIN
 IF NEW.revision::bigint<>OLD.revision::bigint+1 OR ROW(NEW.id,NEW."collectionId",NEW."itemId",NEW.basis,NEW."createdAt") IS DISTINCT FROM ROW(OLD.id,OLD."collectionId",OLD."itemId",OLD.basis,OLD."createdAt") THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Private insurance identity and revision are guarded'; END IF;
 IF NEW."ownerId" IS DISTINCT FROM OLD."ownerId" THEN
   IF (to_jsonb(NEW)-ARRAY['ownerId','revision','updatedAt']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['ownerId','revision','updatedAt']) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Ownership transition must preserve insurance values'; END IF;
   collection_id:=OLD."collectionId";
   IF collection_id IS NULL THEN EXECUTE format('SELECT "collectionId" FROM %I."CollectibleItem" WHERE id=$1',TG_TABLE_SCHEMA) INTO collection_id USING OLD."itemId"; END IF;
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."CollectionOwnershipTransfer" WHERE "collectionId"=$1 AND "fromOwnerId"=$2 AND "toOwnerId"=$3 AND "transactionId"=pg_current_xact_id()::text)',TG_TABLE_SCHEMA) INTO authorized USING collection_id,OLD."ownerId",NEW."ownerId";
   IF NOT authorized THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Insurance owner requires a current complete ownership transition'; END IF;
 END IF;
 RETURN NEW;
END $$;
-- An immutable receipt is a completed fact, not a durable unfulfilled intent.
CREATE UNIQUE INDEX "CollectionOwnershipTransfer_collectionId_transactionId_key" ON "CollectionOwnershipTransfer"("collectionId","transactionId");
CREATE FUNCTION collection_transfer_completion_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE alive boolean; complete boolean;
BEGIN
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."CollectionOwnershipTransfer" WHERE id=$1)',TG_TABLE_SCHEMA) INTO alive USING NEW.id;
 IF NOT alive THEN RETURN NULL; END IF;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."Collection" WHERE id=$1 AND "ownerId"=$2 AND "collaborationRevision">=$3)',TG_TABLE_SCHEMA) INTO complete USING NEW."collectionId",NEW."toOwnerId",NEW."toRevision";
 IF NOT complete THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Ownership transition must actually complete in the same transaction'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER collection_transfer_completion_guard AFTER INSERT ON "CollectionOwnershipTransfer" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION collection_transfer_completion_guard();
