-- Drei neue Nachrichten und ein freier Unterscheider für die Entdopplung.
--
-- `related_key` beantwortet „derselbe Gegenstand, aber ein anderer Anlass".
-- Gebraucht wurde das schon vorher, nur fiel es nicht auf: Der Actionstep
-- erinnert an jedem gewählten Wochentag — entdoppelt wurde aber allein über
-- den Termin, und nach dem ersten Tag galt er als erledigt. Ab jetzt steht der
-- Tag dort. Dasselbe gilt für „eine Rolle ist noch frei" (der Tag) und für den
-- Rückblick auf einen Abend (welches Feld: `summary` oder `actionstep`).
--
-- Rein additiv: Bestehende Zeilen bekommen NULL und behalten damit genau die
-- Bedeutung, die sie hatten.

ALTER TYPE "notification_type" ADD VALUE 'MEETING_SLOTS_CHANGED';
ALTER TYPE "notification_type" ADD VALUE 'ROLE_OPEN_REMINDER';
ALTER TYPE "notification_type" ADD VALUE 'RECAP_ADDED';

DROP INDEX "notification_log_dedup_key";

ALTER TABLE "notification_log" ADD COLUMN "related_key" TEXT;

CREATE UNIQUE INDEX "notification_log_dedup_key" ON "notification_log"("person_id", "type", "related_meeting_id", "related_group_id", "related_person_id", "related_role", "related_release_version", "related_occasion_id", "related_key");
