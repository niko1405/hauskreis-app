-- Wann der Hauskreis anfängt: bisher eine Konstante im Code, jetzt eine Angabe
-- am Termin und eine Vorgabe je Gruppe.
--
-- 1080 Minuten = 18:00, also genau das bisherige Verhalten. Bestehende Termine
-- bekommen die Vorgabe über den Spalten-Default, ohne dass jemand etwas
-- nachtragen muss.

ALTER TABLE "meeting" ADD COLUMN "start_minutes" INTEGER NOT NULL DEFAULT 1080;

CREATE TABLE "meeting_schedule_config" (
    "id" UUID NOT NULL,
    "hauskreis_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL DEFAULT 2,
    "start_minutes" INTEGER NOT NULL DEFAULT 1080,
    "updated_by_person_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "meeting_schedule_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "meeting_schedule_config_hauskreis_id_key" ON "meeting_schedule_config"("hauskreis_id");

ALTER TABLE "meeting_schedule_config" ADD CONSTRAINT "meeting_schedule_config_hauskreis_id_fkey" FOREIGN KEY ("hauskreis_id") REFERENCES "hauskreis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "meeting_schedule_config" ADD CONSTRAINT "meeting_schedule_config_updated_by_person_id_fkey" FOREIGN KEY ("updated_by_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Eigener Typ für „die Uhrzeit des nächsten Abends hat sich geändert".
ALTER TYPE "notification_type" ADD VALUE 'MEETING_TIME_CHANGED';
