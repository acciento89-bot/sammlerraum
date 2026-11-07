-- A COPY may not establish a cross-owner dependency while collection transfer holds its items.
-- Preserve the existing meaning/evidence/sequence guards unchanged.
CREATE FUNCTION money_copy_ownership_fence() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE source_id uuid; origin_id uuid; target record; n integer:=0; expected integer;
BEGIN
 IF NEW.operation::text<>'COPY' THEN RETURN NEW; END IF;
 IF NEW."actorId" IS NULL OR NEW."sourceEventId" IS NULL OR NEW."originEventId" IS NULL THEN
   RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Money copy requires an actor and both provenance references';
 END IF;
 EXECUTE format('SELECT "itemId" FROM %I.%I WHERE id=$1',TG_TABLE_SCHEMA,TG_TABLE_NAME)
   INTO source_id USING NEW."sourceEventId";
 EXECUTE format('SELECT "itemId" FROM %I.%I WHERE id=$1',TG_TABLE_SCHEMA,TG_TABLE_NAME)
   INTO origin_id USING NEW."originEventId";
 IF source_id IS NULL OR origin_id IS NULL THEN
   RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Money copy ownership changed';
 END IF;
 SELECT count(DISTINCT id) INTO expected FROM unnest(ARRAY[NEW."itemId",source_id,origin_id]) AS ids(id);
 FOR target IN EXECUTE format('SELECT id,"ownerId" FROM %I."CollectibleItem" WHERE id=ANY($1) ORDER BY id FOR UPDATE',TG_TABLE_SCHEMA)
   USING ARRAY[NEW."itemId",source_id,origin_id] LOOP
   n:=n+1;
   IF target."ownerId" IS DISTINCT FROM NEW."actorId" THEN
     RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Money copy ownership changed';
   END IF;
 END LOOP;
 IF n<>expected THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Money copy subject changed'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER money_a_copy_ownership_fence BEFORE INSERT ON "PurchaseMoneyInterpretationEvent"
 FOR EACH ROW EXECUTE FUNCTION money_copy_ownership_fence();
CREATE TRIGGER money_a_copy_ownership_fence BEFORE INSERT ON "CustomMoneyInterpretationEvent"
 FOR EACH ROW EXECUTE FUNCTION money_copy_ownership_fence();

-- Check the final state after the whole collection cascade, never a transient partial owner set.
CREATE FUNCTION money_transfer_owner_coherence() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE event_table text; conflict boolean;
BEGIN
 IF NEW."ownerId" IS NOT DISTINCT FROM OLD."ownerId" THEN RETURN NULL; END IF;
 FOREACH event_table IN ARRAY ARRAY['PurchaseMoneyInterpretationEvent','CustomMoneyInterpretationEvent'] LOOP
   EXECUTE format($sql$
    WITH touched AS (SELECT id FROM %1$I.%2$I WHERE "itemId"=$1),
    edges AS (
     SELECT id FROM %1$I.%2$I WHERE "itemId"=$1 AND operation='COPY'
     UNION SELECT copy.id FROM %1$I.%2$I copy JOIN touched source ON source.id=copy."sourceEventId" WHERE copy.operation='COPY'
     UNION SELECT copy.id FROM %1$I.%2$I copy JOIN touched origin ON origin.id=copy."originEventId" WHERE copy.operation='COPY'
    )
    SELECT EXISTS(SELECT 1 FROM edges JOIN %1$I.%2$I copy ON copy.id=edges.id
     JOIN %1$I."CollectibleItem" target ON target.id=copy."itemId"
     LEFT JOIN %1$I.%2$I source ON source.id=copy."sourceEventId"
     LEFT JOIN %1$I."CollectibleItem" source_item ON source_item.id=source."itemId"
     LEFT JOIN %1$I.%2$I origin ON origin.id=copy."originEventId"
     LEFT JOIN %1$I."CollectibleItem" origin_item ON origin_item.id=origin."itemId"
     WHERE (source_item.id IS NOT NULL AND source_item."ownerId"<>target."ownerId")
        OR (origin_item.id IS NOT NULL AND origin_item."ownerId"<>target."ownerId"))
   $sql$,TG_TABLE_SCHEMA,event_table) INTO conflict USING NEW.id;
   IF conflict THEN
     RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='money_transfer_owner_coherence',MESSAGE='Ownership transfer must preserve private money provenance';
   END IF;
 END LOOP;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER money_transfer_owner_coherence AFTER UPDATE ON "CollectibleItem"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 WHEN (OLD."ownerId" IS DISTINCT FROM NEW."ownerId") EXECUTE FUNCTION money_transfer_owner_coherence();
