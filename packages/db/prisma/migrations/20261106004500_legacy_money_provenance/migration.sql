-- Additive provenance only: existing raw values and snapshots remain untouched.
-- Personal event parent FKs defer final checks to survive combined actor SET NULL
-- and item/definition cascades. INSERT guards still require actual parent rows.
ALTER TABLE "CollectibleItem" ADD COLUMN "purchaseMoneyGeneration" UUID;
ALTER TABLE "CustomFieldValue" ADD COLUMN "moneyGeneration" UUID;
ALTER TABLE "CatalogProposal" ADD COLUMN "moneyInterpretation" JSONB;
ALTER TABLE "CatalogRollbackAudit" ADD COLUMN "moneyInterpretation" JSONB;
CREATE TYPE "MoneyInterpretationOperation" AS ENUM ('BASELINE','RAW_WRITE','CLEAR','AUTHOR','CLASSIFY','COPY','REVOKE');
CREATE TYPE "MoneyEvidenceCategory" AS ENUM ('OWNER_ATTESTATION','OPERATOR_VERIFIED_RECORD');

CREATE TABLE "PurchaseMoneyInterpretationEvent" (
  "itemId" UUID NOT NULL REFERENCES "CollectibleItem"(id) ON DELETE CASCADE ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  generation UUID NOT NULL,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence BIGINT NOT NULL CHECK (sequence > 0),
  operation "MoneyInterpretationOperation" NOT NULL,
  "rawAmountMinor" BIGINT,
  "rawCurrency" CHAR(3),
  exponent SMALLINT CHECK (exponent BETWEEN 0 AND 9),
  "unitKey" VARCHAR(128),
  "unitLabel" VARCHAR(120),
  "basisId" VARCHAR(80),
  receipt JSONB,
  "sourceEventId" UUID,
  "originEventId" UUID,
  "revokedAssertionId" UUID UNIQUE,
  "actorId" TEXT REFERENCES "user"(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  "evidenceCategory" "MoneyEvidenceCategory",
  "evidenceReference" VARCHAR(200),
  reason VARCHAR(1000),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "evidenceErasedAt" TIMESTAMPTZ(3),
  CONSTRAINT "PurchaseMoneyInterpretationEvent_raw_check" CHECK (
    ("rawAmountMinor" IS NULL) = ("rawCurrency" IS NULL) AND
    ("rawAmountMinor" IS NULL OR ("rawAmountMinor" BETWEEN 0 AND 9007199254740991 AND "rawCurrency" ~ '^[A-Z]{3}$' COLLATE pg_catalog."C")) AND
    ((operation='CLEAR') = ("rawAmountMinor" IS NULL))
  ),
  CONSTRAINT "PurchaseMoneyInterpretationEvent_meaning_check" CHECK (
    CASE WHEN operation IN ('AUTHOR','CLASSIFY','COPY') THEN
      exponent IS NOT NULL AND "unitKey" IS NOT NULL AND "basisId" IS NOT NULL AND
      ("unitKey" ~ '^iso4217-2026-09-17:[A-Z]{3}$' COLLATE pg_catalog."C" OR "unitKey" ~ '^unsupported:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' COLLATE pg_catalog."C") AND
      CASE WHEN "unitKey" LIKE 'unsupported:%' THEN "unitLabel" IS NOT NULL AND char_length(btrim("unitLabel"))>0 ELSE "unitLabel" IS NULL END
    ELSE exponent IS NULL AND "unitKey" IS NULL AND "unitLabel" IS NULL AND "basisId" IS NULL END
  ),
  CONSTRAINT "PurchaseMoneyInterpretationEvent_receipt_check" CHECK (
    CASE WHEN operation='AUTHOR' THEN receipt IS NOT NULL AND jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=2048 ELSE receipt IS NULL END
  ),
  CONSTRAINT "PurchaseMoneyInterpretationEvent_time_check" CHECK (isfinite("createdAt") AND ("evidenceErasedAt" IS NULL OR isfinite("evidenceErasedAt"))),
  CONSTRAINT "PurchaseMoneyInterpretationEvent_sequence_key" UNIQUE ("itemId",sequence),
  CONSTRAINT "PurchaseMoneyInterpretationEvent_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "PurchaseMoneyInterpretationEvent"(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT "PurchaseMoneyInterpretationEvent_originEventId_fkey" FOREIGN KEY ("originEventId") REFERENCES "PurchaseMoneyInterpretationEvent"(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT "PurchaseMoneyInterpretationEvent_revokedAssertionId_fkey" FOREIGN KEY ("revokedAssertionId") REFERENCES "PurchaseMoneyInterpretationEvent"(id) ON DELETE SET NULL ON UPDATE RESTRICT
);
CREATE INDEX "PurchaseMoneyInterpretationEvent_latest_idx" ON "PurchaseMoneyInterpretationEvent" ("itemId",generation,sequence DESC);
CREATE INDEX "PurchaseMoneyInterpretationEvent_sourceEventId_idx" ON "PurchaseMoneyInterpretationEvent" ("sourceEventId");
CREATE INDEX "PurchaseMoneyInterpretationEvent_originEventId_idx" ON "PurchaseMoneyInterpretationEvent" ("originEventId");
CREATE INDEX "PurchaseMoneyInterpretationEvent_actorId_idx" ON "PurchaseMoneyInterpretationEvent" ("actorId");

CREATE TABLE "CustomMoneyInterpretationEvent" (
  "itemId" UUID NOT NULL REFERENCES "CollectibleItem"(id) ON DELETE CASCADE ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  "fieldDefinitionId" UUID NOT NULL REFERENCES "CustomFieldDefinition"(id) ON DELETE CASCADE ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  generation UUID NOT NULL,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence BIGINT NOT NULL CHECK (sequence > 0),
  operation "MoneyInterpretationOperation" NOT NULL,
  "rawAmountMinor" BIGINT,
  "rawCurrency" CHAR(3),
  exponent SMALLINT CHECK (exponent BETWEEN 0 AND 9),
  "unitKey" VARCHAR(128),
  "unitLabel" VARCHAR(120),
  "basisId" VARCHAR(80),
  receipt JSONB,
  "sourceEventId" UUID,
  "originEventId" UUID,
  "revokedAssertionId" UUID UNIQUE,
  "actorId" TEXT REFERENCES "user"(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  "evidenceCategory" "MoneyEvidenceCategory",
  "evidenceReference" VARCHAR(200),
  reason VARCHAR(1000),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "evidenceErasedAt" TIMESTAMPTZ(3),
  CONSTRAINT "CustomMoneyInterpretationEvent_raw_check" CHECK (
    ("rawAmountMinor" IS NULL) = ("rawCurrency" IS NULL) AND
    ("rawAmountMinor" IS NULL OR ("rawAmountMinor" BETWEEN 0 AND 9007199254740991 AND "rawCurrency" ~ '^[A-Z]{3}$' COLLATE pg_catalog."C")) AND
    ((operation='CLEAR') = ("rawAmountMinor" IS NULL))
  ),
  CONSTRAINT "CustomMoneyInterpretationEvent_meaning_check" CHECK (
    CASE WHEN operation IN ('AUTHOR','CLASSIFY','COPY') THEN
      exponent IS NOT NULL AND "unitKey" IS NOT NULL AND "basisId" IS NOT NULL AND
      ("unitKey" ~ '^iso4217-2026-09-17:[A-Z]{3}$' COLLATE pg_catalog."C" OR "unitKey" ~ '^unsupported:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' COLLATE pg_catalog."C") AND
      CASE WHEN "unitKey" LIKE 'unsupported:%' THEN "unitLabel" IS NOT NULL AND char_length(btrim("unitLabel"))>0 ELSE "unitLabel" IS NULL END
    ELSE exponent IS NULL AND "unitKey" IS NULL AND "unitLabel" IS NULL AND "basisId" IS NULL END
  ),
  CONSTRAINT "CustomMoneyInterpretationEvent_receipt_check" CHECK (
    CASE WHEN operation='AUTHOR' THEN receipt IS NOT NULL AND jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=2048 ELSE receipt IS NULL END
  ),
  CONSTRAINT "CustomMoneyInterpretationEvent_time_check" CHECK (isfinite("createdAt") AND ("evidenceErasedAt" IS NULL OR isfinite("evidenceErasedAt"))),
  CONSTRAINT "CustomMoneyInterpretationEvent_sequence_key" UNIQUE ("itemId","fieldDefinitionId",sequence),
  CONSTRAINT "CustomMoneyInterpretationEvent_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "CustomMoneyInterpretationEvent"(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT "CustomMoneyInterpretationEvent_originEventId_fkey" FOREIGN KEY ("originEventId") REFERENCES "CustomMoneyInterpretationEvent"(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT "CustomMoneyInterpretationEvent_revokedAssertionId_fkey" FOREIGN KEY ("revokedAssertionId") REFERENCES "CustomMoneyInterpretationEvent"(id) ON DELETE SET NULL ON UPDATE RESTRICT
);
CREATE INDEX "CustomMoneyInterpretationEvent_latest_idx" ON "CustomMoneyInterpretationEvent" ("itemId","fieldDefinitionId",generation,sequence DESC);
CREATE INDEX "CustomMoneyInterpretationEvent_sourceEventId_idx" ON "CustomMoneyInterpretationEvent" ("sourceEventId");
CREATE INDEX "CustomMoneyInterpretationEvent_originEventId_idx" ON "CustomMoneyInterpretationEvent" ("originEventId");
CREATE INDEX "CustomMoneyInterpretationEvent_actorId_idx" ON "CustomMoneyInterpretationEvent" ("actorId");

CREATE TABLE "CatalogMoneyInterpretationEvent" (
  "entryId" UUID NOT NULL,
  revision INTEGER NOT NULL,
  "targetKey" VARCHAR(36) NOT NULL,
  "variantId" UUID,
  "definitionId" UUID NOT NULL REFERENCES "CatalogAttributeDefinition"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence BIGINT NOT NULL CHECK (sequence > 0),
  operation "MoneyInterpretationOperation" NOT NULL,
  "rawAmountMinor" BIGINT,
  "rawCurrency" CHAR(3),
  exponent SMALLINT CHECK (exponent BETWEEN 0 AND 9),
  "unitKey" VARCHAR(128),
  "unitLabel" VARCHAR(120),
  "basisId" VARCHAR(80),
  receipt JSONB,
  "sourceEventId" UUID,
  "originEventId" UUID,
  "revokedAssertionId" UUID UNIQUE,
  "actorId" TEXT REFERENCES "user"(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  "evidenceCategory" "MoneyEvidenceCategory",
  "evidenceReference" VARCHAR(200),
  reason VARCHAR(1000),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "evidenceErasedAt" TIMESTAMPTZ(3),
  CONSTRAINT "CatalogMoneyInterpretationEvent_raw_check" CHECK (
    ("rawAmountMinor" IS NULL) = ("rawCurrency" IS NULL) AND
    ("rawAmountMinor" IS NULL OR ("rawAmountMinor" BETWEEN 0 AND 9007199254740991 AND "rawCurrency" ~ '^[A-Z]{3}$' COLLATE pg_catalog."C")) AND
    ((operation='CLEAR') = ("rawAmountMinor" IS NULL))
  ),
  CONSTRAINT "CatalogMoneyInterpretationEvent_meaning_check" CHECK (
    CASE WHEN operation IN ('AUTHOR','CLASSIFY','COPY') THEN
      exponent IS NOT NULL AND "unitKey" IS NOT NULL AND "basisId" IS NOT NULL AND
      ("unitKey" ~ '^iso4217-2026-09-17:[A-Z]{3}$' COLLATE pg_catalog."C" OR "unitKey" ~ '^unsupported:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' COLLATE pg_catalog."C") AND
      CASE WHEN "unitKey" LIKE 'unsupported:%' THEN "unitLabel" IS NOT NULL AND char_length(btrim("unitLabel"))>0 ELSE "unitLabel" IS NULL END
    ELSE exponent IS NULL AND "unitKey" IS NULL AND "unitLabel" IS NULL AND "basisId" IS NULL END
  ),
  CONSTRAINT "CatalogMoneyInterpretationEvent_receipt_check" CHECK (
    CASE WHEN operation='AUTHOR' THEN receipt IS NOT NULL AND jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=2048 ELSE receipt IS NULL END
  ),
  CONSTRAINT "CatalogMoneyInterpretationEvent_time_check" CHECK (isfinite("createdAt") AND ("evidenceErasedAt" IS NULL OR isfinite("evidenceErasedAt"))),
  CONSTRAINT "CatalogMoneyInterpretationEvent_sequence_key" UNIQUE ("entryId",revision,"targetKey","definitionId",sequence),
  CONSTRAINT "CatalogMoneyInterpretationEvent_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "CatalogMoneyInterpretationEvent"(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT "CatalogMoneyInterpretationEvent_originEventId_fkey" FOREIGN KEY ("originEventId") REFERENCES "CatalogMoneyInterpretationEvent"(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT "CatalogMoneyInterpretationEvent_revokedAssertionId_fkey" FOREIGN KEY ("revokedAssertionId") REFERENCES "CatalogMoneyInterpretationEvent"(id) ON DELETE SET NULL ON UPDATE RESTRICT
, CONSTRAINT "CatalogMoneyInterpretationEvent_revision_fkey" FOREIGN KEY ("entryId",revision) REFERENCES "CatalogRevision"("entryId",revision) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "CatalogMoneyInterpretationEvent_target_check" CHECK (("variantId" IS NULL AND "targetKey"='entry') OR ("variantId" IS NOT NULL AND "targetKey"="variantId"::text))
);
CREATE INDEX "CatalogMoneyInterpretationEvent_sourceEventId_idx" ON "CatalogMoneyInterpretationEvent" ("sourceEventId");
CREATE INDEX "CatalogMoneyInterpretationEvent_originEventId_idx" ON "CatalogMoneyInterpretationEvent" ("originEventId");
CREATE INDEX "CatalogMoneyInterpretationEvent_actorId_idx" ON "CatalogMoneyInterpretationEvent" ("actorId");

-- Fixed-family trigger: identifiers come only from the trigger's own schema/table.
-- End-user authorization remains in the server store; a DB operator is trusted.
CREATE FUNCTION legacy_money_event_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE
  d jsonb; oldd jsonb; parent jsonb; current_value jsonb; snapshot jsonb; attrs jsonb; matches jsonb;
  source jsonb; origin jsonb; predicate text; family text; k text; present boolean;
  amount bigint; currency text; current_generation uuid; expected_sequence bigint;
  metadata_changed boolean := false; redaction boolean := false; actor_gone boolean := false;
  allowed text[] := ARRAY['actorId','evidenceReference','reason','evidenceErasedAt','sourceEventId','originEventId','revokedAssertionId'];
BEGIN
  IF TG_TABLE_NAME='PurchaseMoneyInterpretationEvent' THEN family:='PURCHASE';
  ELSIF TG_TABLE_NAME='CustomMoneyInterpretationEvent' THEN family:='CUSTOM';
  ELSIF TG_TABLE_NAME='CatalogMoneyInterpretationEvent' THEN family:='CATALOG';
  ELSE RAISE EXCEPTION 'Invalid money event family' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN
    IF family='CATALOG' THEN RAISE EXCEPTION 'Money history is immutable' USING ERRCODE='23514'; END IF;
    oldd:=to_jsonb(OLD);
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."CollectibleItem" WHERE id=($1->>''itemId'')::uuid)',TG_TABLE_SCHEMA) INTO present USING oldd;
    IF NOT present THEN RETURN OLD; END IF;
    IF family='CUSTOM' THEN
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."CustomFieldDefinition" WHERE id=($1->>''fieldDefinitionId'')::uuid)',TG_TABLE_SCHEMA) INTO present USING oldd;
      IF NOT present THEN RETURN OLD; END IF;
    END IF;
    RAISE EXCEPTION 'Money history is immutable' USING ERRCODE='23514';
  END IF;
  d:=to_jsonb(NEW);
  IF TG_OP='UPDATE' THEN
    oldd:=to_jsonb(OLD);
    IF (d-allowed) IS DISTINCT FROM (oldd-allowed) THEN RAISE EXCEPTION 'Money facts are immutable' USING ERRCODE='23514'; END IF;
    IF OLD."actorId" IS NOT NULL AND NEW."actorId" IS NULL THEN
      EXECUTE format('SELECT NOT EXISTS(SELECT 1 FROM %I."user" WHERE id=$1)',TG_TABLE_SCHEMA) INTO actor_gone USING OLD."actorId";
      IF actor_gone AND OLD.operation='CLASSIFY' AND OLD."evidenceErasedAt" IS NULL THEN
        NEW."evidenceReference":=NULL; NEW.reason:=NULL; NEW."evidenceErasedAt":=transaction_timestamp()::timestamptz(3);
      END IF;
    END IF;
    d:=to_jsonb(NEW);
    redaction:=OLD."evidenceErasedAt" IS NULL AND NEW."evidenceErasedAt"=transaction_timestamp()::timestamptz(3)
      AND NEW."actorId" IS NULL AND NEW."evidenceReference" IS NULL AND NEW.reason IS NULL
      AND (OLD."actorId" IS NOT NULL OR OLD."evidenceReference" IS NOT NULL OR OLD.reason IS NOT NULL);
    IF redaction THEN metadata_changed:=true;
    ELSE
      IF NEW."evidenceErasedAt" IS DISTINCT FROM OLD."evidenceErasedAt" OR NEW."evidenceReference" IS DISTINCT FROM OLD."evidenceReference" OR NEW.reason IS DISTINCT FROM OLD.reason THEN
        RAISE EXCEPTION 'Invalid money evidence transition' USING ERRCODE='23514';
      END IF;
      IF NEW."actorId" IS DISTINCT FROM OLD."actorId" THEN
        IF OLD."actorId" IS NULL OR NEW."actorId" IS NOT NULL OR (OLD.operation<>'AUTHOR' AND NOT actor_gone) THEN
          RAISE EXCEPTION 'Invalid money actor transition' USING ERRCODE='23514';
        END IF;
        metadata_changed:=true;
      END IF;
    END IF;
    FOREACH k IN ARRAY ARRAY['sourceEventId','originEventId','revokedAssertionId'] LOOP
      IF (d->k) IS DISTINCT FROM (oldd->k) THEN
        IF oldd->>k IS NULL OR d->>k IS NOT NULL THEN RAISE EXCEPTION 'Invalid money lineage transition' USING ERRCODE='23514'; END IF;
        EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE id=$1::uuid)',TG_TABLE_SCHEMA,TG_TABLE_NAME) INTO present USING oldd->>k;
        IF present THEN RAISE EXCEPTION 'Live money lineage cannot be removed' USING ERRCODE='23514'; END IF;
        metadata_changed:=true;
      END IF;
    END LOOP;
    IF NOT metadata_changed THEN RAISE EXCEPTION 'Money history is immutable' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;

  IF NEW."evidenceErasedAt" IS NOT NULL THEN RAISE EXCEPTION 'New evidence cannot be erased' USING ERRCODE='23514'; END IF;
  IF family IN ('PURCHASE','CUSTOM') THEN
    EXECUTE format('SELECT to_jsonb(i) FROM %I."CollectibleItem" i WHERE id=($1->>''itemId'')::uuid FOR UPDATE',TG_TABLE_SCHEMA) INTO parent USING d;
    IF parent IS NULL THEN RAISE EXCEPTION 'Money subject missing' USING ERRCODE='23514'; END IF;
    predicate:='"itemId"=($1->>''itemId'')::uuid';
    IF family='CUSTOM' THEN predicate:=predicate||' AND "fieldDefinitionId"=($1->>''fieldDefinitionId'')::uuid'; END IF;
    IF NEW.operation IN ('AUTHOR','CLASSIFY','COPY','REVOKE') AND NEW."actorId" IS DISTINCT FROM parent->>'ownerId' THEN
      RAISE EXCEPTION 'Money actor does not own subject' USING ERRCODE='23514';
    END IF;
  ELSE
    EXECUTE format('SELECT to_jsonb(e) FROM %I."CatalogEntry" e WHERE id=($1->>''entryId'')::uuid FOR UPDATE',TG_TABLE_SCHEMA) INTO parent USING d;
    IF parent IS NULL THEN RAISE EXCEPTION 'Money subject missing' USING ERRCODE='23514'; END IF;
    predicate:='"entryId"=($1->>''entryId'')::uuid AND revision=($1->>''revision'')::integer AND "targetKey"=$1->>''targetKey'' AND "definitionId"=($1->>''definitionId'')::uuid';
    IF NEW.operation IN ('AUTHOR','CLASSIFY','COPY','REVOKE') AND NEW."actorId" IS NULL THEN RAISE EXCEPTION 'Money actor required' USING ERRCODE='23514'; END IF;
  END IF;
  -- A row lock alone does not advance an already established RepeatableRead snapshot.
  -- Metadata assertions must also update the parent's MVCC version (no value change),
  -- so a waiter retries with a fresh snapshot instead of racing the append-only sequence.
  -- Raw purchase writes already update their parent; do not touch it from BASELINE's
  -- BEFORE trigger. Custom raw writes update their parent separately below.
  IF NEW.operation IN ('AUTHOR','CLASSIFY','COPY','REVOKE') THEN
    IF family='CATALOG' THEN
      EXECUTE format('UPDATE %I."CatalogEntry" SET id=id WHERE id=($1->>''entryId'')::uuid',TG_TABLE_SCHEMA) USING d;
    ELSE
      EXECUTE format('UPDATE %I."CollectibleItem" SET id=id WHERE id=($1->>''itemId'')::uuid',TG_TABLE_SCHEMA) USING d;
    END IF;
  END IF;
  EXECUTE format('SELECT COALESCE(MAX(sequence),0)+1 FROM %I.%I WHERE %s',TG_TABLE_SCHEMA,TG_TABLE_NAME,predicate) INTO expected_sequence USING d;
  IF NEW.sequence IS DISTINCT FROM expected_sequence THEN RAISE EXCEPTION 'Invalid money sequence' USING ERRCODE='23514'; END IF;

  IF NEW.operation='REVOKE' THEN
    EXECUTE format('SELECT to_jsonb(e) FROM %I.%I e WHERE id=$1',TG_TABLE_SCHEMA,TG_TABLE_NAME) INTO origin USING NEW."revokedAssertionId";
    IF origin IS NULL OR origin->>'operation' NOT IN ('AUTHOR','CLASSIFY') OR NEW.reason IS NULL OR char_length(btrim(NEW.reason))=0 THEN
      RAISE EXCEPTION 'Invalid money revocation' USING ERRCODE='23514';
    END IF;
    IF family='CATALOG' THEN
      IF (d->'entryId',d->'revision',d->'targetKey',d->'definitionId') IS DISTINCT FROM (origin->'entryId',origin->'revision',origin->'targetKey',origin->'definitionId') THEN RAISE EXCEPTION 'Wrong revocation subject' USING ERRCODE='23514'; END IF;
    ELSIF (d->'itemId',d->'generation') IS DISTINCT FROM (origin->'itemId',origin->'generation') OR (family='CUSTOM' AND d->'fieldDefinitionId' IS DISTINCT FROM origin->'fieldDefinitionId') THEN
      RAISE EXCEPTION 'Wrong revocation subject' USING ERRCODE='23514';
    END IF;
    IF (d->'rawAmountMinor',d->'rawCurrency') IS DISTINCT FROM (origin->'rawAmountMinor',origin->'rawCurrency') OR NEW."sourceEventId" IS NOT NULL OR NEW."originEventId" IS NOT NULL OR NEW."evidenceCategory" IS NOT NULL OR NEW."evidenceReference" IS NOT NULL THEN
      RAISE EXCEPTION 'Invalid revocation content' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."revokedAssertionId" IS NOT NULL THEN RAISE EXCEPTION 'Unexpected revocation target' USING ERRCODE='23514'; END IF;

  IF family='PURCHASE' THEN
    amount:=(parent->>'purchaseAmountMinor')::bigint; currency:=parent->>'purchaseCurrency';
    current_generation:=(parent->>'purchaseMoneyGeneration')::uuid;
    IF current_generation IS NULL AND amount IS NOT NULL THEN current_generation:='00000000-0000-0000-0000-000000000000'::uuid; END IF;
  ELSIF family='CUSTOM' THEN
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."CustomFieldDefinition" f WHERE f.id=($1->>''fieldDefinitionId'')::uuid AND f.type=''MONEY'' AND f."collectionId"=($2->>''collectionId'')::uuid)',TG_TABLE_SCHEMA) INTO present USING d,parent;
    IF NOT present THEN RAISE EXCEPTION 'Invalid custom money subject' USING ERRCODE='23514'; END IF;
    EXECUTE format('SELECT to_jsonb(v) FROM %I."CustomFieldValue" v WHERE v."itemId"=($1->>''itemId'')::uuid AND v."fieldDefinitionId"=($1->>''fieldDefinitionId'')::uuid',TG_TABLE_SCHEMA) INTO current_value USING d;
    amount:=(current_value->>'moneyAmountMinor')::bigint; currency:=current_value->>'moneyCurrency';
    current_generation:=(current_value->>'moneyGeneration')::uuid;
    IF current_generation IS NULL AND amount IS NOT NULL THEN current_generation:='00000000-0000-0000-0000-000000000000'::uuid; END IF;
    IF current_value IS NULL AND NEW.operation='CLEAR' THEN current_generation:=NEW.generation; END IF;
  ELSE
    EXECUTE format('SELECT snapshot FROM %I."CatalogRevision" WHERE "entryId"=($1->>''entryId'')::uuid AND revision=($1->>''revision'')::integer',TG_TABLE_SCHEMA) INTO snapshot USING d;
    IF snapshot IS NULL THEN RAISE EXCEPTION 'Invalid catalog money revision' USING ERRCODE='23514'; END IF;
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."CatalogAttributeDefinition" f WHERE f.id=($1->>''definitionId'')::uuid AND f.type=''MONEY'' AND f."categoryTemplateId"=($2->>''categoryTemplateId'')::uuid)',TG_TABLE_SCHEMA) INTO present USING d,parent;
    IF NOT present THEN RAISE EXCEPTION 'Invalid catalog money definition' USING ERRCODE='23514'; END IF;
    IF NEW."variantId" IS NULL THEN attrs:=snapshot->'attributes';
    ELSE
      IF jsonb_typeof(snapshot->'variants') IS DISTINCT FROM 'array' OR jsonb_array_length(snapshot->'variants')>100 THEN RAISE EXCEPTION 'Invalid catalog variants' USING ERRCODE='23514'; END IF;
      SELECT jsonb_agg(v) INTO matches FROM jsonb_array_elements(snapshot->'variants') v WHERE v->>'id'=NEW."variantId"::text;
      IF jsonb_array_length(matches) IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Invalid catalog target' USING ERRCODE='23514'; END IF;
      attrs:=matches->0->'attributes';
    END IF;
    IF jsonb_typeof(attrs) IS DISTINCT FROM 'array' OR jsonb_array_length(attrs)>100 THEN RAISE EXCEPTION 'Invalid catalog attributes' USING ERRCODE='23514'; END IF;
    SELECT jsonb_agg(v) INTO matches FROM jsonb_array_elements(attrs) v WHERE v->>'definitionId'=NEW."definitionId"::text;
    IF jsonb_array_length(matches) IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Invalid catalog money path' USING ERRCODE='23514'; END IF;
    current_value:=matches->0;
    IF current_value->>'type' IS DISTINCT FROM 'MONEY' OR jsonb_typeof(current_value->'value') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid catalog money type' USING ERRCODE='23514'; END IF;
    current_value:=current_value->'value';
    IF (SELECT count(*) FROM jsonb_object_keys(current_value))<>2 OR jsonb_typeof(current_value->'amountMinor') IS DISTINCT FROM 'number' OR jsonb_typeof(current_value->'currency') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid catalog money value' USING ERRCODE='23514'; END IF;
    IF octet_length(current_value->>'amountMinor')>32 OR current_value->>'amountMinor' !~ '^[0-9]+(\.0+)?$' COLLATE pg_catalog."C" THEN RAISE EXCEPTION 'Invalid catalog raw amount' USING ERRCODE='23514'; END IF;
    IF (current_value->>'amountMinor')::numeric>9007199254740991 THEN RAISE EXCEPTION 'Invalid catalog raw amount' USING ERRCODE='23514'; END IF;
    amount:=(current_value->>'amountMinor')::numeric::bigint; currency:=current_value->>'currency';
  END IF;
  IF NEW."rawAmountMinor" IS DISTINCT FROM amount OR NEW."rawCurrency" IS DISTINCT FROM currency OR (family<>'CATALOG' AND (d->>'generation')::uuid IS DISTINCT FROM current_generation) THEN
    RAISE EXCEPTION 'Money event does not match raw fact' USING ERRCODE='23514';
  END IF;

  IF NEW.operation IN ('BASELINE','RAW_WRITE','CLEAR') THEN
    IF NEW."sourceEventId" IS NOT NULL OR NEW."originEventId" IS NOT NULL OR NEW."actorId" IS NOT NULL OR NEW."evidenceCategory" IS NOT NULL OR NEW."evidenceReference" IS NOT NULL OR NEW.reason IS NOT NULL THEN RAISE EXCEPTION 'Raw events carry no asserted evidence' USING ERRCODE='23514'; END IF;
  ELSIF NEW.operation='AUTHOR' THEN
    IF NEW."sourceEventId" IS NOT NULL OR NEW."originEventId" IS NOT NULL OR NEW."evidenceCategory" IS NOT NULL OR NEW."evidenceReference" IS NOT NULL OR NEW.reason IS NOT NULL OR NEW."basisId"<>'legacy-money-iso-2026-09-17-v1' OR NEW."unitKey" IS DISTINCT FROM 'iso4217-2026-09-17:'||NEW."rawCurrency" THEN RAISE EXCEPTION 'Invalid authoring event' USING ERRCODE='23514'; END IF;
    IF NEW.receipt->'schemaVersion' IS DISTINCT FROM '1'::jsonb OR NEW.receipt->>'profileId' IS DISTINCT FROM NEW."basisId" OR NEW.receipt->>'authorityHash' IS DISTINCT FROM '33139b438657d1cee116ba737807ea71d19d6de4b90f799a09c56f0cc6a1b0ff' OR NEW.receipt->>'unitKey' IS DISTINCT FROM NEW."unitKey" OR NEW.receipt->'exponent' IS DISTINCT FROM to_jsonb(NEW.exponent) OR jsonb_typeof(NEW.receipt->'raw'->'amountMinor') IS DISTINCT FROM 'string' OR NEW.receipt->'raw'->>'amountMinor' IS DISTINCT FROM NEW."rawAmountMinor"::text OR NEW.receipt->'raw'->>'currency' IS DISTINCT FROM NEW."rawCurrency" THEN RAISE EXCEPTION 'Invalid authoring receipt' USING ERRCODE='23514'; END IF;
  ELSIF NEW.operation='CLASSIFY' THEN
    IF NEW."sourceEventId" IS NOT NULL OR NEW."originEventId" IS NOT NULL OR NEW."evidenceCategory" IS NULL OR NEW.reason IS NULL OR char_length(btrim(NEW.reason))=0 OR NEW."basisId" IS DISTINCT FROM NEW."evidenceCategory"::text||':v1' THEN RAISE EXCEPTION 'Invalid classification evidence' USING ERRCODE='23514'; END IF;
    IF (NEW."evidenceCategory"='OPERATOR_VERIFIED_RECORD' AND (NEW."evidenceReference" IS NULL OR char_length(btrim(NEW."evidenceReference"))=0)) OR (family='CATALOG' AND NEW."evidenceCategory"<>'OPERATOR_VERIFIED_RECORD') THEN RAISE EXCEPTION 'Verified record required' USING ERRCODE='23514'; END IF;
    IF NEW."unitKey" IS DISTINCT FROM 'iso4217-2026-09-17:'||NEW."rawCurrency" AND NEW."unitKey" IS DISTINCT FROM 'unsupported:'||NEW.id::text THEN RAISE EXCEPTION 'Invalid declared unit' USING ERRCODE='23514'; END IF;
  ELSIF NEW.operation='COPY' THEN
    EXECUTE format('SELECT to_jsonb(e) FROM %I.%I e WHERE id=$1',TG_TABLE_SCHEMA,TG_TABLE_NAME) INTO source USING NEW."sourceEventId";
    EXECUTE format('SELECT to_jsonb(e) FROM %I.%I e WHERE id=$1',TG_TABLE_SCHEMA,TG_TABLE_NAME) INTO origin USING NEW."originEventId";
    IF source IS NULL OR origin IS NULL OR origin->>'operation' NOT IN ('AUTHOR','CLASSIFY') OR source->>'operation' NOT IN ('AUTHOR','CLASSIFY','COPY') OR COALESCE(CASE WHEN source->>'operation'='COPY' THEN source->>'originEventId' ELSE source->>'id' END,'')<>origin->>'id' THEN RAISE EXCEPTION 'Invalid flattened money origin' USING ERRCODE='23514'; END IF;
    IF (d->'rawAmountMinor',d->'rawCurrency',d->'exponent',d->'unitKey',d->'unitLabel',d->'basisId') IS DISTINCT FROM (origin->'rawAmountMinor',origin->'rawCurrency',origin->'exponent',origin->'unitKey',origin->'unitLabel',origin->'basisId') OR (d->'rawAmountMinor',d->'rawCurrency',d->'exponent',d->'unitKey',d->'unitLabel',d->'basisId') IS DISTINCT FROM (source->'rawAmountMinor',source->'rawCurrency',source->'exponent',source->'unitKey',source->'unitLabel',source->'basisId') THEN RAISE EXCEPTION 'Money copy meaning mismatch' USING ERRCODE='23514'; END IF;
    IF origin->>'operation'='CLASSIFY' AND origin->>'evidenceErasedAt' IS NOT NULL THEN RAISE EXCEPTION 'Money origin evidence erased' USING ERRCODE='23514'; END IF;
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE "revokedAssertionId"=$1)',TG_TABLE_SCHEMA,TG_TABLE_NAME) INTO present USING NEW."originEventId";
    IF present THEN RAISE EXCEPTION 'Money origin revoked' USING ERRCODE='23514'; END IF;
    IF family='CATALOG' THEN
      IF (d->'entryId',d->'targetKey',d->'definitionId') IS DISTINCT FROM (origin->'entryId',origin->'targetKey',origin->'definitionId') OR (d->'entryId',d->'targetKey',d->'definitionId') IS DISTINCT FROM (source->'entryId',source->'targetKey',source->'definitionId') THEN RAISE EXCEPTION 'Wrong catalog copy path' USING ERRCODE='23514'; END IF;
    ELSE
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."CollectibleItem" WHERE id=($1->>''itemId'')::uuid AND "ownerId"=$2)',TG_TABLE_SCHEMA) INTO present USING origin,parent->>'ownerId';
      IF NOT present THEN RAISE EXCEPTION 'Foreign money origin' USING ERRCODE='23514'; END IF;
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."CollectibleItem" WHERE id=($1->>''itemId'')::uuid AND "ownerId"=$2)',TG_TABLE_SCHEMA) INTO present USING source,parent->>'ownerId';
      IF NOT present OR (family='CUSTOM' AND (d->'fieldDefinitionId' IS DISTINCT FROM origin->'fieldDefinitionId' OR d->'fieldDefinitionId' IS DISTINCT FROM source->'fieldDefinitionId')) THEN RAISE EXCEPTION 'Foreign money source' USING ERRCODE='23514'; END IF;
    END IF;
    IF NEW."evidenceCategory" IS NOT NULL OR NEW."evidenceReference" IS NOT NULL OR NEW.reason IS NOT NULL THEN RAISE EXCEPTION 'Copies do not duplicate private evidence' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER money_event_guard BEFORE INSERT OR UPDATE OR DELETE ON "PurchaseMoneyInterpretationEvent" FOR EACH ROW EXECUTE FUNCTION legacy_money_event_guard();
