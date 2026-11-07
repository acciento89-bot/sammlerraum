-- Separate immutable revocation markers avoid taking a Share UPDATE lock after an Item lock.
-- Guest readers already hold Share SHARE before Item SHARE; FK KEY SHARE remains compatible.
CREATE TABLE "ShareRevocation" (
 "shareId" UUID PRIMARY KEY REFERENCES "CollectionShare"(id) ON DELETE CASCADE,
 "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',clock_timestamp()),
 reason VARCHAR(32) NOT NULL CHECK(reason IN ('TARGET_TRASHED','COLLECTION_TRASHED'))
);
CREATE FUNCTION guard_share_revocation_marker() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE alive boolean;
BEGIN
 IF TG_OP='DELETE' THEN
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."CollectionShare" WHERE id=$1)',TG_TABLE_SCHEMA) INTO alive USING OLD."shareId";
  IF NOT alive THEN RETURN OLD; END IF;
 END IF;
 RAISE EXCEPTION 'Share retirement is permanent' USING ERRCODE='23514';
END $$;
CREATE TRIGGER share_revocation_marker_immutable BEFORE UPDATE OR DELETE ON "ShareRevocation" FOR EACH ROW EXECUTE FUNCTION guard_share_revocation_marker();
CREATE FUNCTION retire_capabilities_on_trash() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD."deletedAt" IS NULL AND NEW."deletedAt" IS NOT NULL THEN
  IF TG_TABLE_NAME='Collection' THEN
   EXECUTE format('INSERT INTO %1$I."ShareRevocation" ("shareId",reason) SELECT id,''COLLECTION_TRASHED'' FROM %1$I."CollectionShare" WHERE "collectionId"=$1 AND "revokedAt" IS NULL ON CONFLICT ("shareId") DO NOTHING',TG_TABLE_SCHEMA) USING NEW.id;
   -- BEFORE parent UPDATE, the existing strict invitation guard still sees its live parent.
   EXECUTE format('UPDATE %I."CollectionInvitation" SET "revokedAt"=GREATEST("createdAt",timezone(''UTC'',clock_timestamp())) WHERE "collectionId"=$1 AND "acceptedAt" IS NULL AND "revokedAt" IS NULL',TG_TABLE_SCHEMA) USING NEW.id;
  ELSE
   EXECUTE format('INSERT INTO %1$I."ShareRevocation" ("shareId",reason) SELECT id,''TARGET_TRASHED'' FROM %1$I."CollectionShare" WHERE "collectionId"=$1 AND "targetKind"=''ITEM'' AND "targetId"=$2 AND "revokedAt" IS NULL ON CONFLICT ("shareId") DO NOTHING',TG_TABLE_SCHEMA) USING NEW."collectionId",NEW.id;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER collection_trash_retire_capabilities BEFORE UPDATE OF "deletedAt" ON "Collection" FOR EACH ROW EXECUTE FUNCTION retire_capabilities_on_trash();
CREATE TRIGGER item_trash_retire_capabilities AFTER UPDATE OF "deletedAt" ON "CollectibleItem" FOR EACH ROW EXECUTE FUNCTION retire_capabilities_on_trash();
-- Retire grants for resources already in trash before this additive migration.
INSERT INTO "ShareRevocation" ("shareId",reason)
SELECT s.id,CASE WHEN c."deletedAt" IS NOT NULL THEN 'COLLECTION_TRASHED' ELSE 'TARGET_TRASHED' END
FROM "CollectionShare" s JOIN "Collection" c ON c.id=s."collectionId"
LEFT JOIN "CollectibleItem" i ON s."targetKind"='ITEM' AND i.id=s."targetId"
WHERE s."revokedAt" IS NULL AND (c."deletedAt" IS NOT NULL OR (s."targetKind"='ITEM' AND i."deletedAt" IS NOT NULL))
ON CONFLICT ("shareId") DO NOTHING;
CREATE FUNCTION retire_historical_invites_on_restore() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD."deletedAt" IS NOT NULL AND NEW."deletedAt" IS NULL THEN
  EXECUTE format('UPDATE %I."CollectionInvitation" SET "revokedAt"=GREATEST("createdAt",timezone(''UTC'',clock_timestamp())) WHERE "collectionId"=$1 AND "acceptedAt" IS NULL AND "revokedAt" IS NULL',TG_TABLE_SCHEMA) USING NEW.id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER collection_restore_retire_historical_invites AFTER UPDATE OF "deletedAt" ON "Collection" FOR EACH ROW EXECUTE FUNCTION retire_historical_invites_on_restore();
