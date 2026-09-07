-- Die Terminart fällt weg; übrig bleibt die eine Frage, die kein Baustein
-- beantwortet: hat der nächtliche Lauf diesen Abend angelegt, oder ein Mensch?
--
-- `STANDARD` gegen `LOBPREIS_GEBET` war reine Doppelung — woraus ein Abend
-- besteht, sagen `has_topic_slot` und Geschwister genauer. `CUSTOM` dagegen
-- trug den Unterschied, an dem der Taktschlag der Terminreihe, zwei
-- Benachrichtigungsarten, die Actionstep-Ausnahme und „löschen statt absagen"
-- hängen.
--
-- Reihenfolge: erst füllen, dann wegwerfen. Danach ist die Migration nicht mehr
-- umkehrbar — die Zeilen wissen hinterher nicht mehr, ob sie einmal
-- Lobpreisabende waren. Das ist in Ordnung: Ihre Bausteine sagen es.

ALTER TABLE "meeting" ADD COLUMN "generated" BOOLEAN NOT NULL DEFAULT false;

UPDATE "meeting" SET "generated" = true WHERE "type" <> 'CUSTOM';

ALTER TABLE "meeting" DROP COLUMN "type";

DROP TYPE "meeting_type";
