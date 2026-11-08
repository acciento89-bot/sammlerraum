-- Provider-reported usage can arrive after lease loss. Keep it without rewriting an immutable attempt.
CREATE TABLE "AIAnalysisUsageReport" (
 "attemptToken" UUID PRIMARY KEY REFERENCES "AIAnalysisAttempt"(token) ON DELETE CASCADE,
 "inputTokens" INTEGER CHECK ("inputTokens">=0),
 "outputTokens" INTEGER CHECK ("outputTokens">=0),
 "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE FUNCTION guard_ai_usage_report() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM "AIAnalysisAttempt" WHERE token=OLD."attemptToken") THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'AI_USAGE_IMMUTABLE';
END $$;
CREATE TRIGGER "AIAnalysisUsageReport_guard" BEFORE UPDATE OR DELETE ON "AIAnalysisUsageReport" FOR EACH ROW EXECUTE FUNCTION guard_ai_usage_report();
