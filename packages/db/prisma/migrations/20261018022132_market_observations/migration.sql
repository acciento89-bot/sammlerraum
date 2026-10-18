-- CreateEnum
CREATE TYPE "MarketObservationKind" AS ENUM ('LAST_SOLD', 'SOLD_AVERAGE', 'SOLD_MEDIAN', 'ASKING_PRICE', 'PRICE_RANGE', 'CATALOG_VALUE', 'DEALER_PRICE');

-- CreateEnum
CREATE TYPE "MarketIdentityMode" AS ENUM ('EVENT', 'POLL');

-- CreateEnum
CREATE TYPE "MarketObservedBasis" AS ENUM ('SOURCE', 'FETCH');

-- CreateEnum
CREATE TYPE "MarketObservedPrecision" AS ENUM ('DAY', 'SECOND', 'MILLISECOND');

-- CreateTable
CREATE TABLE "MarketObservation" (
    "id" UUID NOT NULL,
    "providerId" VARCHAR(64) NOT NULL,
    "externalId" VARCHAR(256) NOT NULL,
    "identityMode" "MarketIdentityMode" NOT NULL,
    "eventId" VARCHAR(256),
    "pollId" UUID,
    "sourceMetric" VARCHAR(64) NOT NULL,
    "kind" "MarketObservationKind" NOT NULL,
    "entryId" UUID NOT NULL,
    "variantId" UUID,
    "catalogRevision" INTEGER NOT NULL,
    "identifierId" UUID NOT NULL,
    "identifierNamespace" VARCHAR(64) NOT NULL,
    "identifierType" VARCHAR(64) NOT NULL,
    "qualifiers" JSONB NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "minorUnitExponent" INTEGER NOT NULL,
    "amountMinor" BIGINT,
    "lowMinor" BIGINT,
    "highMinor" BIGINT,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "observedBasis" "MarketObservedBasis" NOT NULL,
    "observedPrecision" "MarketObservedPrecision" NOT NULL,
    "sourceUrl" VARCHAR(2048),
    "sourceReference" VARCHAR(512),
    "confidence" JSONB,

    CONSTRAINT "MarketObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketObservation_providerId_idx" ON "MarketObservation"("providerId");

-- CreateIndex
CREATE INDEX "MarketObservation_history_idx" ON "MarketObservation"("entryId", "variantId", "providerId", "kind", "currency", "observedAt" DESC, "createdAt" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "MarketObservation" ADD CONSTRAINT "MarketObservation_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CatalogEntry"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MarketObservation" ADD CONSTRAINT "MarketObservation_variantId_entryId_fkey" FOREIGN KEY ("variantId", "entryId") REFERENCES "CatalogVariant"("id", "entryId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MarketObservation" ADD CONSTRAINT "MarketObservation_entryId_catalogRevision_fkey" FOREIGN KEY ("entryId", "catalogRevision") REFERENCES "CatalogRevision"("entryId", "revision") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Approved numeric exponents from SIX ISO4217 List One (2026-09-17), SHA256
-- 33139b438657d1cee116ba737807ea71d19d6de4b90f799a09c56f0cc6a1b0ff.
-- Future metadata updates must retain old pairs for historical interpretation.
ALTER TABLE "MarketObservation" ADD CONSTRAINT "MarketObservation_currency_exponent_check" CHECK (
  ("minorUnitExponent" = 0 AND currency IN ('BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF')) OR
  ("minorUnitExponent" = 2 AND currency IN ('AED', 'AFN', 'ALL', 'AMD', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN', 'BAM', 'BBD', 'BDT', 'BMD', 'BND', 'BOB', 'BOV', 'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHE', 'CHF', 'CHW', 'CNY', 'COP', 'COU', 'CRC', 'CUP', 'CVE', 'CZK', 'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB', 'EUR', 'FJD', 'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GTQ', 'GYD', 'HKD', 'HNL', 'HTG', 'HUF', 'IDR', 'ILS', 'INR', 'IRR', 'JMD', 'KES', 'KGS', 'KHR', 'KPW', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MXV', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'QAR', 'RON', 'RSD', 'RUB', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL', 'THB', 'TJS', 'TMT', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'USD', 'USN', 'UYU', 'UZS', 'VED', 'VES', 'WST', 'XAD', 'XCD', 'XCG', 'YER', 'ZAR', 'ZMW', 'ZWG')) OR
  ("minorUnitExponent" = 3 AND currency IN ('BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND')) OR
  ("minorUnitExponent" = 4 AND currency IN ('CLF', 'UYW'))
);

-- Immutable event/product identity is distinct from a durable recurring poll identity.
-- UTF-8 and JSONB size bounds below keep the entire B-tree tuple below the index limit.
CREATE UNIQUE INDEX "MarketObservation_event_identity" ON "MarketObservation"
  ("providerId","externalId","eventId","sourceMetric",kind,currency,qualifiers) WHERE "identityMode"='EVENT';
CREATE UNIQUE INDEX "MarketObservation_poll_identity" ON "MarketObservation"
  ("providerId","pollId","externalId","sourceMetric",kind,currency,qualifiers) WHERE "identityMode"='POLL';

CREATE FUNCTION market_short_text(value text, max_bytes integer) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT octet_length(value) BETWEEN 1 AND max_bytes
    AND value !~ ('[' || chr(1) || '-' || chr(31) || chr(127) || ']')
$$;
CREATE FUNCTION market_qualifiers_valid(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE pair record; count_keys integer := 0;
BEGIN
  IF jsonb_typeof(value)<>'object' OR octet_length(value::text)>1024 THEN RETURN false; END IF;
  FOR pair IN SELECT * FROM jsonb_each(value) LOOP
    count_keys:=count_keys+1;
    IF count_keys>16 OR pair.key !~ '^[A-Za-z][A-Za-z0-9_.:-]{0,63}$' THEN RETURN false; END IF;
    IF jsonb_typeof(pair.value)='string' THEN
      IF NOT market_short_text(pair.value #>> '{}',128) THEN RETURN false; END IF;
    ELSIF jsonb_typeof(pair.value)<>'boolean' THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;
CREATE FUNCTION market_confidence_valid(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE pair record; count_keys integer := 0; raw text;
BEGIN
  IF jsonb_typeof(value)<>'object' OR value='{}'::jsonb THEN RETURN false; END IF;
  FOR pair IN SELECT * FROM jsonb_each(value) LOOP
    count_keys:=count_keys+1;
    IF count_keys>3 THEN RETURN false; END IF;
    raw:=pair.value #>> '{}';
    IF pair.key='sampleSize' THEN
      IF jsonb_typeof(pair.value)<>'number' THEN RETURN false; END IF;
      IF raw::numeric<0 OR raw::numeric>2147483647 OR trunc(raw::numeric)<>raw::numeric THEN RETURN false; END IF;
    ELSIF pair.key='sourceLabel' THEN
      IF jsonb_typeof(pair.value)<>'string' OR NOT market_short_text(raw,128) THEN RETURN false; END IF;
    ELSIF pair.key='methodology' THEN
      IF jsonb_typeof(pair.value)<>'string' OR octet_length(raw) NOT BETWEEN 1 AND 512
        OR raw ~ ('['||chr(1)||'-'||chr(8)||chr(11)||chr(12)||chr(14)||'-'||chr(31)||chr(127)||']') THEN RETURN false; END IF;
    ELSE RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;
ALTER TABLE "MarketObservation" ADD CONSTRAINT "MarketObservation_identity_check" CHECK (
  ("identityMode"='EVENT' AND "eventId" IS NOT NULL AND "pollId" IS NULL AND market_short_text("eventId",256)) OR
  ("identityMode"='POLL' AND "eventId" IS NULL AND "pollId" IS NOT NULL)
);
ALTER TABLE "MarketObservation" ADD CONSTRAINT "MarketObservation_amount_check" CHECK (
  (kind='PRICE_RANGE' AND "amountMinor" IS NULL AND "lowMinor" IS NOT NULL AND "highMinor" IS NOT NULL AND "lowMinor">=0 AND "highMinor">="lowMinor") OR
  (kind<>'PRICE_RANGE' AND "amountMinor" IS NOT NULL AND "amountMinor">=0 AND "lowMinor" IS NULL AND "highMinor" IS NULL)
);
ALTER TABLE "MarketObservation" ADD CONSTRAINT "MarketObservation_strings_check" CHECK (
  "providerId" ~ '^[a-z][a-z0-9_-]{0,63}$' AND "sourceMetric" ~ '^[a-z][a-z0-9_.:-]{0,63}$'
  AND market_short_text("externalId",256)
  AND "identifierNamespace" ~ '^[a-z][a-z0-9_]{0,63}$' AND "identifierType" ~ '^[a-z][a-z0-9_]{0,63}$'
  AND "catalogRevision">0 AND market_qualifiers_valid(qualifiers)
  AND (confidence IS NULL OR market_confidence_valid(confidence))
  AND ("sourceReference" IS NULL OR market_short_text("sourceReference",512))
  AND ("sourceUrl" IS NULL OR (market_short_text("sourceUrl",2048) AND "sourceUrl" ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[^?#]*)?$'))
  AND octet_length(jsonb_build_object('qualifiers',qualifiers,'confidence',confidence,'sourceUrl',"sourceUrl",'sourceReference',"sourceReference")::text)<=4096
);
ALTER TABLE "MarketObservation" ADD CONSTRAINT "MarketObservation_time_check" CHECK (
  isfinite("observedAt") AND isfinite("fetchedAt") AND isfinite("createdAt")
  AND "observedAt">='0001-01-01T00:00:00Z'::timestamptz AND "createdAt"<'10000-01-01T00:00:00Z'::timestamptz
  AND "observedAt"<="fetchedAt" AND "fetchedAt"<="createdAt"
  AND ("observedBasis"<>'FETCH' OR ("observedPrecision"='MILLISECOND' AND "observedAt"="fetchedAt"))
  AND ("observedPrecision"<>'DAY' OR ("observedBasis"='SOURCE' AND "observedAt" AT TIME ZONE 'UTC'=date_trunc('day',"observedAt" AT TIME ZONE 'UTC')))
  AND ("observedPrecision"<>'SECOND' OR ("observedBasis"='SOURCE' AND "observedAt"=date_trunc('second',"observedAt")))
);

CREATE FUNCTION validate_market_catalog_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_revision integer; state jsonb;
BEGIN
  -- Same lock order as canonical maintenance and personal catalog linking; never lock private rows.
  SELECT revision INTO current_revision FROM "CatalogEntry" WHERE id=NEW."entryId" FOR SHARE;
  IF current_revision IS NULL OR current_revision<>NEW."catalogRevision" THEN
    RAISE EXCEPTION 'Stale market catalog revision' USING ERRCODE='23514';
  END IF;
  IF NEW."variantId" IS NOT NULL THEN
    PERFORM id FROM "CatalogVariant" WHERE id=NEW."variantId" AND "entryId"=NEW."entryId" AND active FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid market variant' USING ERRCODE='23514'; END IF;
  END IF;
  SELECT snapshot INTO state FROM "CatalogRevision" WHERE "entryId"=NEW."entryId" AND revision=NEW."catalogRevision";
  IF state IS NULL OR state->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR state->>'id' IS DISTINCT FROM NEW."entryId"::text
    OR jsonb_typeof(state->'variants') IS DISTINCT FROM 'array' OR jsonb_typeof(state->'identifiers') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Unsupported market catalog snapshot' USING ERRCODE='23514';
  END IF;
  IF NEW."variantId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(state->'variants') v WHERE v->>'id'=NEW."variantId"::text) THEN
    RAISE EXCEPTION 'Variant missing from market catalog snapshot' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM "CatalogExternalIdentifier" i WHERE i.id=NEW."identifierId" AND i."entryId"=NEW."entryId"
    AND i."variantId" IS NOT DISTINCT FROM NEW."variantId" AND i.active AND i.namespace=NEW."identifierNamespace" AND i.type=NEW."identifierType" AND i.value=NEW."externalId")
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(state->'identifiers') i WHERE i->>'id'=NEW."identifierId"::text
    AND i->>'variantId' IS NOT DISTINCT FROM NEW."variantId"::text AND i->>'namespace'=NEW."identifierNamespace" AND i->>'type'=NEW."identifierType" AND i->>'value'=NEW."externalId") THEN
    RAISE EXCEPTION 'Invalid market identifier binding' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "MarketObservation_catalog_insert" BEFORE INSERT ON "MarketObservation"
FOR EACH ROW EXECUTE FUNCTION validate_market_catalog_insert();
CREATE FUNCTION reject_market_observation_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Market observations are append-only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER "MarketObservation_immutable_update" BEFORE UPDATE ON "MarketObservation"
FOR EACH ROW EXECUTE FUNCTION reject_market_observation_update();
-- No DELETE trigger: trusted fixture cleanup and authorized provider-scoped license purge remain possible.
