-- Aus der Buchführung wird eine Box.
--
-- `notification_log` wusste bisher, *dass* etwas rausging, nicht *was*. Eine
-- Push-Nachricht war damit weg, sobald jemand sie wegwischte. Mit `title`,
-- `body` und `url` trägt dieselbe Zeile jetzt den Eintrag hinter der Glocke.
ALTER TABLE "notification_log" ADD COLUMN "title" TEXT;
ALTER TABLE "notification_log" ADD COLUMN "body" TEXT;
ALTER TABLE "notification_log" ADD COLUMN "url" TEXT;
ALTER TABLE "notification_log" ADD COLUMN "read_at" TIMESTAMP(3);
ALTER TABLE "notification_log" ADD COLUMN "pushed_at" TIMESTAMP(3);

-- Die Zeile, auf die es ankommt.
--
-- Ab jetzt entscheidet `pushed_at` darüber, ob eine Nachricht noch rausgeht —
-- vorher tat es die bloße Existenz der Zeile. Bliebe der Altbestand auf NULL,
-- hielte der nächste nächtliche Lauf jede Erinnerung seit Juli für unzugestellt
-- und schickte sie ein zweites Mal.
UPDATE "notification_log" SET "pushed_at" = "sent_at";

-- Alte Zeilen bleiben ohne Titel und tauchen in der Box deshalb nicht auf. Das
-- ist Absicht: Sie waren immer nur Entdopplung, und einen Titel nachzuerfinden
-- hieße, Nachrichten zu behaupten, die so nie dastanden.

-- „Meine ungelesenen, neueste zuerst" — die eine Abfrage, die die Glocke stellt.
CREATE INDEX "notification_log_person_id_read_at_sent_at_idx" ON "notification_log"("person_id", "read_at", "sent_at");
