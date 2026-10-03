-- Die Setlist bekommt eine Reihenfolge, die Vorschläge bekommen Stimmen.
--
-- `position` gilt nur für Lieder in der Setlist. Ein Vorschlag hat keinen
-- Platz, er hat Stimmen — und wird ein Lied aus der Setlist genommen, wird es
-- wieder einer.
--
-- Rückwirkend in der Reihenfolge, in der die Liste bisher dastand: nach dem
-- Zeitpunkt des Vorschlags. Was gestern als erstes oben stand, steht danach
-- als Nummer 1 da.

ALTER TABLE "meeting_song" ADD COLUMN "position" INTEGER;

UPDATE "meeting_song" AS ms
SET "position" = ranked."n"
FROM (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "meeting_id" ORDER BY "created_at", "id") AS "n"
  FROM "meeting_song"
  WHERE "is_selected" = true
) AS ranked
WHERE ms."id" = ranked."id";

CREATE TABLE "meeting_song_vote" (
    "meeting_song_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_song_vote_pkey" PRIMARY KEY ("meeting_song_id","person_id")
);

-- Die Gegenrichtung „wofür hat diese Person gestimmt" — gebraucht, wenn sie
-- geht und ihre Zeilen mitnimmt.
CREATE INDEX "meeting_song_vote_person_id_idx" ON "meeting_song_vote"("person_id");

ALTER TABLE "meeting_song_vote" ADD CONSTRAINT "meeting_song_vote_meeting_song_id_fkey" FOREIGN KEY ("meeting_song_id") REFERENCES "meeting_song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "meeting_song_vote" ADD CONSTRAINT "meeting_song_vote_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
