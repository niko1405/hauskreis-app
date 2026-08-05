-- Woraus ein Abend besteht, und wie lange er dauert.
--
-- Die vier Schalter machen aus dem Termintyp eine Voreinstellung. Vorher war er
-- eine Behauptung: geprüft wurde nichts, man konnte einem Lobpreisabend ein
-- Thema geben und einem Geburtstag ein Testimony.
ALTER TABLE "meeting"
  ADD COLUMN "end_date" DATE,
  ADD COLUMN "has_host_slot" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "has_topic_slot" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "has_song_slot" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "has_testimony_slot" BOOLEAN NOT NULL DEFAULT false;

-- Die Voreinstellungen je Typ, rückwirkend. Die Spalten-Defaults oben passen
-- schon für STANDARD; die beiden anderen Arten bekommen ihre eigene Zeile.
--
-- Für CUSTOM ist das bewusst großzügig: bestehende Sonder-Termine behalten
-- alles, was an ihnen dranhängt. Ein Geburtstagsabend, an dem jemand als Host
-- eingetragen war, verlöre die Zuteilung sonst still bei der Migration — neue
-- Custom-Termine starten leer, alte werden nicht rückwirkend entkernt.
UPDATE "meeting"
SET "has_topic_slot" = false,
    "has_testimony_slot" = true
WHERE "type" = 'LOBPREIS_GEBET';

UPDATE "meeting"
SET "has_host_slot" = ("host_person_id" IS NOT NULL OR "location_id" IS NOT NULL),
    "has_topic_slot" = ("topic_id" IS NOT NULL),
    "has_song_slot" = true,
    "has_testimony_slot" = ("testimony_text" IS NOT NULL)
WHERE "type" = 'CUSTOM';
