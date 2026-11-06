-- Forward-only M3 correction audit support; applied M2 migration remains unchanged.
-- AUTHOR may carry a private bounded correction reason. Its erasure removes human
-- metadata while preserving the pinned prospective receipt and financial meaning.
CREATE OR REPLACE FUNCTION legacy_money_event_guard() RETURNS trigger
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
      IF actor_gone AND (OLD.operation='CLASSIFY' OR (OLD.operation='AUTHOR' AND OLD.reason IS NOT NULL)) AND OLD."evidenceErasedAt" IS NULL THEN
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
        IF OLD."actorId" IS NULL OR NEW."actorId" IS NOT NULL OR (OLD.operation<>'AUTHOR' AND NOT actor_gone) OR (OLD.operation='AUTHOR' AND OLD.reason IS NOT NULL) THEN
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
    IF NEW."sourceEventId" IS NOT NULL OR NEW."originEventId" IS NOT NULL OR NEW."evidenceCategory" IS NOT NULL OR NEW."evidenceReference" IS NOT NULL OR (NEW.reason IS NOT NULL AND char_length(btrim(NEW.reason))=0) OR NEW."basisId"<>'legacy-money-iso-2026-09-17-v1' OR NEW."unitKey" IS DISTINCT FROM 'iso4217-2026-09-17:'||NEW."rawCurrency" THEN RAISE EXCEPTION 'Invalid authoring event' USING ERRCODE='23514'; END IF;
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
    IF origin->>'operation'='CLASSIFY' AND origin->>'evidenceErasedAt' IS NOT NULL THEN RAISE EXCEPTION 'Money origin evidence erased' USING ERRCODE='40001'; END IF;
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE "revokedAssertionId"=$1)',TG_TABLE_SCHEMA,TG_TABLE_NAME) INTO present USING NEW."originEventId";
    IF present THEN RAISE EXCEPTION 'Money origin revoked' USING ERRCODE='40001'; END IF;
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
