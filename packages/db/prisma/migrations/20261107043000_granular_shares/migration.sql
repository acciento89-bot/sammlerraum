CREATE TABLE "CollectionShare" (
 id UUID PRIMARY KEY, "collectionId" UUID NOT NULL REFERENCES "Collection"(id) ON DELETE CASCADE,
 "creatorUserId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE ON UPDATE RESTRICT,
 "targetKind" VARCHAR(10) NOT NULL CHECK ("targetKind" IN ('COLLECTION','NODE','ITEM')),
 "targetId" UUID NOT NULL,
 "recipientUserId" TEXT REFERENCES "user"(id) ON DELETE CASCADE ON UPDATE RESTRICT,
 "tokenHash" CHAR(64) UNIQUE CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
 permissions JSONB NOT NULL CHECK (jsonb_typeof(permissions)='object' AND permissions->'readOnly'='true'::jsonb),
 "pinHash" TEXT,
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',CURRENT_TIMESTAMP),
 "expiresAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3),
 CHECK (("recipientUserId" IS NULL) <> ("tokenHash" IS NULL)),
 CHECK ("expiresAt" IS NULL OR "expiresAt">"createdAt")
);
CREATE INDEX "CollectionShare_collectionId_id_idx" ON "CollectionShare"("collectionId",id);
CREATE INDEX "CollectionShare_creatorUserId_idx" ON "CollectionShare"("creatorUserId");
CREATE INDEX "CollectionShare_recipientUserId_idx" ON "CollectionShare"("recipientUserId");
CREATE FUNCTION guard_collection_share() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.id,NEW."collectionId",NEW."creatorUserId",NEW."targetKind",NEW."targetId",NEW."recipientUserId",NEW."tokenHash",NEW.permissions,NEW."pinHash",NEW."createdAt",NEW."expiresAt") IS DISTINCT FROM ROW(OLD.id,OLD."collectionId",OLD."creatorUserId",OLD."targetKind",OLD."targetId",OLD."recipientUserId",OLD."tokenHash",OLD.permissions,OLD."pinHash",OLD."createdAt",OLD."expiresAt") OR OLD."revokedAt" IS NOT NULL OR NEW."revokedAt" IS NULL OR NEW.revision<>OLD.revision+1 THEN
   RAISE EXCEPTION 'Share grant is immutable' USING ERRCODE='23514';
  END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM "Collection" WHERE id=NEW."collectionId" AND "ownerId"=NEW."creatorUserId" AND "deletedAt" IS NULL FOR SHARE) THEN RAISE EXCEPTION 'Invalid share owner' USING ERRCODE='23514'; END IF;
  IF (NEW."targetKind"='COLLECTION' AND NEW."targetId"<>NEW."collectionId") OR (NEW."targetKind"='NODE' AND NOT EXISTS(SELECT 1 FROM "CollectionNode" WHERE id=NEW."targetId" AND "collectionId"=NEW."collectionId")) OR (NEW."targetKind"='ITEM' AND NOT EXISTS(SELECT 1 FROM "CollectibleItem" WHERE id=NEW."targetId" AND "collectionId"=NEW."collectionId" AND "ownerId"=NEW."creatorUserId" AND "deletedAt" IS NULL)) THEN RAISE EXCEPTION 'Invalid share target' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER collection_share_guard BEFORE INSERT OR UPDATE ON "CollectionShare" FOR EACH ROW EXECUTE FUNCTION guard_collection_share();
CREATE FUNCTION revoke_collection_shares_on_transfer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."ownerId" IS DISTINCT FROM OLD."ownerId" THEN
  UPDATE "CollectionShare" SET "revokedAt"=timezone('UTC',clock_timestamp()),revision=revision+1 WHERE "collectionId"=NEW.id AND "revokedAt" IS NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER collection_share_transfer_revoke AFTER UPDATE OF "ownerId" ON "Collection" FOR EACH ROW EXECUTE FUNCTION revoke_collection_shares_on_transfer();

CREATE TABLE "SharePinBudget" (
 "shareId" UUID PRIMARY KEY REFERENCES "CollectionShare"(id) ON DELETE CASCADE,
 attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 5),
 "windowStartedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "ShareAccessSession" (
 "tokenHash" CHAR(64) PRIMARY KEY CHECK("tokenHash" ~ '^[0-9a-f]{64}$'),
 "shareId" UUID NOT NULL REFERENCES "CollectionShare"(id) ON DELETE CASCADE,
 "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "ShareAccessSession_shareId_expiresAt_idx" ON "ShareAccessSession"("shareId","expiresAt");