CREATE TRIGGER money_event_guard BEFORE INSERT OR UPDATE OR DELETE ON "CustomMoneyInterpretationEvent" FOR EACH ROW EXECUTE FUNCTION legacy_money_event_guard();
CREATE TRIGGER money_event_guard BEFORE INSERT OR UPDATE OR DELETE ON "CatalogMoneyInterpretationEvent" FOR EACH ROW EXECUTE FUNCTION legacy_money_event_guard();

CREATE FUNCTION legacy_money_append_raw(schema_name text, family text, subject jsonb, op text, amount bigint, currency text, gen uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE tab text; predicate text;
BEGIN
  IF op NOT IN ('BASELINE','RAW_WRITE','CLEAR') THEN RAISE EXCEPTION 'Invalid raw operation' USING ERRCODE='23514'; END IF;
  IF family='PURCHASE' THEN
    tab:='PurchaseMoneyInterpretationEvent';predicate:='"itemId"=($1->>''itemId'')::uuid';
    EXECUTE format('INSERT INTO %I.%I ("itemId",generation,sequence,operation,"rawAmountMinor","rawCurrency") SELECT ($1->>''itemId'')::uuid,$2,COALESCE(MAX(sequence),0)+1,$3::%I."MoneyInterpretationOperation",$4,$5 FROM %I.%I WHERE %s',schema_name,tab,schema_name,schema_name,tab,predicate) USING subject,gen,op,amount,currency;
  ELSIF family='CUSTOM' THEN
    tab:='CustomMoneyInterpretationEvent';predicate:='"itemId"=($1->>''itemId'')::uuid AND "fieldDefinitionId"=($1->>''fieldDefinitionId'')::uuid';
    EXECUTE format('INSERT INTO %I.%I ("itemId","fieldDefinitionId",generation,sequence,operation,"rawAmountMinor","rawCurrency") SELECT ($1->>''itemId'')::uuid,($1->>''fieldDefinitionId'')::uuid,$2,COALESCE(MAX(sequence),0)+1,$3::%I."MoneyInterpretationOperation",$4,$5 FROM %I.%I WHERE %s',schema_name,tab,schema_name,schema_name,tab,predicate) USING subject,gen,op,amount,currency;
  ELSE RAISE EXCEPTION 'Invalid raw family' USING ERRCODE='23514'; END IF;
END $$;
REVOKE ALL ON FUNCTION legacy_money_append_raw(text,text,jsonb,text,bigint,text,uuid) FROM PUBLIC;

CREATE FUNCTION legacy_money_generation_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_TABLE_NAME='CollectibleItem' AND (to_jsonb(NEW)->'purchaseMoneyGeneration') IS DISTINCT FROM (to_jsonb(OLD)->'purchaseMoneyGeneration') THEN RAISE EXCEPTION 'Money generation is server assigned' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='CustomFieldValue' AND (to_jsonb(NEW)->'moneyGeneration') IS DISTINCT FROM (to_jsonb(OLD)->'moneyGeneration') THEN RAISE EXCEPTION 'Money generation is server assigned' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER money_a_generation_guard BEFORE UPDATE OF "purchaseMoneyGeneration" ON "CollectibleItem" FOR EACH ROW EXECUTE FUNCTION legacy_money_generation_guard();
CREATE TRIGGER money_a_generation_guard BEFORE UPDATE OF "moneyGeneration" ON "CustomFieldValue" FOR EACH ROW EXECUTE FUNCTION legacy_money_generation_guard();

CREATE FUNCTION legacy_money_purchase_raw() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE present boolean; subject jsonb;
BEGIN
  subject:=jsonb_build_object('itemId',NEW.id);
  IF TG_WHEN='BEFORE' THEN
    IF TG_OP='UPDATE' AND OLD."purchaseMoneyGeneration" IS NULL AND OLD."purchaseAmountMinor" IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."PurchaseMoneyInterpretationEvent" WHERE "itemId"=$1 AND generation=''00000000-0000-0000-0000-000000000000''::uuid)',TG_TABLE_SCHEMA) INTO present USING OLD.id;
      IF NOT present THEN EXECUTE format('SELECT %I.legacy_money_append_raw($1,$2,$3,$4,$5,$6,$7)',TG_TABLE_SCHEMA) USING TG_TABLE_SCHEMA,'PURCHASE',subject,'BASELINE',OLD."purchaseAmountMinor",OLD."purchaseCurrency"::text,'00000000-0000-0000-0000-000000000000'::uuid; END IF;
    END IF;
    IF TG_OP='INSERT' AND NEW."purchaseAmountMinor" IS NULL THEN NEW."purchaseMoneyGeneration":=NULL;
    ELSE NEW."purchaseMoneyGeneration":=gen_random_uuid(); END IF;
  ELSE
    IF TG_OP='INSERT' AND NEW."purchaseAmountMinor" IS NULL THEN RETURN NEW; END IF;
    EXECUTE format('SELECT %I.legacy_money_append_raw($1,$2,$3,$4,$5,$6,$7)',TG_TABLE_SCHEMA) USING TG_TABLE_SCHEMA,'PURCHASE',subject,CASE WHEN NEW."purchaseAmountMinor" IS NULL THEN 'CLEAR' ELSE 'RAW_WRITE' END,NEW."purchaseAmountMinor",NEW."purchaseCurrency"::text,NEW."purchaseMoneyGeneration";
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER money_b_purchase_rotate BEFORE INSERT OR UPDATE OF "purchaseAmountMinor","purchaseCurrency" ON "CollectibleItem" FOR EACH ROW EXECUTE FUNCTION legacy_money_purchase_raw();
CREATE TRIGGER money_c_purchase_record AFTER INSERT OR UPDATE OF "purchaseAmountMinor","purchaseCurrency" ON "CollectibleItem" FOR EACH ROW EXECUTE FUNCTION legacy_money_purchase_raw();

