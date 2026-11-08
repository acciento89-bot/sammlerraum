-- Advisory photo analysis is separate from personal item data and explicit acceptance.
CREATE TYPE "AIAnalysisStatus" AS ENUM ('PENDING','PROCESSING','READY','FAILED','CANCELLED');
CREATE TYPE "AIAnalysisAttemptStatus" AS ENUM ('PENDING','SUCCEEDED','FAILED','DISCARDED','ABANDONED');
CREATE TABLE "AIAnalysisJob" (
 id UUID PRIMARY KEY,
 "requesterId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 "itemId" UUID NOT NULL REFERENCES "CollectibleItem"(id) ON DELETE CASCADE,
 "collectionId" UUID NOT NULL REFERENCES "Collection"(id) ON DELETE CASCADE,
 "requestKey" UUID NOT NULL,
 "requestDigest" CHAR(64) NOT NULL CHECK ("requestDigest" ~ '^[a-f0-9]{64}$'),
 sources JSONB NOT NULL CHECK ((jsonb_typeof(sources)='array' AND jsonb_array_length(sources) BETWEEN 1 AND 4 AND octet_length(sources::text)<=8192) IS TRUE),
 "providerId" VARCHAR(64) NOT NULL CHECK ("providerId" ~ '^[a-z][a-z0-9_-]{0,63}$'),
 model VARCHAR(128) NOT NULL CHECK (length(model)>0),
 status "AIAnalysisStatus" NOT NULL DEFAULT 'PENDING',
 attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
 "leaseToken" UUID,
 "leaseUntil" TIMESTAMP(3),
 "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "errorCode" VARCHAR(64),
 "lastDispatchedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("requesterId","requestKey"),
 CHECK (((status='PROCESSING' AND "leaseToken" IS NOT NULL AND "leaseUntil" IS NOT NULL AND attempts>0 AND "errorCode" IS NULL)
  OR (status<>'PROCESSING' AND "leaseToken" IS NULL AND "leaseUntil" IS NULL)) IS TRUE),
 CHECK (status<>'FAILED' OR "errorCode" IS NOT NULL)
);
CREATE INDEX "AIAnalysisJob_requesterId_createdAt_idx" ON "AIAnalysisJob"("requesterId","createdAt");
CREATE INDEX "AIAnalysisJob_itemId_requesterId_createdAt_idx" ON "AIAnalysisJob"("itemId","requesterId","createdAt");
CREATE INDEX "AIAnalysisJob_status_nextAttemptAt_lastDispatchedAt_id_idx" ON "AIAnalysisJob"(status,"nextAttemptAt","lastDispatchedAt",id);
CREATE INDEX "AIAnalysisJob_status_leaseUntil_idx" ON "AIAnalysisJob"(status,"leaseUntil");
CREATE TABLE "AIAnalysisSuggestion" (
 "jobId" UUID PRIMARY KEY REFERENCES "AIAnalysisJob"(id) ON DELETE CASCADE,
 "completionToken" UUID NOT NULL,
 payload JSONB NOT NULL,
 "payloadSha256" CHAR(64) NOT NULL CHECK ("payloadSha256" ~ '^[a-f0-9]{64}$'),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ((jsonb_typeof(payload)='object' AND payload ?& ARRAY['categoryKey','title','manufacturer','seriesOrSet','year','identifiers','catalogCandidates','warnings'] AND payload-ARRAY['categoryKey','title','manufacturer','seriesOrSet','year','identifiers','catalogCandidates','warnings']='{}'::jsonb AND octet_length(payload::text)<=65536) IS TRUE)
);
CREATE TABLE "AIAnalysisAttempt" (
 "jobId" UUID NOT NULL REFERENCES "AIAnalysisJob"(id) ON DELETE CASCADE,
 number INTEGER NOT NULL CHECK (number BETWEEN 1 AND 3),
 token UUID NOT NULL UNIQUE,
 outcome "AIAnalysisAttemptStatus" NOT NULL DEFAULT 'PENDING',
 "inputTokens" INTEGER CHECK ("inputTokens">=0),
 "outputTokens" INTEGER CHECK ("outputTokens">=0),
 "errorCode" VARCHAR(64),
 "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "finishedAt" TIMESTAMP(3),
 PRIMARY KEY ("jobId",number),
 CHECK ((outcome='PENDING')=("finishedAt" IS NULL)),
 CHECK ("finishedAt" IS NULL OR "finishedAt">="startedAt")
);
CREATE FUNCTION guard_ai_suggestion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'AI_SUGGESTION_IMMUTABLE'; END IF;
 IF TG_OP='DELETE' THEN
  IF EXISTS(SELECT 1 FROM "AIAnalysisJob" WHERE id=OLD."jobId") THEN RAISE EXCEPTION 'AI_SUGGESTION_IMMUTABLE'; END IF;
  RETURN OLD;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM "AIAnalysisJob" WHERE id=NEW."jobId" AND status='PROCESSING' AND "leaseToken"=NEW."completionToken" AND "leaseUntil">(clock_timestamp() AT TIME ZONE 'UTC')) THEN RAISE EXCEPTION 'AI_STALE_JOB'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "AIAnalysisSuggestion_guard" BEFORE INSERT OR UPDATE OR DELETE ON "AIAnalysisSuggestion" FOR EACH ROW EXECUTE FUNCTION guard_ai_suggestion();
