
-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('HOST_REMINDER', 'ACTIONSTEP_REMINDER', 'PRAYER_BUDDY_ASSIGNED', 'TOPIC_REMINDER');

-- CreateTable
CREATE TABLE "push_subscription" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh_key" TEXT NOT NULL,
    "auth_key" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_log" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "related_meeting_id" UUID,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscription_endpoint_key" ON "push_subscription"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscription_person_id_idx" ON "push_subscription"("person_id");

-- CreateIndex
CREATE INDEX "notification_log_person_id_sent_at_idx" ON "notification_log"("person_id", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_log_person_id_type_related_meeting_id_key" ON "notification_log"("person_id", "type", "related_meeting_id");

-- AddForeignKey
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_related_meeting_id_fkey" FOREIGN KEY ("related_meeting_id") REFERENCES "meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

