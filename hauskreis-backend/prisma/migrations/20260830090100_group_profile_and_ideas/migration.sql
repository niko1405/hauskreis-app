-- Der Hauskreis bekommt ein Gesicht.
--
-- Zwei Spalten an der Zeile und keine eigene Tabelle, anders als bei
-- `meeting_schedule_config` und Verwandten: Die halten fest, wer wann eine
-- Einstellung geändert hat. Bild und Beschreibung sind keine Einstellung,
-- sondern Identität — dieselbe Sorte Feld wie `name`, der schon dort steht.
ALTER TABLE "hauskreis" ADD COLUMN "description" TEXT;
ALTER TABLE "hauskreis" ADD COLUMN "photo_updated_at" TIMESTAMP(3);

-- Ideen der Gruppe: eine Liste mit Haken, mehr nicht.
--
-- Kein Zustimmen, keine Kommentare — ein Kommentarfaden wäre ein zweiter Chat
-- neben WhatsApp, und gegen den ist diese App gebaut.
CREATE TABLE "group_idea" (
    "id" UUID NOT NULL,
    "hauskreis_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    -- NULL heißt offen. Ein Zeitpunkt statt eines Bools, weil er zugleich die
    -- Sortierung der erledigten Hälfte trägt.
    "done_at" TIMESTAMP(3),
    "done_by_person_id" UUID,
    "created_by_person_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "group_idea_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "group_idea_hauskreis_id_done_at_idx" ON "group_idea"("hauskreis_id", "done_at");

ALTER TABLE "group_idea" ADD CONSTRAINT "group_idea_hauskreis_id_fkey" FOREIGN KEY ("hauskreis_id") REFERENCES "hauskreis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- `SET NULL` wie bei `gift_idea`: Konto löschen heißt anonymisieren, und eine
-- Idee ohne Urheber ist immer noch eine Idee.
ALTER TABLE "group_idea" ADD CONSTRAINT "group_idea_created_by_person_id_fkey" FOREIGN KEY ("created_by_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "group_idea" ADD CONSTRAINT "group_idea_done_by_person_id_fkey" FOREIGN KEY ("done_by_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