CREATE FUNCTION guard_ai_job() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'PENDING' OR NEW.attempts<>0 OR NOT EXISTS(SELECT 1 FROM "CollectibleItem" i JOIN "Collection" c ON c.id=i."collectionId" WHERE i.id=NEW."itemId" AND i."ownerId"=NEW."requesterId" AND c.id=NEW."collectionId" AND c."ownerId"=NEW."requesterId" AND i."deletedAt" IS NULL AND c."deletedAt" IS NULL) THEN RAISE EXCEPTION 'AI_INVALID_JOB'; END IF;
  RETURN NEW;
 END IF;
 IF ROW(NEW.id,NEW."requesterId",NEW."itemId",NEW."collectionId",NEW."requestKey",NEW."requestDigest",NEW.sources,NEW."providerId",NEW.model,NEW."createdAt") IS DISTINCT FROM ROW(OLD.id,OLD."requesterId",OLD."itemId",OLD."collectionId",OLD."requestKey",OLD."requestDigest",OLD.sources,OLD."providerId",OLD.model,OLD."createdAt") THEN RAISE EXCEPTION 'AI_JOB_IMMUTABLE'; END IF;
 IF OLD.status IN ('READY','FAILED','CANCELLED') THEN RAISE EXCEPTION 'AI_JOB_TERMINAL'; END IF;
 IF NEW.status='PROCESSING' THEN
  IF NOT ((OLD.status='PENDING' OR (OLD.status='PROCESSING' AND OLD."leaseUntil"<=(clock_timestamp() AT TIME ZONE 'UTC'))) AND NEW.attempts=OLD.attempts+1 AND NEW."leaseToken" IS DISTINCT FROM OLD."leaseToken") AND NOT (OLD.status='PROCESSING' AND NEW.attempts=OLD.attempts AND NEW."leaseToken"=OLD."leaseToken" AND OLD."leaseUntil">(clock_timestamp() AT TIME ZONE 'UTC') AND NEW."leaseUntil">=OLD."leaseUntil") THEN RAISE EXCEPTION 'AI_INVALID_LEASE'; END IF;
  IF NEW."leaseUntil"<=(clock_timestamp() AT TIME ZONE 'UTC') OR NEW."leaseUntil">(clock_timestamp() AT TIME ZONE 'UTC')+interval '120 seconds' THEN RAISE EXCEPTION 'AI_INVALID_LEASE'; END IF;
 ELSIF NEW.status='READY' THEN
  IF OLD.status<>'PROCESSING' OR OLD."leaseUntil"<=(clock_timestamp() AT TIME ZONE 'UTC') OR NEW.attempts<>OLD.attempts OR NOT EXISTS(SELECT 1 FROM "AIAnalysisSuggestion" WHERE "jobId"=OLD.id AND "completionToken"=OLD."leaseToken") THEN RAISE EXCEPTION 'AI_INVALID_COMPLETION'; END IF;
 ELSIF NEW.attempts<>OLD.attempts THEN RAISE EXCEPTION 'AI_INVALID_ATTEMPTS';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "AIAnalysisJob_guard" BEFORE INSERT OR UPDATE ON "AIAnalysisJob" FOR EACH ROW EXECUTE FUNCTION guard_ai_job();
CREATE FUNCTION guard_ai_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF EXISTS(SELECT 1 FROM "AIAnalysisJob" WHERE id=OLD."jobId") THEN RAISE EXCEPTION 'AI_ATTEMPT_IMMUTABLE'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.outcome<>'PENDING' OR NOT EXISTS(SELECT 1 FROM "AIAnalysisJob" WHERE id=NEW."jobId" AND status='PROCESSING' AND attempts=NEW.number AND "leaseToken"=NEW.token) THEN RAISE EXCEPTION 'AI_INVALID_ATTEMPT'; END IF;
 ELSE
  IF OLD.outcome<>'PENDING' OR NEW.outcome='PENDING' OR ROW(NEW."jobId",NEW.number,NEW.token,NEW."startedAt") IS DISTINCT FROM ROW(OLD."jobId",OLD.number,OLD.token,OLD."startedAt") THEN RAISE EXCEPTION 'AI_ATTEMPT_IMMUTABLE'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "AIAnalysisAttempt_guard" BEFORE INSERT OR UPDATE OR DELETE ON "AIAnalysisAttempt" FOR EACH ROW EXECUTE FUNCTION guard_ai_attempt();

CREATE FUNCTION guard_ai_result_commit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM "AIAnalysisJob" j JOIN "AIAnalysisAttempt" a ON a."jobId"=j.id AND a.token=NEW."completionToken" AND a.outcome='SUCCEEDED' WHERE j.id=NEW."jobId" AND j.status='READY') THEN RAISE EXCEPTION 'AI_INCOMPLETE_RESULT'; END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER "AIAnalysisSuggestion_commit_guard" AFTER INSERT ON "AIAnalysisSuggestion" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_ai_result_commit();
