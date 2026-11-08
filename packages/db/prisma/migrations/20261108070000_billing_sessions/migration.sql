ALTER TABLE "BillingAccount" ADD COLUMN "customerRequestKey" UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX "BillingAccount_customerRequestKey_key" ON "BillingAccount"("customerRequestKey");
CREATE TABLE "BillingOperation" (
 id UUID PRIMARY KEY,
 "subjectId" TEXT NOT NULL,
 provider TEXT NOT NULL,
 "requestKey" UUID NOT NULL,
 "requestDigest" CHAR(64) NOT NULL CHECK("requestDigest" ~ '^[a-f0-9]{64}$'),
 purpose TEXT NOT NULL CHECK(purpose IN ('CHECKOUT','PORTAL')),
 cadence TEXT CHECK(cadence IN ('MONTHLY','YEARLY')),
 locale TEXT NOT NULL CHECK(locale IN ('de','en')),
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','READY')),
 "dispatchCount" INTEGER NOT NULL DEFAULT 0 CHECK("dispatchCount" BETWEEN 0 AND 5),
 "providerSessionId" TEXT CHECK(length("providerSessionId") BETWEEN 1 AND 255),
 url TEXT CHECK(length(url) BETWEEN 1 AND 4096),
 "expiresAt" TIMESTAMP(3) NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY("subjectId",provider) REFERENCES "BillingAccount"("subjectId",provider) ON DELETE CASCADE,
 UNIQUE("subjectId","requestKey"),UNIQUE(provider,purpose,"providerSessionId"),
 CHECK((purpose='CHECKOUT')=(cadence IS NOT NULL)),
 CHECK((status='READY')=(url IS NOT NULL AND "providerSessionId" IS NOT NULL)),
 CHECK(status='READY' OR (url IS NULL AND "providerSessionId" IS NULL)),
 CHECK("expiresAt">"createdAt")
);
CREATE INDEX "BillingOperation_subjectId_purpose_expiresAt_idx" ON "BillingOperation"("subjectId",purpose,"expiresAt");
CREATE INDEX "BillingOperation_subjectId_createdAt_idx" ON "BillingOperation"("subjectId","createdAt");
CREATE FUNCTION guard_billing_account_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW."subjectId",NEW.provider,NEW."customerRequestKey",NEW."createdAt") IS DISTINCT FROM ROW(OLD."subjectId",OLD.provider,OLD."customerRequestKey",OLD."createdAt") OR (OLD."providerCustomerId" IS NOT NULL AND NEW."providerCustomerId" IS DISTINCT FROM OLD."providerCustomerId") THEN RAISE EXCEPTION 'BILLING_IDENTITY_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "BillingAccount_identity" BEFORE UPDATE ON "BillingAccount" FOR EACH ROW EXECUTE FUNCTION guard_billing_account_identity();
CREATE FUNCTION guard_billing_operation_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW."subjectId",NEW.provider,NEW."requestKey",NEW."requestDigest",NEW.purpose,NEW.cadence,NEW.locale,NEW."expiresAt",NEW."createdAt") IS DISTINCT FROM ROW(OLD.id,OLD."subjectId",OLD.provider,OLD."requestKey",OLD."requestDigest",OLD.purpose,OLD.cadence,OLD.locale,OLD."expiresAt",OLD."createdAt") OR OLD.status='READY' OR NEW."dispatchCount"<OLD."dispatchCount" THEN RAISE EXCEPTION 'BILLING_OPERATION_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "BillingOperation_identity" BEFORE UPDATE ON "BillingOperation" FOR EACH ROW EXECUTE FUNCTION guard_billing_operation_identity();
