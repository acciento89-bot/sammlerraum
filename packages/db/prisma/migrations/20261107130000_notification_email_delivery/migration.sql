-- CreateTable
CREATE TABLE "NotificationEmailDelivery" (
    "id" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" UUID,
    "leaseUntil" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerMessageId" VARCHAR(512),
    "lastOutcome" VARCHAR(32),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationEmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationEmailDelivery_notificationId_key" ON "NotificationEmailDelivery"("notificationId");

-- CreateIndex
CREATE INDEX "NotificationEmailDelivery_status_nextAttemptAt_id_idx" ON "NotificationEmailDelivery"("status", "nextAttemptAt", "id");

-- CreateIndex
CREATE INDEX "NotificationEmailDelivery_status_leaseUntil_idx" ON "NotificationEmailDelivery"("status", "leaseUntil");

-- AddForeignKey
ALTER TABLE "NotificationEmailDelivery" ADD CONSTRAINT "NotificationEmailDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE RESTRICT;


ALTER TABLE "NotificationEmailDelivery" ADD CONSTRAINT notification_delivery_state CHECK (
 status IN ('PENDING','CLAIMED','SENDING','SENT','UNKNOWN','FAILED','SUPPRESSED') AND attempts BETWEEN 0 AND 3
 AND (status NOT IN ('CLAIMED','SENDING') OR ("leaseToken" IS NOT NULL AND "leaseUntil" IS NOT NULL))
 AND (status<>'SENT' OR ("sentAt" IS NOT NULL AND "providerMessageId" IS NOT NULL AND char_length("providerMessageId") BETWEEN 1 AND 512))
);
