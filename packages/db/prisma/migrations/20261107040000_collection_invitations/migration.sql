CREATE TYPE "CollectionInvitationTargetKind" AS ENUM ('EMAIL','USER');
CREATE TABLE "CollectionInvitation" (
 id UUID PRIMARY KEY,"collectionId" UUID NOT NULL,"creatorUserId" TEXT NOT NULL,
 "targetKind" "CollectionInvitationTargetKind" NOT NULL,"targetEmail" VARCHAR(254),"targetUserId" TEXT,
 role "CollectionMemberRole" NOT NULL,"tokenHash" CHAR(64) NOT NULL UNIQUE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('UTC',CURRENT_TIMESTAMP),"expiresAt" TIMESTAMP(3) NOT NULL,
 "acceptedAt" TIMESTAMP(3),"acceptedByUserId" TEXT,"revokedAt" TIMESTAMP(3),
 CONSTRAINT "CollectionInvitation_collectionId_fkey" FOREIGN KEY("collectionId") REFERENCES "Collection"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "CollectionInvitation_creatorUserId_fkey" FOREIGN KEY("creatorUserId") REFERENCES "user"(id) ON DELETE CASCADE ON UPDATE RESTRICT,
 CONSTRAINT "CollectionInvitation_targetUserId_fkey" FOREIGN KEY("targetUserId") REFERENCES "user"(id) ON DELETE CASCADE ON UPDATE RESTRICT,
 CONSTRAINT "CollectionInvitation_acceptedByUserId_fkey" FOREIGN KEY("acceptedByUserId") REFERENCES "user"(id) ON DELETE CASCADE ON UPDATE RESTRICT,
 CONSTRAINT "CollectionInvitation_target_check" CHECK (
   ("targetKind"='EMAIL' AND "targetEmail" IS NOT NULL AND "targetUserId" IS NULL AND "targetEmail"=lower(btrim("targetEmail")) AND length("targetEmail") BETWEEN 3 AND 254 AND position('@' in "targetEmail")>1)
   OR ("targetKind"='USER' AND "targetUserId" IS NOT NULL AND "targetEmail" IS NULL)),
 CONSTRAINT "CollectionInvitation_hash_check" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$' COLLATE "C"),
 CONSTRAINT "CollectionInvitation_expiry_check" CHECK (isfinite("createdAt") AND isfinite("expiresAt") AND "expiresAt">"createdAt" AND "expiresAt"<="createdAt"+interval '14 days'),
 CONSTRAINT "CollectionInvitation_state_check" CHECK (
   (("acceptedAt" IS NULL)=("acceptedByUserId" IS NULL)) AND ("acceptedAt" IS NULL OR "revokedAt" IS NULL)
   AND ("acceptedAt" IS NULL OR (isfinite("acceptedAt") AND "acceptedAt">="createdAt" AND "acceptedAt"<"expiresAt"))
   AND ("revokedAt" IS NULL OR (isfinite("revokedAt") AND "revokedAt">="createdAt")))
);
CREATE INDEX "CollectionInvitation_collectionId_expiresAt_id_idx" ON "CollectionInvitation"("collectionId","expiresAt",id);
CREATE INDEX "CollectionInvitation_creatorUserId_idx" ON "CollectionInvitation"("creatorUserId");
CREATE INDEX "CollectionInvitation_targetUserId_idx" ON "CollectionInvitation"("targetUserId");
CREATE INDEX "CollectionInvitation_targetEmail_idx" ON "CollectionInvitation"("targetEmail");
CREATE INDEX "CollectionInvitation_acceptedByUserId_idx" ON "CollectionInvitation"("acceptedByUserId");
CREATE FUNCTION collection_invitation_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE current_owner text; creator_role text; recipient record;
BEGIN
 EXECUTE format('SELECT "ownerId" FROM %I."Collection" WHERE id=$1 AND "deletedAt" IS NULL FOR UPDATE',TG_TABLE_SCHEMA) INTO current_owner USING NEW."collectionId";
 IF current_owner IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invitation collection unavailable'; END IF;
 IF TG_OP='INSERT' THEN
   IF NEW."acceptedAt" IS NOT NULL OR NEW."acceptedByUserId" IS NOT NULL OR NEW."revokedAt" IS NOT NULL THEN
     RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='New invitation cannot already be consumed';
   END IF;
 ELSE
   IF ROW(NEW.id,NEW."collectionId",NEW."creatorUserId",NEW."targetKind",NEW."targetEmail",NEW."targetUserId",NEW.role,NEW."tokenHash",NEW."createdAt",NEW."expiresAt") IS DISTINCT FROM
      ROW(OLD.id,OLD."collectionId",OLD."creatorUserId",OLD."targetKind",OLD."targetEmail",OLD."targetUserId",OLD.role,OLD."tokenHash",OLD."createdAt",OLD."expiresAt") OR
      OLD."acceptedAt" IS NOT NULL OR OLD."revokedAt" IS NOT NULL THEN
     RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invitation identity and consumption are immutable';
   END IF;
   IF NEW."acceptedAt" IS NULL AND NEW."revokedAt" IS NULL THEN
     RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invitation requires a one-way state change';
   END IF;
 END IF;
 IF TG_OP='INSERT' OR NEW."acceptedAt" IS NOT NULL THEN
   IF current_owner=NEW."creatorUserId" THEN creator_role:='OWNER';
   ELSE EXECUTE format('SELECT role::text FROM %I."CollectionMember" WHERE "collectionId"=$1 AND "userId"=$2',TG_TABLE_SCHEMA)
     INTO creator_role USING NEW."collectionId",NEW."creatorUserId"; END IF;
   IF creator_role IS NULL OR creator_role NOT IN ('OWNER','ADMIN') OR (NEW.role::text='ADMIN' AND creator_role<>'OWNER') THEN
     RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Current inviter role cannot grant this membership';
   END IF;
 END IF;
 IF TG_OP='UPDATE' AND NEW."acceptedAt" IS NOT NULL THEN
   IF NEW."expiresAt"<=timezone('UTC',clock_timestamp()) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invitation expired'; END IF;
   EXECUTE format('SELECT id,email,"emailVerified" FROM %I."user" WHERE id=$1 FOR NO KEY UPDATE',TG_TABLE_SCHEMA)
     INTO recipient USING NEW."acceptedByUserId";
   IF recipient.id IS NULL OR NOT recipient."emailVerified" OR
     (NEW."targetKind"::text='USER' AND recipient.id<>NEW."targetUserId") OR
     (NEW."targetKind"::text='EMAIL' AND lower(btrim(recipient.email))<>NEW."targetEmail") THEN
     RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invitation requires its verified intended recipient';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER collection_invitation_guard BEFORE INSERT OR UPDATE ON "CollectionInvitation"
 FOR EACH ROW EXECUTE FUNCTION collection_invitation_guard();
