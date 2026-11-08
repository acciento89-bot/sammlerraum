-- Stable bounded hash ranges: indexes carry no new public projection or publication state.
CREATE INDEX "UserProfile_sitemap_hash_idx" ON "UserProfile" ((md5("userId") COLLATE "C")) WHERE "searchEngineIndexingEnabled" = true;
CREATE INDEX "Collection_sitemap_hash_idx" ON "Collection" ((md5(id::text) COLLATE "C")) WHERE visibility = 'PUBLIC' AND "deletedAt" IS NULL;
CREATE INDEX "CollectibleItem_sitemap_hash_idx" ON "CollectibleItem" ((md5(id::text) COLLATE "C")) WHERE visibility = 'PUBLIC' AND "deletedAt" IS NULL;
