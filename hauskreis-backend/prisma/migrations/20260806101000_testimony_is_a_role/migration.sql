-- Testimony wird eine Rolle, der Gastgeber-Schalter fällt weg.
--
-- Die Reihenfolge trägt: erst die Daten in einen Zustand bringen, den die neue
-- Regel erlaubt, dann die Spalten umbauen. Andersherum entstünden Zeilen, die
-- `assertSlotsExclusive` selbst mit 400 ablehnt — genau der Fehler, der beim
-- Einführen der Bausteine erst im Nachhinein aufgefallen ist.

-- Ein Abend hat entweder ein Thema oder ein Testimony. Wo beides anstand,
-- gewinnt das Thema: daran hängen Zusammenfassung und Actionstep, am Testimony
-- hing bisher nur ein Textfeld.
UPDATE "meeting"
SET "has_testimony_slot" = false
WHERE "has_topic_slot" AND "has_testimony_slot";

-- Man trifft sich immer irgendwo. Eine Spalte, die immer wahr ist, ist genau
-- die Art Behauptung, die die Bausteine loswerden sollten.
ALTER TABLE "meeting" DROP COLUMN "has_host_slot";

-- Ein Testimony ist nichts, was man vorher aufschreibt, sondern jemand, der
-- davon erzählt. Der Text verschwindet ersatzlos.
ALTER TABLE "meeting" DROP COLUMN "testimony_text";

ALTER TABLE "meeting" ADD COLUMN "testimony_person_id" UUID;

ALTER TABLE "meeting"
  ADD CONSTRAINT "meeting_testimony_person_id_fkey"
  FOREIGN KEY ("testimony_person_id") REFERENCES "person"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
