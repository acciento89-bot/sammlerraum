CREATE TYPE "CollectionMemberRole" AS ENUM ('ADMIN','EDITOR','VIEWER');
ALTER TABLE "Collection" ADD COLUMN "collaborationRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_collaborationRevision_check" CHECK ("collaborationRevision" BETWEEN 0 AND 2147483647);
CREATE TABLE "CollectionMember" (
 "collectionId" UUID NOT NULL,"userId" TEXT NOT NULL,role "CollectionMemberRole" NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',CURRENT_TIMESTAMP),"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',CURRENT_TIMESTAMP),
 PRIMARY KEY("collectionId","userId"),
 CONSTRAINT "CollectionMember_collectionId_fkey" FOREIGN KEY("collectionId") REFERENCES "Collection"(id) ON DELETE CASCADE ON UPDATE RESTRICT,
 CONSTRAINT "CollectionMember_userId_fkey" FOREIGN KEY("userId") REFERENCES "user"(id) ON DELETE CASCADE ON UPDATE RESTRICT
);
CREATE INDEX "CollectionMember_userId_collectionId_idx" ON "CollectionMember"("userId","collectionId");
CREATE TABLE "CollectionOwnershipTransfer" (
 id UUID PRIMARY KEY,"collectionId" UUID NOT NULL,"fromOwnerId" TEXT,"toOwnerId" TEXT,"actorId" TEXT,
 "fromRevision" INTEGER NOT NULL,"toRevision" INTEGER NOT NULL,"transactionId" VARCHAR(20) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',CURRENT_TIMESTAMP),
 CONSTRAINT "CollectionOwnershipTransfer_revision_check" CHECK("fromRevision">=0 AND "toRevision"::bigint="fromRevision"::bigint+1),
 CONSTRAINT "CollectionOwnershipTransfer_transaction_check" CHECK("transactionId"~'^[0-9]{1,20}$'),
 CONSTRAINT "CollectionOwnershipTransfer_distinct_check" CHECK("fromOwnerId" IS NULL OR "toOwnerId" IS NULL OR "fromOwnerId"<>"toOwnerId"),
 CONSTRAINT "CollectionOwnershipTransfer_collectionId_fkey" FOREIGN KEY("collectionId") REFERENCES "Collection"(id) ON DELETE CASCADE ON UPDATE RESTRICT,
 CONSTRAINT "CollectionOwnershipTransfer_fromOwnerId_fkey" FOREIGN KEY("fromOwnerId") REFERENCES "user"(id) ON DELETE SET NULL ON UPDATE RESTRICT,
 CONSTRAINT "CollectionOwnershipTransfer_toOwnerId_fkey" FOREIGN KEY("toOwnerId") REFERENCES "user"(id) ON DELETE SET NULL ON UPDATE RESTRICT,
 CONSTRAINT "CollectionOwnershipTransfer_actorId_fkey" FOREIGN KEY("actorId") REFERENCES "user"(id) ON DELETE SET NULL ON UPDATE RESTRICT,
 CONSTRAINT "CollectionOwnershipTransfer_collectionId_toRevision_key" UNIQUE("collectionId","toRevision")
);
CREATE INDEX "CollectionOwnershipTransfer_fromOwnerId_idx" ON "CollectionOwnershipTransfer"("fromOwnerId");
CREATE INDEX "CollectionOwnershipTransfer_toOwnerId_idx" ON "CollectionOwnershipTransfer"("toOwnerId");
CREATE INDEX "CollectionOwnershipTransfer_actorId_idx" ON "CollectionOwnershipTransfer"("actorId");
CREATE FUNCTION collection_member_identity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF ROW(NEW."collectionId",NEW."userId",NEW."createdAt") IS DISTINCT FROM ROW(OLD."collectionId",OLD."userId",OLD."createdAt") THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Membership identity is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER collection_member_identity_guard BEFORE UPDATE ON "CollectionMember" FOR EACH ROW EXECUTE FUNCTION collection_member_identity_guard();
CREATE FUNCTION collection_owner_membership_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE collection_id uuid; conflict boolean;
BEGIN
 IF TG_TABLE_NAME='Collection' THEN collection_id:=COALESCE(NEW.id,OLD.id); ELSE collection_id:=COALESCE(NEW."collectionId",OLD."collectionId"); END IF;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."CollectionMember" m JOIN %I."Collection" c ON c.id=m."collectionId" WHERE c.id=$1 AND c."ownerId"=m."userId")',TG_TABLE_SCHEMA,TG_TABLE_SCHEMA) INTO conflict USING collection_id;
 IF conflict THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Owner cannot also be a nonowner member'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER collection_member_owner_guard AFTER INSERT OR UPDATE OR DELETE ON "CollectionMember" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION collection_owner_membership_guard();
