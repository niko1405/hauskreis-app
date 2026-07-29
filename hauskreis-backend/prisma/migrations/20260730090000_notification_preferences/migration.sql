
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "notification_type" ADD VALUE 'SONG_REMINDER';
ALTER TYPE "notification_type" ADD VALUE 'MEETING_CANCELLED';
ALTER TYPE "notification_type" ADD VALUE 'ATTENDANCE_DECLINED';
ALTER TYPE "notification_type" ADD VALUE 'HOST_CAPACITY_UNLOCKED';

-- DropIndex
DROP INDEX "notification_log_person_id_type_related_meeting_id_related__key";

-- AlterTable
ALTER TABLE "notification_log" ADD COLUMN     "related_person_id" UUID;

-- CreateTable
CREATE TABLE "notification_preference" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lead_days" INTEGER,
    "weekday" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preference_person_id_type_key" ON "notification_preference"("person_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "notification_log_person_id_type_related_meeting_id_related__key" ON "notification_log"("person_id", "type", "related_meeting_id", "related_group_id", "related_person_id");

-- AddForeignKey
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_related_person_id_fkey" FOREIGN KEY ("related_person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

