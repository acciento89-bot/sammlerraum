
> @sammlerraum/db@ prisma /Users/piotrkaminski/Documents/Codex/2026-10-17/so/work/sammlerraum/packages/db
> prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script

-- CreateEnum
CREATE TYPE "MarketObservationKind" AS ENUM ('LAST_SOLD', 'SOLD_AVERAGE', 'SOLD_MEDIAN', 'ASKING_PRICE', 'PRICE_RANGE', 'CATALOG_VALUE', 'DEALER_PRICE');

-- CreateEnum
CREATE TYPE "MarketIdentityMode" AS ENUM ('EVENT', 'POLL');

-- CreateEnum
CREATE TYPE "MarketObservedBasis" AS ENUM ('SOURCE', 'FETCH');

-- CreateEnum
CREATE TYPE "MarketObservedPrecision" AS ENUM ('DAY', 'SECOND', 'MILLISECOND');

-- CreateTable
CREATE TABLE "MarketObservation" (
    "id" UUID NOT NULL,
    "providerId" VARCHAR(64) NOT NULL,
    "externalId" VARCHAR(256) NOT NULL,
    "identityMode" "MarketIdentityMode" NOT NULL,
    "eventId" VARCHAR(256),
    "pollId" UUID,
    "sourceMetric" VARCHAR(64) NOT NULL,
    "kind" "MarketObservationKind" NOT NULL,
    "entryId" UUID NOT NULL,
    "variantId" UUID,
    "catalogRevision" INTEGER NOT NULL,
    "identifierId" UUID NOT NULL,
    "identifierNamespace" VARCHAR(64) NOT NULL,
    "identifierType" VARCHAR(64) NOT NULL,
    "qualifiers" JSONB NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "minorUnitExponent" INTEGER NOT NULL,
    "amountMinor" BIGINT,
    "lowMinor" BIGINT,
    "highMinor" BIGINT,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL,
    "observedBasis" "MarketObservedBasis" NOT NULL,
    "observedPrecision" "MarketObservedPrecision" NOT NULL,
    "sourceUrl" VARCHAR(2048),
    "sourceReference" VARCHAR(512),
    "confidence" JSONB,

    CONSTRAINT "MarketObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketObservation_providerId_idx" ON "MarketObservation"("providerId");

-- CreateIndex
CREATE INDEX "MarketObservation_history_idx" ON "MarketObservation"("entryId", "variantId", "providerId", "kind", "currency", "observedAt" DESC, "createdAt" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "MarketObservation" ADD CONSTRAINT "MarketObservation_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CatalogEntry"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MarketObservation" ADD CONSTRAINT "MarketObservation_variantId_entryId_fkey" FOREIGN KEY ("variantId", "entryId") REFERENCES "CatalogVariant"("id", "entryId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MarketObservation" ADD CONSTRAINT "MarketObservation_entryId_catalogRevision_fkey" FOREIGN KEY ("entryId", "catalogRevision") REFERENCES "CatalogRevision"("entryId", "revision") ON DELETE RESTRICT ON UPDATE RESTRICT;