CREATE CONSTRAINT TRIGGER collection_owner_member_guard AFTER UPDATE ON "Collection" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION collection_owner_membership_guard();
CREATE FUNCTION collection_transfer_record_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE valid boolean; key text; before_data jsonb; after_data jsonb;
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW."fromOwnerId" IS NULL OR NEW."toOwnerId" IS NULL OR NEW."actorId" IS DISTINCT FROM NEW."fromOwnerId" OR NEW."transactionId"<>pg_current_xact_id()::text THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invalid ownership transition actor or transaction'; END IF;
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."Collection" c JOIN %I."CollectionMember" m ON m."collectionId"=c.id AND m."userId"=$3 JOIN %I."user" u ON u.id=m."userId" WHERE c.id=$1 AND c."ownerId"=$2 AND c."collaborationRevision"=$4 AND u."emailVerified")',TG_TABLE_SCHEMA,TG_TABLE_SCHEMA,TG_TABLE_SCHEMA) INTO valid USING NEW."collectionId",NEW."fromOwnerId",NEW."toOwnerId",NEW."fromRevision";
   IF NOT valid THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Ownership transition precondition failed'; END IF;
   RETURN NEW;
 ELSIF TG_OP='DELETE' THEN
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."Collection" WHERE id=$1)',TG_TABLE_SCHEMA) INTO valid USING OLD."collectionId";
   IF valid THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Ownership transitions are append-only'; END IF;
   RETURN OLD;
 END IF;
 before_data:=to_jsonb(OLD);after_data:=to_jsonb(NEW);
 IF (after_data-ARRAY['fromOwnerId','toOwnerId','actorId']) IS DISTINCT FROM (before_data-ARRAY['fromOwnerId','toOwnerId','actorId']) OR after_data=before_data THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Ownership transitions are immutable'; END IF;
 FOREACH key IN ARRAY ARRAY['fromOwnerId','toOwnerId','actorId'] LOOP
   IF after_data->key IS DISTINCT FROM before_data->key THEN
     IF before_data->>key IS NULL OR after_data->>key IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Ownership identity redaction only'; END IF;
     EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."user" WHERE id=$1)',TG_TABLE_SCHEMA) INTO valid USING before_data->>key;
     IF valid THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Live ownership identity cannot be erased'; END IF;
   END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER collection_transfer_record_guard BEFORE INSERT OR UPDATE OR DELETE ON "CollectionOwnershipTransfer" FOR EACH ROW EXECUTE FUNCTION collection_transfer_record_guard();
CREATE FUNCTION collection_ownership_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE valid boolean;
BEGIN
 IF NEW."ownerId" IS NOT DISTINCT FROM OLD."ownerId" THEN RETURN NEW; END IF;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."CollectionOwnershipTransfer" t WHERE t."collectionId"=$1 AND t."fromOwnerId"=$2 AND t."toOwnerId"=$3 AND t."fromRevision"=$4 AND t."toRevision"=$5 AND t."transactionId"=pg_current_xact_id()::text)',TG_TABLE_SCHEMA) INTO valid USING OLD.id,OLD."ownerId",NEW."ownerId",OLD."collaborationRevision",NEW."collaborationRevision";
 IF NOT valid THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Owner change requires a current atomic transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER collection_ownership_guard BEFORE UPDATE OF "ownerId" ON "Collection" FOR EACH ROW EXECUTE FUNCTION collection_ownership_guard();
