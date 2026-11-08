-- The application still admits at most 65,536 compact UTF-8 bytes. PostgreSQL
-- JSONB text adds separators; storage headroom must not reject valid API output.
-- Preserve the applied initial AI migration and its closed-key constraint.
ALTER TABLE "AIAnalysisSuggestion" DROP CONSTRAINT "AIAnalysisSuggestion_payload_check";
ALTER TABLE "AIAnalysisSuggestion" ADD CONSTRAINT "AIAnalysisSuggestion_payload_check" CHECK (
 (jsonb_typeof(payload)='object'
  AND payload ?& ARRAY['categoryKey','title','manufacturer','seriesOrSet','year','identifiers','catalogCandidates','warnings']
  AND payload-ARRAY['categoryKey','title','manufacturer','seriesOrSet','year','identifiers','catalogCandidates','warnings']='{}'::jsonb
  AND octet_length(payload::text)<=73728) IS TRUE
);
