ALTER TABLE "MediaAsset" ADD COLUMN "generatedArtifact" boolean NOT NULL DEFAULT false;
-- These namespaces are exclusively produced by the artifact worker, including abandoned attempts.
UPDATE "MediaAsset" SET "generatedArtifact"=true WHERE "storageKey" ~ '^(exports|reports)/[0-9a-f-]{36}/[0-9a-f-]{36}/data[.](csv|xlsx|pdf)$';
ALTER TABLE "ExportJob" ADD COLUMN "billingAdmitted" boolean NOT NULL DEFAULT false;
ALTER TABLE "ReportJob" ADD COLUMN "billingAdmitted" boolean NOT NULL DEFAULT false;
-- Existing jobs were already admitted under the previous rules; preserve their completion.
UPDATE "ExportJob" SET "billingAdmitted"=true;
UPDATE "ReportJob" SET "billingAdmitted"=true;

CREATE FUNCTION preserve_media_asset_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."generatedArtifact" IS DISTINCT FROM OLD."generatedArtifact" THEN
    RAISE EXCEPTION 'Media asset origin is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER media_asset_origin_immutable BEFORE UPDATE OF "generatedArtifact" ON "MediaAsset" FOR EACH ROW EXECUTE FUNCTION preserve_media_asset_origin();
