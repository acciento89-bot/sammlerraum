CREATE TABLE "InsuranceRecord" (
 id UUID PRIMARY KEY NOT NULL,"ownerId" TEXT NOT NULL,"collectionId" UUID UNIQUE,"itemId" UUID UNIQUE,revision INTEGER NOT NULL DEFAULT 1,basis VARCHAR(16) NOT NULL,
 "amountMinor" BIGINT,currency VARCHAR(3),"minorUnitExponent" INTEGER,"valuationDate" DATE,insurer VARCHAR(200),"policyReference" VARCHAR(500),notes VARCHAR(2000),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "InsuranceRecord_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"(id) ON DELETE CASCADE ON UPDATE RESTRICT,
 CONSTRAINT "InsuranceRecord_collectionId_ownerId_fkey" FOREIGN KEY ("collectionId","ownerId") REFERENCES "Collection"(id,"ownerId") ON DELETE CASCADE ON UPDATE RESTRICT,
 CONSTRAINT "InsuranceRecord_itemId_ownerId_fkey" FOREIGN KEY ("itemId","ownerId") REFERENCES "CollectibleItem"(id,"ownerId") ON DELETE CASCADE ON UPDATE RESTRICT,
 CONSTRAINT "InsuranceRecord_target" CHECK ((("collectionId" IS NOT NULL AND "itemId" IS NULL AND basis='COLLECTION_TOTAL') OR ("itemId" IS NOT NULL AND "collectionId" IS NULL AND basis='PER_UNIT')) AND revision>0),
 CONSTRAINT "InsuranceRecord_payload" CHECK ((("amountMinor" IS NULL AND currency IS NULL AND "minorUnitExponent" IS NULL AND "valuationDate" IS NULL AND insurer IS NULL AND "policyReference" IS NULL AND notes IS NULL) OR ("amountMinor" IS NOT NULL AND "amountMinor">=0 AND currency IS NOT NULL AND "minorUnitExponent" IS NOT NULL AND "valuationDate" IS NOT NULL)) IS TRUE),
 CONSTRAINT "InsuranceRecord_day" CHECK ("valuationDate" IS NULL OR (isfinite("valuationDate") AND "valuationDate">='0001-01-01'::date AND "valuationDate"<'10000-01-01'::date AND "valuationDate"<="updatedAt"::date)),
 CONSTRAINT "InsuranceRecord_text" CHECK ((insurer IS NULL OR length(insurer) BETWEEN 1 AND 200) AND ("policyReference" IS NULL OR length("policyReference") BETWEEN 1 AND 500) AND (notes IS NULL OR length(notes) BETWEEN 1 AND 2000))
);
CREATE INDEX "InsuranceRecord_ownerId_updatedAt_id_idx" ON "InsuranceRecord"("ownerId","updatedAt",id);
-- Same pinned numeric currency authority as canonical manual valuations; retain historical pairs.
ALTER TABLE "InsuranceRecord" ADD CONSTRAINT "InsuranceRecord_currency_exponent_check" CHECK ("amountMinor" IS NULL OR (
  ("minorUnitExponent" = 0 AND currency IN ('BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF')) OR
  ("minorUnitExponent" = 2 AND currency IN ('AED', 'AFN', 'ALL', 'AMD', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN', 'BAM', 'BBD', 'BDT', 'BMD', 'BND', 'BOB', 'BOV', 'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHE', 'CHF', 'CHW', 'CNY', 'COP', 'COU', 'CRC', 'CUP', 'CVE', 'CZK', 'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB', 'EUR', 'FJD', 'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GTQ', 'GYD', 'HKD', 'HNL', 'HTG', 'HUF', 'IDR', 'ILS', 'INR', 'IRR', 'JMD', 'KES', 'KGS', 'KHR', 'KPW', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MXV', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'QAR', 'RON', 'RSD', 'RUB', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL', 'THB', 'TJS', 'TMT', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'USD', 'USN', 'UYU', 'UZS', 'VED', 'VES', 'WST', 'XAD', 'XCD', 'XCG', 'YER', 'ZAR', 'ZMW', 'ZWG')) OR
  ("minorUnitExponent" = 3 AND currency IN ('BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND')) OR
  ("minorUnitExponent" = 4 AND currency IN ('CLF', 'UYW'))
));
CREATE FUNCTION insurance_record_revision_guard() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF ROW(NEW.id,NEW."ownerId",NEW."collectionId",NEW."itemId",NEW.basis,NEW."createdAt") IS DISTINCT FROM ROW(OLD.id,OLD."ownerId",OLD."collectionId",OLD."itemId",OLD.basis,OLD."createdAt") OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Private insurance identity and revision are guarded'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER insurance_record_revision_guard BEFORE UPDATE ON "InsuranceRecord" FOR EACH ROW EXECUTE FUNCTION insurance_record_revision_guard();
