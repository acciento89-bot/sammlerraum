CREATE TABLE "BillingQuotaFence" ("subjectId" TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,revision BIGINT NOT NULL DEFAULT 0 CHECK(revision>=0));
CREATE TABLE "AIAnalysisAdmission" ("analysisJobId" UUID PRIMARY KEY,"ownerId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,"admittedAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "AIAnalysisAdmission_ownerId_admittedAt_idx" ON "AIAnalysisAdmission"("ownerId","admittedAt");
INSERT INTO "AIAnalysisAdmission" ("analysisJobId","ownerId","admittedAt") SELECT id,"requesterId","createdAt" FROM "AIAnalysisJob";
CREATE FUNCTION guard_ai_admission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NOT EXISTS(SELECT 1 FROM "AIAnalysisJob" WHERE id=NEW."analysisJobId" AND "requesterId"=NEW."ownerId" AND "createdAt"=NEW."admittedAt") THEN RAISE EXCEPTION 'AI_ADMISSION_INVALID'; END IF;RETURN NEW;
 END IF;
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM "user" WHERE id=OLD."ownerId") THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'AI_ADMISSION_IMMUTABLE';
END $$;
CREATE TRIGGER "AIAnalysisAdmission_guard" BEFORE INSERT OR UPDATE OR DELETE ON "AIAnalysisAdmission" FOR EACH ROW EXECUTE FUNCTION guard_ai_admission();
CREATE FUNCTION record_ai_admission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO "AIAnalysisAdmission" ("analysisJobId","ownerId","admittedAt") VALUES (NEW.id,NEW."requesterId",NEW."createdAt");RETURN NEW;
END $$;
CREATE TRIGGER "AIAnalysisJob_admission" AFTER INSERT ON "AIAnalysisJob" FOR EACH ROW EXECUTE FUNCTION record_ai_admission();
CREATE FUNCTION guard_billing_quota_fence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM "user" WHERE id=OLD."subjectId") THEN RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND NEW."subjectId"=OLD."subjectId" AND NEW.revision>OLD.revision THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'BILLING_FENCE_IMMUTABLE';
END $$;
CREATE TRIGGER "BillingQuotaFence_guard" BEFORE UPDATE OR DELETE ON "BillingQuotaFence" FOR EACH ROW EXECUTE FUNCTION guard_billing_quota_fence();
