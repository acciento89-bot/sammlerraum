ALTER TABLE "ImportJob" ADD COLUMN "parserOptions" JSONB, ADD COLUMN "parsedHeader" JSONB,
 ADD COLUMN "parsingToken" UUID, ADD COLUMN "parsingLeaseUntil" TIMESTAMP(3), ADD COLUMN "parsingAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportRow" ADD COLUMN "sourceRowNumber" INTEGER;
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_parser_bounds" CHECK (
 "parsingAttempts" BETWEEN 0 AND 5 AND (("parsingToken" IS NULL)=("parsingLeaseUntil" IS NULL)) AND
 ("parserOptions" IS NULL OR (jsonb_typeof("parserOptions")='object' AND octet_length("parserOptions"::text)<=1024)) AND
 ("parsedHeader" IS NULL OR import_raw_cells_valid("parsedHeader")));
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_source_address" CHECK ("sourceRowNumber" IS NULL OR "sourceRowNumber" BETWEEN 1 AND 1048576);
CREATE FUNCTION import_parser_identity_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD."parsingAttempts">0 AND NEW."parserOptions" IS DISTINCT FROM OLD."parserOptions" THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Claimed import parser options are immutable'; END IF;
 IF OLD."parsedHeader" IS NOT NULL AND NEW."parsedHeader" IS DISTINCT FROM OLD."parsedHeader" THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Import source header is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER import_parser_identity_guard BEFORE UPDATE ON "ImportJob" FOR EACH ROW EXECUTE FUNCTION import_parser_identity_guard();
CREATE FUNCTION import_row_address_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW."sourceRowNumber" IS DISTINCT FROM OLD."sourceRowNumber" THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Import source address is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER import_row_address_guard BEFORE UPDATE ON "ImportRow" FOR EACH ROW EXECUTE FUNCTION import_row_address_guard();
