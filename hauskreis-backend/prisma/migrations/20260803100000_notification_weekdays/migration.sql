-- Aus einem Wochentag wird eine Liste: ein Actionstep verträgt mehr als eine
-- Nachfrage pro Woche. Leer heißt weiterhin "wie im Katalog", nicht "nie" --
-- Letzteres sagt `enabled`.
ALTER TABLE "notification_preference" ADD COLUMN "weekdays" INTEGER[] NOT NULL DEFAULT '{}';

UPDATE "notification_preference"
SET "weekdays" = ARRAY["weekday"]
WHERE "weekday" IS NOT NULL;

ALTER TABLE "notification_preference" DROP COLUMN "weekday";
