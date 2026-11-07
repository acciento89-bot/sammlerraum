-- Owner comparison uses semantic-source keyset seeks and exact-key chronological history.
-- Existing kind/currency index remains the currency-diversity probe path.
CREATE INDEX "MarketObservation_source_history_idx" ON "MarketObservation" (
  "entryId", "variantId", "providerId", "identifierNamespace", "identifierType", "externalId",
  "kind", "currency", "observedAt" DESC, "createdAt" DESC, "id" DESC
);
