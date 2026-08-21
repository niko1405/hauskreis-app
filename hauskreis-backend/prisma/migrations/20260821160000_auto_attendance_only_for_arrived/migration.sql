-- Zusagen, die `AutoAttendanceService` für Personen geschrieben hat, die sich
-- **nie angemeldet** haben.
--
-- Der Lauf fragte nur nach `active`, und eine eingeladene Person ist von der
-- ersten Sekunde an aktiv — ihre Zeile entsteht beim Einladen. Stand bei ihr
-- `auto_attend` (der Seed setzt es), sagte sie jeden Dienstag zu, ohne die App
-- je geöffnet zu haben. Auf der Terminkarte stand damit eine Zusage mehr, als
-- die Anwesenheitsliste kannte: Die rechnet mit `ANGEKOMMEN` und ließ dieselbe
-- Person weg.
--
-- Eng gefasst und deshalb ungefährlich: **nur** `AUTO`. Eine `SELF`-Zeile hat
-- ein Mensch getippt, eine `ABSENCE`-Zeile leitet sich aus einem Urlaub ab —
-- beide bleiben, auch wenn `accepted_at` fehlt. Was hier fällt, hat nie jemand
-- gemeint.
DELETE FROM "meeting_attendance" a
 USING "person" p
 WHERE p."id" = a."person_id"
   AND a."source" = 'AUTO'
   AND p."accepted_at" IS NULL;

-- Die Anwesenheit steht in der Antwort des Termins, und dessen ETag hängt an
-- seiner Version. Ohne den Sprung käme der alte Stand als `304` zurück.
UPDATE "meeting" m
   SET "version" = m."version" + 1
 WHERE EXISTS (
   SELECT 1
     FROM "person" p
    WHERE p."hauskreis_id" = m."hauskreis_id"
      AND p."accepted_at" IS NULL
      AND p."auto_attend"
 );
