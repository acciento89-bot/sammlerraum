CREATE TABLE "MarketSyncReceipt" (
 "providerId" VARCHAR(64) NOT NULL, "pollId" UUID NOT NULL, request JSONB NOT NULL,
 "fetchedAt" TIMESTAMPTZ(3) NOT NULL, "recordedAt" TIMESTAMPTZ(3) NOT NULL,
 "observationCount" INTEGER NOT NULL,
 CONSTRAINT "MarketSyncReceipt_pkey" PRIMARY KEY ("providerId","pollId")
);
CREATE TABLE "MarketSyncDispatchState" (
 id TEXT PRIMARY KEY, "cursorProviderId" VARCHAR(64), "cursorIdentifierId" UUID,
 "nextDispatchAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "MarketSyncDispatchState_valid" CHECK (
 id='market.sync' AND (("cursorProviderId" IS NULL)=("cursorIdentifierId" IS NULL))
 AND ("cursorProviderId" IS NULL OR (market_short_text("cursorProviderId",64) AND "cursorProviderId" ~ '^[a-z][a-z0-9_-]{0,63}$'))
 AND isfinite("nextDispatchAt") AND "nextDispatchAt">='0001-01-01Z'::timestamptz AND "nextDispatchAt"<'10000-01-01Z'::timestamptz)
);
INSERT INTO "MarketSyncDispatchState" (id,"nextDispatchAt") VALUES ('market.sync','0001-01-01Z') ON CONFLICT DO NOTHING;
CREATE INDEX "CatalogExternalIdentifier_market_scan" ON "CatalogExternalIdentifier" (namespace,type,id) WHERE active;
CREATE FUNCTION market_sync_request_valid(value jsonb, provider text, poll uuid) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE t jsonb; k text; raw text;
BEGIN
 IF jsonb_typeof(value)<>'object' OR octet_length(value::text)>2048
  OR NOT value ?& ARRAY['providerId','pollId','target']
  OR value-ARRAY['providerId','pollId','target'] <> '{}'::jsonb
  OR jsonb_typeof(value->'providerId')<>'string' OR value->>'providerId'<>provider
  OR jsonb_typeof(value->'pollId')<>'string' OR value->>'pollId'<>poll::text
 THEN RETURN false; END IF;
 t:=value->'target';
 IF jsonb_typeof(t)<>'object' OR NOT t ?& ARRAY['entryId','variantId','revision','identifierId','namespace','identifierType','externalId']
  OR t-ARRAY['entryId','variantId','revision','identifierId','namespace','identifierType','externalId'] <> '{}'::jsonb
 THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['entryId','identifierId','variantId'] LOOP
  IF k='variantId' AND t->k='null'::jsonb THEN CONTINUE; END IF;
  IF jsonb_typeof(t->k)<>'string' OR t->>k !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN false; END IF;
 END LOOP;
 IF jsonb_typeof(t->'revision')<>'number' OR (t->>'revision')::numeric NOT BETWEEN 1 AND 2147483647
  OR trunc((t->>'revision')::numeric)<>(t->>'revision')::numeric THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['namespace','identifierType','externalId'] LOOP
  raw:=t->>k;
  IF jsonb_typeof(t->k)<>'string' OR NOT market_short_text(raw,CASE WHEN k='externalId' THEN 256 ELSE 64 END) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
ALTER TABLE "MarketSyncReceipt" ADD CONSTRAINT "MarketSyncReceipt_valid" CHECK (
 market_short_text("providerId",64) AND "providerId" ~ '^[a-z][a-z0-9_-]{0,63}$'
 AND market_sync_request_valid(request,"providerId","pollId") IS TRUE
 AND "observationCount" BETWEEN 0 AND 100
 AND isfinite("fetchedAt") AND isfinite("recordedAt")
 AND "fetchedAt">='0001-01-01Z'::timestamptz AND "recordedAt"<'10000-01-01Z'::timestamptz AND "fetchedAt"<="recordedAt"
);
CREATE FUNCTION reject_market_sync_receipt_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Market sync receipts are immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER market_sync_receipt_immutable BEFORE UPDATE ON "MarketSyncReceipt" FOR EACH ROW EXECUTE FUNCTION reject_market_sync_receipt_update();
