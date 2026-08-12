-- CreateEnum
CREATE TYPE "HeaderScreen" AS ENUM ('HOME', 'PRAYER', 'ARCHIVE', 'PROFILE');

-- AlterTable
ALTER TABLE "meeting_schedule_config" ADD COLUMN     "time_zone" TEXT NOT NULL DEFAULT 'Europe/Berlin';

-- AlterTable
ALTER TABLE "notification_preference" ALTER COLUMN "weekdays" DROP DEFAULT;

-- CreateTable
CREATE TABLE "header_image" (
    "id" UUID NOT NULL,
    "hauskreis_id" UUID NOT NULL,
    "screen" "HeaderScreen" NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "header_image_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "header_image_hauskreis_id_screen_key" ON "header_image"("hauskreis_id", "screen");

-- AddForeignKey
ALTER TABLE "header_image" ADD CONSTRAINT "header_image_hauskreis_id_fkey" FOREIGN KEY ("hauskreis_id") REFERENCES "hauskreis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
