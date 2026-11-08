-- Bounded local exact-title matching for immutable photo suggestions, independent of the personal title.
CREATE INDEX "CatalogEntry_ai_exact_title_idx" ON "CatalogEntry" ((lower(authored#>>'{text,title}')),id);
