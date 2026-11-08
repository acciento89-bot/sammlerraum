ALTER TABLE "BillingAccount" ADD COLUMN "syncToken" UUID, ADD COLUMN "syncExpiresAt" TIMESTAMP(3), ADD CHECK (("syncToken" IS NULL)=("syncExpiresAt" IS NULL));
ALTER TABLE "BillingSubscription" ADD COLUMN "planEligible" BOOLEAN NOT NULL DEFAULT FALSE, ADD COLUMN "riskReason" TEXT CHECK("riskReason" IN ('REFUND','DISPUTE','FRAUD')), ADD COLUMN "riskThrough" TIMESTAMP(3), ADD CHECK("riskThrough" IS NULL OR "riskReason"='REFUND');
CREATE TABLE "BillingWebhookReceipt" (
 id UUID PRIMARY KEY,"subjectId" TEXT REFERENCES "user"(id) ON DELETE CASCADE,provider TEXT NOT NULL CHECK(provider ~ '^[a-z][a-z0-9_-]{0,31}$'),"eventId" TEXT NOT NULL CHECK(length("eventId") BETWEEN 1 AND 255),digest CHAR(64) NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),event JSONB NOT NULL CHECK(jsonb_typeof(event)='object' AND octet_length(event::text)<=4096),
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','APPLIED','IGNORED')),
 "attemptCount" INTEGER NOT NULL DEFAULT 0 CHECK("attemptCount">=0),"leaseToken" UUID,"leaseExpiresAt" TIMESTAMP(3),"nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"lastDispatchedAt" TIMESTAMP(3),"lastErrorCode" TEXT CHECK("lastErrorCode" IN ('BILLING_UNAVAILABLE','BILLING_CONFLICT')),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"appliedAt" TIMESTAMP(3),UNIQUE(provider,"eventId"),
 CHECK((status='PROCESSING')=("leaseToken" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL)),
 CHECK(status='PROCESSING' OR ("leaseToken" IS NULL AND "leaseExpiresAt" IS NULL)),
 CHECK((status IN ('APPLIED','IGNORED'))=("appliedAt" IS NOT NULL))
);
CREATE INDEX "BillingWebhookReceipt_provider_status_nextAttemptAt_idx" ON "BillingWebhookReceipt"(provider,status,"nextAttemptAt");
CREATE FUNCTION guard_billing_webhook_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.provider,NEW."eventId",NEW.digest,NEW.event,NEW."createdAt") IS DISTINCT FROM ROW(OLD.id,OLD.provider,OLD."eventId",OLD.digest,OLD.event,OLD."createdAt") OR (OLD."subjectId" IS NOT NULL AND NEW."subjectId" IS DISTINCT FROM OLD."subjectId") OR OLD.status IN ('APPLIED','IGNORED') OR NEW."attemptCount"<OLD."attemptCount" THEN RAISE EXCEPTION 'BILLING_RECEIPT_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "BillingWebhookReceipt_identity" BEFORE UPDATE ON "BillingWebhookReceipt" FOR EACH ROW EXECUTE FUNCTION guard_billing_webhook_receipt();
