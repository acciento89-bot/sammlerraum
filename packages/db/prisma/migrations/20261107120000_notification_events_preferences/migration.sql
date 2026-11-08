-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "recipientId" TEXT NOT NULL,
    "actorId" TEXT,
    "eventKey" VARCHAR(200) NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "category" VARCHAR(24) NOT NULL,
    "targetType" VARCHAR(24) NOT NULL,
    "targetId" VARCHAR(128) NOT NULL,
    "locale" VARCHAR(2) NOT NULL DEFAULT 'de',
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailWanted" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" TEXT NOT NULL,
    "category" VARCHAR(24) NOT NULL,
    "channel" VARCHAR(16) NOT NULL,
    "enabled" BOOLEAN NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId","category","channel")
);

-- CreateTable
CREATE TABLE "NotificationSettings" (
    "userId" TEXT NOT NULL,
    "locale" VARCHAR(2) NOT NULL DEFAULT 'de',

    CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "Notification_recipientId_inAppEnabled_createdAt_id_idx" ON "Notification"("recipientId", "inAppEnabled", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Notification_actorId_idx" ON "Notification"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_recipientId_eventKey_key" ON "Notification"("recipientId", "eventKey");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "NotificationSettings" ADD CONSTRAINT "NotificationSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE RESTRICT;


ALTER TABLE "NotificationPreference" ADD CONSTRAINT notification_preference_keys CHECK (
 category IN ('COMMUNITY','INVENTORY','ACCOUNT','SECURITY') AND channel IN ('IN_APP','EMAIL')
 AND NOT (category='SECURITY' AND channel='EMAIL' AND NOT enabled)
);
ALTER TABLE "NotificationSettings" ADD CONSTRAINT notification_settings_locale CHECK (locale IN ('de','en'));
ALTER TABLE "Notification" ADD CONSTRAINT notification_event_shape CHECK (
 locale IN ('de','en') AND "eventKey" ~ '^[a-zA-Z0-9:._-]{1,200}$'
 AND ((type IN ('FOLLOW_RECEIVED','FAVORITE_RECEIVED','COMMENT_RECEIVED','REPLY_RECEIVED') AND category='COMMUNITY')
 OR (type IN ('IMPORT_COMPLETED','EXPORT_COMPLETED') AND category='INVENTORY')
 OR (type='MODERATION_STATUS' AND category='ACCOUNT') OR (type='SECURITY_ALERT' AND category='SECURITY' AND "emailWanted"))
 AND "targetType" IN ('USER','ACCOUNT','ITEM','COLLECTION','IMPORT_JOB','EXPORT_JOB')
 AND ("targetType" NOT IN ('ITEM','COLLECTION','IMPORT_JOB','EXPORT_JOB') OR "targetId" ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
);
