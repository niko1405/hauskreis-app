
-- DropIndex
DROP INDEX "notification_log_person_id_type_related_meeting_id_key";

-- AlterTable
ALTER TABLE "notification_log" ADD COLUMN     "related_group_id" UUID;

-- CreateTable
CREATE TABLE "prayer_buddy_cycle_config" (
    "id" UUID NOT NULL,
    "hauskreis_id" UUID NOT NULL,
    "period_length_weeks" INTEGER NOT NULL DEFAULT 2,
    "updated_by_person_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "prayer_buddy_cycle_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prayer_buddy_group" (
    "id" UUID NOT NULL,
    "hauskreis_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prayer_buddy_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prayer_buddy_group_member" (
    "prayer_buddy_group_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,

    CONSTRAINT "prayer_buddy_group_member_pkey" PRIMARY KEY ("prayer_buddy_group_id","person_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prayer_buddy_cycle_config_hauskreis_id_key" ON "prayer_buddy_cycle_config"("hauskreis_id");

-- CreateIndex
CREATE INDEX "prayer_buddy_group_hauskreis_id_period_start_idx" ON "prayer_buddy_group"("hauskreis_id", "period_start");

-- CreateIndex
CREATE INDEX "prayer_buddy_group_member_person_id_idx" ON "prayer_buddy_group_member"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_log_person_id_type_related_meeting_id_related__key" ON "notification_log"("person_id", "type", "related_meeting_id", "related_group_id");

-- AddForeignKey
ALTER TABLE "prayer_buddy_cycle_config" ADD CONSTRAINT "prayer_buddy_cycle_config_hauskreis_id_fkey" FOREIGN KEY ("hauskreis_id") REFERENCES "hauskreis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prayer_buddy_cycle_config" ADD CONSTRAINT "prayer_buddy_cycle_config_updated_by_person_id_fkey" FOREIGN KEY ("updated_by_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prayer_buddy_group" ADD CONSTRAINT "prayer_buddy_group_hauskreis_id_fkey" FOREIGN KEY ("hauskreis_id") REFERENCES "hauskreis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prayer_buddy_group_member" ADD CONSTRAINT "prayer_buddy_group_member_prayer_buddy_group_id_fkey" FOREIGN KEY ("prayer_buddy_group_id") REFERENCES "prayer_buddy_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prayer_buddy_group_member" ADD CONSTRAINT "prayer_buddy_group_member_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_related_group_id_fkey" FOREIGN KEY ("related_group_id") REFERENCES "prayer_buddy_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

