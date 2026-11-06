ALTER TABLE "ImportJob" ADD COLUMN "commitApprovedAt" TIMESTAMP(3), ADD COLUMN "commitApprovalRevision" INTEGER;
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_approval_pair" CHECK (("commitApprovedAt" IS NULL)=("commitApprovalRevision" IS NULL) AND ("commitApprovalRevision" IS NULL OR "commitApprovalRevision">0));
CREATE FUNCTION import_commit_approval_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD."commitApprovedAt" IS NOT NULL AND ROW(NEW."commitApprovedAt",NEW."commitApprovalRevision",NEW."mappingSnapshot",NEW."mappingHash",NEW."previewGeneration",NEW."totalRows",NEW."parsedRows",NEW."previewedRows") IS DISTINCT FROM ROW(OLD."commitApprovedAt",OLD."commitApprovalRevision",OLD."mappingSnapshot",OLD."mappingHash",OLD."previewGeneration",OLD."totalRows",OLD."parsedRows",OLD."previewedRows") THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Approved import preview is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER import_commit_approval_guard BEFORE UPDATE ON "ImportJob" FOR EACH ROW EXECUTE FUNCTION import_commit_approval_guard();
CREATE FUNCTION import_decision_approval_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.decision IS DISTINCT FROM OLD.decision AND EXISTS(SELECT 1 FROM "ImportJob" WHERE id=OLD."jobId" AND "commitApprovedAt" IS NOT NULL) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Approved import decision is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER import_decision_approval_guard BEFORE UPDATE ON "ImportRow" FOR EACH ROW EXECUTE FUNCTION import_decision_approval_guard();