CREATE FUNCTION collection_invitation_acceptance_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE valid boolean; alive boolean;
BEGIN
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."CollectionInvitation" WHERE id=$1)',TG_TABLE_SCHEMA) INTO alive USING NEW.id;
 IF NOT alive THEN RETURN NULL; END IF;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM %1$I."CollectionInvitation" invite JOIN %1$I."Collection" parent ON parent.id=invite."collectionId" JOIN %1$I."user" recipient ON recipient.id=invite."acceptedByUserId" LEFT JOIN %1$I."CollectionMember" member ON member."collectionId"=parent.id AND member."userId"=recipient.id WHERE invite.id=$1 AND recipient."emailVerified" AND ((invite."targetKind"::text=''USER'' AND invite."targetUserId"=recipient.id) OR (invite."targetKind"::text=''EMAIL'' AND invite."targetEmail"=lower(btrim(recipient.email)))) AND (parent."ownerId"=recipient.id OR member.role=invite.role))',TG_TABLE_SCHEMA)
   INTO valid USING NEW.id;
 IF NOT valid THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Invitation acceptance must create its actual membership'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER collection_invitation_acceptance_guard AFTER UPDATE ON "CollectionInvitation"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD."acceptedAt" IS NULL AND NEW."acceptedAt" IS NOT NULL)
 EXECUTE FUNCTION collection_invitation_acceptance_guard();
CREATE FUNCTION collection_invitation_email_erasure() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 EXECUTE format('DELETE FROM %I."CollectionInvitation" WHERE "targetEmail"=lower(btrim($1))',TG_TABLE_SCHEMA) USING OLD.email;
 RETURN OLD;
END $$;
CREATE TRIGGER collection_invitation_email_erasure AFTER DELETE ON "user"
 FOR EACH ROW EXECUTE FUNCTION collection_invitation_email_erasure();
-- Leaving/removal must also invalidate old unconsumed invitations, not only accepted replays.
CREATE FUNCTION collection_member_invitation_revocation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE live boolean; target_email text;
BEGIN
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."Collection" WHERE id=$1 AND "deletedAt" IS NULL)',TG_TABLE_SCHEMA)
   INTO live USING OLD."collectionId";
 IF NOT live THEN RETURN OLD; END IF;
 EXECUTE format('SELECT lower(btrim(email)) FROM %I."user" WHERE id=$1',TG_TABLE_SCHEMA)
   INTO target_email USING OLD."userId";
 EXECUTE format('UPDATE %I."CollectionInvitation" SET "revokedAt"=GREATEST("createdAt",date_trunc(''milliseconds'',timezone(''UTC'',clock_timestamp()))) WHERE "collectionId"=$1 AND "acceptedAt" IS NULL AND "revokedAt" IS NULL AND ("targetUserId"=$2 OR "targetEmail"=$3)',TG_TABLE_SCHEMA)
   USING OLD."collectionId",OLD."userId",target_email;
 RETURN OLD;
END $$;
CREATE TRIGGER collection_member_invitation_revocation AFTER DELETE ON "CollectionMember"
 FOR EACH ROW EXECUTE FUNCTION collection_member_invitation_revocation();
