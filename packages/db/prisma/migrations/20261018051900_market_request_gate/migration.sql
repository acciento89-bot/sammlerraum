-- Operational per-upstream/token state; deliberately independent of observation retention.
-- An active claim NEVER expires. Recovery requires authorized, verified fleet drain.
CREATE TABLE "MarketRequestGate" (
 "credentialKey" varchar(64) PRIMARY KEY,
 service varchar(16) NOT NULL,
 hourly integer NOT NULL,
 daily integer NOT NULL,
 "policyVersion" integer NOT NULL,
 "activeAttempt" uuid,
 "acquiredAt" timestamptz(3),
 "hourStart" timestamptz(3) NOT NULL,
 "dayStart" timestamptz(3) NOT NULL,
 "hourCount" integer NOT NULL,
 "dayCount" integer NOT NULL,
 CONSTRAINT "MarketRequestGate_key" CHECK ("credentialKey" ~ '^[0-9a-f]{64}$'),
 CONSTRAINT "MarketRequestGate_service" CHECK (service IN ('scrydex','pricecharting')),
 CONSTRAINT "MarketRequestGate_policy" CHECK (hourly BETWEEN 0 AND 60 AND daily BETWEEN 0 AND 500 AND "policyVersion"=1),
 CONSTRAINT "MarketRequestGate_counters" CHECK ("hourCount" BETWEEN 0 AND hourly AND "dayCount" BETWEEN 0 AND daily),
 CONSTRAINT "MarketRequestGate_active" CHECK (("activeAttempt" IS NULL)=("acquiredAt" IS NULL)),
 CONSTRAINT "MarketRequestGate_windows" CHECK (isfinite("hourStart") AND isfinite("dayStart") AND "hourStart">="dayStart" AND ("acquiredAt" IS NULL OR isfinite("acquiredAt")))
);
