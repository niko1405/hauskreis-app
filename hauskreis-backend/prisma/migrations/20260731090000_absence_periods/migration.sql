-- CreateEnum
CREATE TYPE "attendance_source" AS ENUM ('SELF', 'ABSENCE');

-- AlterTable
ALTER TABLE "meeting_attendance" ADD COLUMN     "source" "attendance_source" NOT NULL DEFAULT 'SELF';

-- CreateTable
CREATE TABLE "absence_period" (
    "id" UUID NOT NULL,
    "hauskreis_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "absence_period_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "absence_period_hauskreis_id_start_date_end_date_idx" ON "absence_period"("hauskreis_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "absence_period_person_id_idx" ON "absence_period"("person_id");

-- AddForeignKey
ALTER TABLE "absence_period" ADD CONSTRAINT "absence_period_hauskreis_id_fkey" FOREIGN KEY ("hauskreis_id") REFERENCES "hauskreis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_period" ADD CONSTRAINT "absence_period_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