CREATE FUNCTION legacy_money_custom_raw() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE parent_exists boolean; definition_exists boolean; present boolean; subject jsonb; v jsonb;
BEGIN
  IF TG_OP='DELETE' THEN v:=to_jsonb(OLD); ELSE v:=to_jsonb(NEW); END IF;
  IF TG_OP='UPDATE' AND (OLD."fieldType"='MONEY' OR NEW."fieldType"='MONEY') AND (NEW."itemId",NEW."fieldDefinitionId",NEW."fieldType",NEW."collectionId") IS DISTINCT FROM (OLD."itemId",OLD."fieldDefinitionId",OLD."fieldType",OLD."collectionId") THEN RAISE EXCEPTION 'Money subject identity is immutable' USING ERRCODE='23514'; END IF;
  IF v->>'fieldType'<>'MONEY' THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    NEW."moneyGeneration":=NULL;RETURN NEW;
  END IF;
  subject:=jsonb_build_object('itemId',v->>'itemId','fieldDefinitionId',v->>'fieldDefinitionId');
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."CollectibleItem" WHERE id=($1->>''itemId'')::uuid)',TG_TABLE_SCHEMA) INTO parent_exists USING v;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."CustomFieldDefinition" WHERE id=($1->>''fieldDefinitionId'')::uuid)',TG_TABLE_SCHEMA) INTO definition_exists USING v;
  IF TG_OP='DELETE' AND (NOT parent_exists OR NOT definition_exists) THEN RETURN OLD; END IF;
  EXECUTE format('UPDATE %I."CollectibleItem" SET id=id WHERE id=($1->>''itemId'')::uuid',TG_TABLE_SCHEMA) USING v;
  IF TG_WHEN='BEFORE' THEN
    IF TG_OP IN ('UPDATE','DELETE') AND OLD."moneyGeneration" IS NULL AND OLD."moneyAmountMinor" IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."CustomMoneyInterpretationEvent" WHERE "itemId"=$1 AND "fieldDefinitionId"=$2 AND generation=''00000000-0000-0000-0000-000000000000''::uuid)',TG_TABLE_SCHEMA) INTO present USING OLD."itemId",OLD."fieldDefinitionId";
      IF NOT present THEN EXECUTE format('SELECT %I.legacy_money_append_raw($1,$2,$3,$4,$5,$6,$7)',TG_TABLE_SCHEMA) USING TG_TABLE_SCHEMA,'CUSTOM',subject,'BASELINE',OLD."moneyAmountMinor",OLD."moneyCurrency"::text,'00000000-0000-0000-0000-000000000000'::uuid; END IF;
    END IF;
    IF TG_OP<>'DELETE' THEN NEW."moneyGeneration":=gen_random_uuid(); END IF;
  ELSE
    IF TG_OP='DELETE' THEN
      EXECUTE format('SELECT %I.legacy_money_append_raw($1,$2,$3,$4,$5,$6,$7)',TG_TABLE_SCHEMA) USING TG_TABLE_SCHEMA,'CUSTOM',subject,'CLEAR',NULL::bigint,NULL::text,gen_random_uuid();
    ELSE
      EXECUTE format('SELECT %I.legacy_money_append_raw($1,$2,$3,$4,$5,$6,$7)',TG_TABLE_SCHEMA) USING TG_TABLE_SCHEMA,'CUSTOM',subject,'RAW_WRITE',NEW."moneyAmountMinor",NEW."moneyCurrency"::text,NEW."moneyGeneration";
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER money_b_custom_rotate BEFORE INSERT OR UPDATE OF "moneyAmountMinor","moneyCurrency","fieldType","itemId","fieldDefinitionId","collectionId" OR DELETE ON "CustomFieldValue" FOR EACH ROW EXECUTE FUNCTION legacy_money_custom_raw();
CREATE TRIGGER money_c_custom_record AFTER INSERT OR UPDATE OF "moneyAmountMinor","moneyCurrency","fieldType","itemId","fieldDefinitionId","collectionId" OR DELETE ON "CustomFieldValue" FOR EACH ROW EXECUTE FUNCTION legacy_money_custom_raw();

CREATE FUNCTION legacy_money_payload_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NEW."moneyInterpretation" IS DISTINCT FROM OLD."moneyInterpretation" OR (TG_TABLE_NAME='CatalogProposal' AND (to_jsonb(NEW)->'patch') IS DISTINCT FROM (to_jsonb(OLD)->'patch')) THEN RAISE EXCEPTION 'Submitted money payload is immutable' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER money_payload_immutable BEFORE UPDATE OF patch,"moneyInterpretation" ON "CatalogProposal" FOR EACH ROW EXECUTE FUNCTION legacy_money_payload_immutable();
CREATE TRIGGER money_payload_immutable BEFORE UPDATE OF "moneyInterpretation" ON "CatalogRollbackAudit" FOR EACH ROW EXECUTE FUNCTION legacy_money_payload_immutable();
