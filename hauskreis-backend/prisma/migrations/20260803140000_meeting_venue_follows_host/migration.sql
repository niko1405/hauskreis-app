-- Ort und Gastgeber sind ab jetzt eine Entscheidung (MeetingService.resolveVenue).
-- Bestehende Termine können dem widersprechen: wer umzieht, lässt einen Abend
-- zurück, an dem der Gastgeber aus der einen und die Wohnung aus der anderen
-- Zeile stammt.
--
-- Aufgeräumt wird nur, was noch bevorsteht. Ein vergangener Abend hat
-- stattgefunden, und wo er stattgefunden hat, ist eine Tatsache — die zu
-- überschreiben, weil das Datenmodell heute strenger ist, wäre das Umschreiben
-- von Geschichte. Die Oberfläche zeigt solche Altfälle weiterhin so an, wie sie
-- notiert wurden; erst beim Bearbeiten greift die neue Regel.
UPDATE "meeting" AS m
SET "location_id" = p."location_id"
FROM "person" AS p
WHERE m."host_person_id" = p."id"
  AND m."date" >= CURRENT_DATE
  AND m."location_id" IS DISTINCT FROM p."location_id";

-- Ein Zuhause ohne seine Bewohner:innen ist kein gültiger Ort mehr. Auch hier
-- nur für Kommendes: der Termin behält seinen Gastgeber-losen Zustand, der Ort
-- wird frei und lässt sich neu wählen.
UPDATE "meeting" AS m
SET "location_id" = NULL
FROM "location" AS l
WHERE m."location_id" = l."id"
  AND m."host_person_id" IS NULL
  AND l."requires_host" = true
  AND m."date" >= CURRENT_DATE;
