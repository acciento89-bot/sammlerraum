-- Aggregate financial safety records deliberately do not reference erasable user content.
CREATE TABLE "ExternalSpendMonth" (
  month DATE PRIMARY KEY,
  "ceilingCents" INTEGER NOT NULL CHECK ("ceilingCents" BETWEEN 1 AND 2500),
  "fixedCostCents" INTEGER NOT NULL CHECK ("fixedCostCents" BETWEEN 0 AND 2500),
  "reservedCents" INTEGER NOT NULL DEFAULT 0 CHECK ("reservedCents" BETWEEN 0 AND 2500),
  CHECK (EXTRACT(DAY FROM month)=1)
);
CREATE TABLE "ExternalSpendReservation" (
  key CHAR(64) PRIMARY KEY CHECK (key ~ '^[a-f0-9]{64}$'),
  month DATE NOT NULL REFERENCES "ExternalSpendMonth"(month) ON DELETE RESTRICT,
  "providerId" VARCHAR(64) NOT NULL CHECK ("providerId" ~ '^[a-z][a-z0-9_-]{0,63}$'),
  "amountCents" INTEGER NOT NULL CHECK ("amountCents" BETWEEN 1 AND 2500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ExternalSpendReservation_month_idx" ON "ExternalSpendReservation"(month);
