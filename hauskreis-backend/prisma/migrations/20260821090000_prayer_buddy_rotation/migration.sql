-- Im Trio wird reihum gebetet: A für B, B für C, C für A.
--
-- Bisher war eine Gebetsgruppe eine Menge, und bei dreien musste sich jede:r
-- selbst zusammenreimen, für wen er betet. Die Richtung bekommt jetzt einen
-- Platz: Wer auf `position` steht, betet für den auf `(position + 1) % n`.
--
-- Dieselbe Regel trägt beide Größen. Ein Paar ist ein Kreis aus zwei — 0 betet
-- für 1, 1 für 0, also füreinander, ohne Sonderfall.
ALTER TABLE "prayer_buddy_group_member" ADD COLUMN "position" INTEGER;

-- Bestehende Gruppen bekommen eine Reihenfolge nachgereicht. Nach `person_id`,
-- weil es die einzige stabile Ordnung ist, die die Zeilen mitbringen — welcher
-- Kreis dabei herauskommt, ist beliebig, aber für alle gleich und für die
-- laufende Runde nicht falsch: Bei einem Paar ist jede Reihenfolge dieselbe
-- Aussage.
UPDATE "prayer_buddy_group_member" AS m
SET "position" = nummeriert."rn"
FROM (
  SELECT
    "prayer_buddy_group_id",
    "person_id",
    ROW_NUMBER() OVER (
      PARTITION BY "prayer_buddy_group_id" ORDER BY "person_id"
    ) - 1 AS "rn"
  FROM "prayer_buddy_group_member"
) AS nummeriert
WHERE m."prayer_buddy_group_id" = nummeriert."prayer_buddy_group_id"
  AND m."person_id" = nummeriert."person_id";

-- Erst jetzt Pflicht, und ohne Vorgabewert: Eine Gruppe, in der alle auf 0
-- stehen, wäre kein Kreis, sondern ein stiller Fehler. Wer eine Zeile schreibt,
-- soll ihren Platz nennen müssen.
ALTER TABLE "prayer_buddy_group_member" ALTER COLUMN "position" SET NOT NULL;

CREATE UNIQUE INDEX "prayer_buddy_group_member_prayer_buddy_group_id_position_key"
  ON "prayer_buddy_group_member"("prayer_buddy_group_id", "position");
