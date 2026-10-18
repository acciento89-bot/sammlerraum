-- Server maintenance history is append-only; fixture-scoped DELETE is deliberately allowed.
-- An operator who can issue arbitrary DDL is outside the application's authority boundary.
CREATE FUNCTION reject_catalog_revision_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Catalog revision snapshots are immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER catalog_revision_immutable
  BEFORE UPDATE ON "CatalogRevision"
  FOR EACH ROW EXECUTE FUNCTION reject_catalog_revision_update();

ALTER TABLE "CatalogEntry" ADD CONSTRAINT "CatalogEntry_revision_positive" CHECK ("revision" > 0);
ALTER TABLE "CatalogRevision" ADD CONSTRAINT "CatalogRevision_revision_positive" CHECK ("revision" > 0);
ALTER TABLE "CatalogAttributeValue" ADD CONSTRAINT "CatalogAttributeValue_target_matches_variant"
  CHECK (("variantId" IS NULL AND "targetKey" = 'entry') OR ("variantId" IS NOT NULL AND "targetKey" = "variantId"::text));
