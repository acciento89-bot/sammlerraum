-- CreateEnum
CREATE TYPE "ValuationType" AS ENUM ('MANUAL');

-- CreateTable
CREATE TABLE "Valuation" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "type" "ValuationType" NOT NULL DEFAULT 'MANUAL',
    "basis" VARCHAR(8) NOT NULL DEFAULT 'PER_UNIT',
    "amountMinor" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "minorUnitExponent" INTEGER NOT NULL,
    "note" VARCHAR(2000),
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Valuation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Valuation_itemId_ownerId_observedAt_createdAt_id_idx" ON "Valuation"("itemId", "ownerId", "observedAt" DESC, "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Valuation_actorUserId_idx" ON "Valuation"("actorUserId");

-- AddForeignKey
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_itemId_ownerId_fkey" FOREIGN KEY ("itemId", "ownerId") REFERENCES "CollectibleItem"("id", "ownerId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- Approved numeric exponents from SIX ISO4217 List One (2026-09-17), SHA256
-- 33139b438657d1cee116ba737807ea71d19d6de4b90f799a09c56f0cc6a1b0ff.
-- Future metadata updates must retain old pairs for historical interpretation.
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_currency_exponent_check" CHECK (
  ("minorUnitExponent" = 0 AND currency IN ('BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF')) OR
  ("minorUnitExponent" = 2 AND currency IN ('AED', 'AFN', 'ALL', 'AMD', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN', 'BAM', 'BBD', 'BDT', 'BMD', 'BND', 'BOB', 'BOV', 'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHE', 'CHF', 'CHW', 'CNY', 'COP', 'COU', 'CRC', 'CUP', 'CVE', 'CZK', 'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB', 'EUR', 'FJD', 'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GTQ', 'GYD', 'HKD', 'HNL', 'HTG', 'HUF', 'IDR', 'ILS', 'INR', 'IRR', 'JMD', 'KES', 'KGS', 'KHR', 'KPW', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MXV', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'QAR', 'RON', 'RSD', 'RUB', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL', 'THB', 'TJS', 'TMT', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'USD', 'USN', 'UYU', 'UZS', 'VED', 'VES', 'WST', 'XAD', 'XCD', 'XCG', 'YER', 'ZAR', 'ZMW', 'ZWG')) OR
  ("minorUnitExponent" = 3 AND currency IN ('BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND')) OR
  ("minorUnitExponent" = 4 AND currency IN ('CLF', 'UYW'))
);
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_owner_actor_check" CHECK ("actorUserId" = "ownerId");
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_per_unit_check" CHECK (basis = 'PER_UNIT');
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_nonnegative_check" CHECK ("amountMinor" >= 0);
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_time_check" CHECK (
  isfinite("observedAt") AND isfinite("createdAt") AND
  "observedAt" >= '0001-01-01T00:00:00Z'::timestamptz AND
  "createdAt" < '10000-01-01T00:00:00Z'::timestamptz AND
  "observedAt" <= "createdAt"
);
-- Trim the same Unicode whitespace set used by ECMAScript String.trim.
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_note_check" CHECK (
  note IS NULL OR (length(note) BETWEEN 1 AND 2000 AND
  note = btrim(note, chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)))
);

-- Appends are immutable even under direct SQL UPDATE, including no-op updates.
-- DELETE remains available for trusted erasure/cascade cleanup; no operator-proof retention.
CREATE FUNCTION reject_valuation_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Valuation history is append-only' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER "Valuation_immutable_update" BEFORE UPDATE ON "Valuation"
FOR EACH ROW EXECUTE FUNCTION reject_valuation_update();
