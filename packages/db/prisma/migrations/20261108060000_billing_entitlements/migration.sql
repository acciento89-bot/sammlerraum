CREATE TYPE "BillingSubscriptionStatus" AS ENUM ('ACTIVE','TRIALING','PAST_DUE','CANCELED','UNPAID','INCOMPLETE','INCOMPLETE_EXPIRED','PAUSED');
CREATE TABLE "BillingAccount" (
 "subjectId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 provider TEXT NOT NULL CHECK(provider ~ '^[a-z][a-z0-9_-]{0,31}$'),
 "providerCustomerId" TEXT CHECK(length("providerCustomerId") BETWEEN 1 AND 255),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY("subjectId",provider),
 UNIQUE(provider,"providerCustomerId")
);
CREATE TABLE "BillingSubscription" (
 id UUID PRIMARY KEY,
 "subjectId" TEXT NOT NULL,
 provider TEXT NOT NULL,
 "providerSubscriptionId" TEXT NOT NULL CHECK(length("providerSubscriptionId") BETWEEN 1 AND 255),
 status "BillingSubscriptionStatus" NOT NULL,
 "currentPeriodStart" TIMESTAMP(3) NOT NULL,
 "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
 "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT FALSE,
 "providerUpdatedAt" TIMESTAMP(3) NOT NULL,
 "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY("subjectId",provider) REFERENCES "BillingAccount"("subjectId",provider) ON DELETE CASCADE,
 UNIQUE(provider,"providerSubscriptionId"),
 CHECK("currentPeriodEnd">"currentPeriodStart")
);
CREATE INDEX "BillingSubscription_subjectId_currentPeriodEnd_idx" ON "BillingSubscription"("subjectId","currentPeriodEnd");
