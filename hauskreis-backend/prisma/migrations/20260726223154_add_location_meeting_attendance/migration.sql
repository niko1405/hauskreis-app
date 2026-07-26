-- CreateEnum
CREATE TYPE "meeting_type" AS ENUM ('STANDARD', 'LOBPREIS_GEBET', 'CUSTOM');

-- CreateEnum
CREATE TYPE "meeting_status" AS ENUM ('PLANNED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "attendance_status" AS ENUM ('ATTENDING', 'ABSENT', 'UNKNOWN');

-- CreateTable
CREATE TABLE "location" (
    "id" UUID NOT NULL,
    "hauskreis_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "frequency_factor" DECIMAL(4,2) NOT NULL DEFAULT 1.0,
    "requires_host" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting" (
    "id" UUID NOT NULL,
    "hauskreis_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "meeting_type" NOT NULL DEFAULT 'STANDARD',
    "status" "meeting_status" NOT NULL DEFAULT 'PLANNED',
    "location_id" UUID,
    "host_person_id" UUID,
    "title" TEXT,
    "testimony_text" TEXT,
    "actionstep_text" TEXT,
    "summary_text" TEXT,
    "info_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_attendance" (
    "meeting_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "status" "attendance_status" NOT NULL DEFAULT 'UNKNOWN',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_attendance_pkey" PRIMARY KEY ("meeting_id","person_id")
);

-- CreateIndex
CREATE INDEX "location_hauskreis_id_idx" ON "location"("hauskreis_id");

-- CreateIndex
CREATE UNIQUE INDEX "location_hauskreis_id_name_key" ON "location"("hauskreis_id", "name");

-- CreateIndex
CREATE INDEX "meeting_hauskreis_id_date_idx" ON "meeting"("hauskreis_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_hauskreis_id_date_key" ON "meeting"("hauskreis_id", "date");

-- CreateIndex
CREATE INDEX "meeting_attendance_person_id_idx" ON "meeting_attendance"("person_id");

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_hauskreis_id_fkey" FOREIGN KEY ("hauskreis_id") REFERENCES "hauskreis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_hauskreis_id_fkey" FOREIGN KEY ("hauskreis_id") REFERENCES "hauskreis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting" ADD CONSTRAINT "meeting_host_person_id_fkey" FOREIGN KEY ("host_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendance" ADD CONSTRAINT "meeting_attendance_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendance" ADD CONSTRAINT "meeting_attendance_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
