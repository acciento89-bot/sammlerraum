CREATE TABLE "AIAnalysisDecision" (
 "jobId" UUID PRIMARY KEY REFERENCES "AIAnalysisJob"(id) ON DELETE CASCADE,
 "requestKey" UUID NOT NULL,
 "requestDigest" CHAR(64) NOT NULL CHECK ("requestDigest" ~ '^[a-f0-9]{64}$'),
 selections JSONB NOT NULL CHECK ((jsonb_typeof(selections)='object' AND octet_length(selections::text)<=4096) IS TRUE),
 accepted JSONB NOT NULL CHECK ((jsonb_typeof(accepted)='array' AND jsonb_array_length(accepted)<=26 AND octet_length(accepted::text)<=1024) IS TRUE),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE FUNCTION guard_ai_decision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NOT EXISTS(SELECT 1 FROM "AIAnalysisJob" j JOIN "CollectibleItem" i ON i.id=j."itemId" JOIN "Collection" c ON c.id=i."collectionId" JOIN "AIAnalysisSuggestion" s ON s."jobId"=j.id WHERE j.id=NEW."jobId" AND j.status='READY' AND j."requesterId"=i."ownerId" AND i."ownerId"=c."ownerId" AND i."collectionId"=j."collectionId" AND i."deletedAt" IS NULL AND c."deletedAt" IS NULL) THEN RAISE EXCEPTION 'AI_INVALID_DECISION'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM "AIAnalysisJob" WHERE id=OLD."jobId") THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'AI_DECISION_IMMUTABLE';
END $$;
CREATE TRIGGER "AIAnalysisDecision_guard" BEFORE INSERT OR UPDATE OR DELETE ON "AIAnalysisDecision" FOR EACH ROW EXECUTE FUNCTION guard_ai_decision();
