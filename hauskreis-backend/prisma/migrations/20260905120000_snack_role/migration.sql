-- Snacks als sechste Rolle: ein eigener Baustein am Abend, eine eigene Tabelle
-- für die Leute, die etwas mitbringen, und eine Vorgabe für den Terminplaner.
--
-- Rein additiv und damit umkehrbar — anders als die Migration davor, die die
-- Terminart wegwarf.
--
-- Beide Booleschen stehen auf `false`, und das ist die eigentliche Aussage: Die
-- Rolle ist eine Einladung, kein Abschalten. Bei den Gebetsanliegen war
-- `true` richtig, weil sie an jedem Abend im Archiv tatsächlich dastanden;
-- Snacks hat nie jemand geplant, und jeder vergangene Abend bekäme sonst
-- rückwirkend eine offene Zuständigkeit.

ALTER TYPE "assignment_role" ADD VALUE 'SNACK';

ALTER TYPE "notification_type" ADD VALUE 'SNACK_REMINDER';

ALTER TABLE "meeting" ADD COLUMN "has_snack_slot" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "meeting_schedule_config" ADD COLUMN "snack_slot" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "meeting_snack_responsible" (
    "meeting_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,

    CONSTRAINT "meeting_snack_responsible_pkey" PRIMARY KEY ("meeting_id","person_id")
);

-- Wie bei `meeting_song_leader`: Der Primärschlüssel trägt die Richtung
-- „welcher Abend hat wen", der Index die Gegenrichtung „woran ist diese Person
-- beteiligt" — die fragt die Lastberechnung der Vorschlagslisten.
CREATE INDEX "meeting_snack_responsible_person_id_idx" ON "meeting_snack_responsible"("person_id");

ALTER TABLE "meeting_snack_responsible" ADD CONSTRAINT "meeting_snack_responsible_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "meeting_snack_responsible" ADD CONSTRAINT "meeting_snack_responsible_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
