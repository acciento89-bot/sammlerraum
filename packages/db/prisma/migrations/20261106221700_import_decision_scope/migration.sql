-- Keep the approval guard bound to its actual table schema, including isolated tests.
CREATE OR REPLACE FUNCTION import_decision_approval_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE approved BOOLEAN;
BEGIN
 IF NEW.decision IS DISTINCT FROM OLD.decision THEN
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I."ImportJob" WHERE id=$1 AND "commitApprovedAt" IS NOT NULL)',TG_TABLE_SCHEMA) INTO approved USING OLD."jobId";
  IF approved THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Approved import decision is immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
