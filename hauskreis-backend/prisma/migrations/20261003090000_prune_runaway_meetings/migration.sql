-- Räumt auf, was der Terminplaner zu viel angelegt hat.
--
-- Der Anker der Terminreihe — der späteste erzeugte Abend — wurde nur
-- vorwärts ausgerichtet. Im laufenden Betrieb liegt er aber vorne, sieben
-- Termine weit: Die Reihe begann dort statt bei heute, und jeder nächtliche
-- Lauf (und jeder Druck auf „Termine vorausplanen") legte sechs Abende
-- dahinter an. Der Fehler ist in `meeting-schedule.ts` behoben; was er
-- hinterlassen hat, steht noch im Kalender.
--
-- Gelöscht wird je Hauskreis jeder erzeugte, kommende Abend **hinter den
-- ersten sieben** — und nur, wenn niemand ihn angefasst hat. Was jemand dort
-- schon eingetragen hat, bleibt stehen, so weit es auch in der Zukunft liegt:
-- ein Ort, eine Rolle, ein Lied, ein Anliegen, eine eigene Antwort, ein Titel.
--
-- Nicht zählen die Zusagen, die der Server selbst schreibt (`AUTO` für „ich
-- bin grundsätzlich dabei", `ABSENCE` aus einem Abwesenheitszeitraum) — die
-- stehen an jedem dieser Abende und sagen nichts über ihn.
--
-- **Bekannte Grenze:** Ein umgestellter Baustein lässt sich nicht erkennen.
-- `version` taugt dafür nicht, sie steigt auch beim Abgleich der Anwesenheit.
-- Wer an einem Abend in drei Monaten nur die Lieder abgewählt hat, verliert
-- diese Einstellung; der Terminplaner legt den Abend bei Bedarf neu an.
--
-- `CURRENT_DATE` ist der Tag in UTC und nicht der der Gruppe. Um zwei Uhr
-- nachts in Berlin verschiebt das die Zählung höchstens um einen Abend, der
-- dann eben als achter stehen bleibt — in diese Richtung ist der Fehler harmlos.
--
-- Alle Kind-Tabellen hängen mit `ON DELETE CASCADE` am Termin; die
-- Benachrichtigungen dazu fallen damit mit.

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "hauskreis_id" ORDER BY "date") AS "n"
  FROM "meeting"
  WHERE "generated" = true
    AND "date" >= CURRENT_DATE
)
DELETE FROM "meeting" AS m
USING ranked AS r
WHERE m."id" = r."id"
  AND r."n" > 7
  AND m."status" = 'PLANNED'
  AND m."location_id" IS NULL
  AND m."host_person_id" IS NULL
  AND m."testimony_person_id" IS NULL
  AND m."title" IS NULL
  AND m."info_text" IS NULL
  AND m."summary_text" IS NULL
  AND m."actionstep_text" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "topic_session" t WHERE t."meeting_id" = m."id")
  AND NOT EXISTS (SELECT 1 FROM "meeting_topic_responsible" x WHERE x."meeting_id" = m."id")
  AND NOT EXISTS (SELECT 1 FROM "meeting_song_leader" x WHERE x."meeting_id" = m."id")
  AND NOT EXISTS (SELECT 1 FROM "meeting_snack_responsible" x WHERE x."meeting_id" = m."id")
  AND NOT EXISTS (SELECT 1 FROM "meeting_song" x WHERE x."meeting_id" = m."id")
  AND NOT EXISTS (SELECT 1 FROM "meeting_prayer_request" x WHERE x."meeting_id" = m."id")
  AND NOT EXISTS (SELECT 1 FROM "meeting_actionstep_done" x WHERE x."meeting_id" = m."id")
  AND NOT EXISTS (
    SELECT 1 FROM "meeting_attendance" a
    WHERE a."meeting_id" = m."id"
      AND a."source" IN ('SELF', 'ROLE')
  );
