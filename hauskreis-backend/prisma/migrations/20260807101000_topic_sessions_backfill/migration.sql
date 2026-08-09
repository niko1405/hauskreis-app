-- Die Themen ziehen in ihre Einheiten, dann schließen die alten Spalten.
--
-- Reihenfolge ist hier alles: `topic_responsible` und `meeting.topic_id` sind
-- bis zur letzten Anweisung die einzige Quelle dafür, wer wofür zuständig war.
-- Erst wenn alles kopiert ist, fallen sie.

-- 1. Owner
--
-- Vor diesem Modell gab es keinen. Genommen wird die alphabetisch erste
-- zuständige Person — willkürlich, aber stabil, und jede andere Wahl wäre es
-- ebenso. Die übrigen werden gleich Collaborator und dürfen genau dasselbe;
-- der Unterschied betrifft nur Löschen und Collaborator-Verwaltung.
UPDATE "topic" t
SET "owner_person_id" = (
  SELECT p."id"
  FROM "topic_responsible" tr
  JOIN "person" p ON p."id" = tr."person_id"
  WHERE tr."topic_id" = t."id"
  ORDER BY p."name", p."id"
  LIMIT 1
);

-- 2. Collaborators: alle bisherigen Zuständigen außer dem Owner.
INSERT INTO "topic_collaborator" ("topic_id", "person_id")
SELECT tr."topic_id", tr."person_id"
FROM "topic_responsible" tr
JOIN "topic" t ON t."id" = tr."topic_id"
WHERE t."owner_person_id" IS DISTINCT FROM tr."person_id";

-- 3. Je Abend mit Thema eine Einheit, die dessen Nachbereitung übernimmt.
--
-- Zeitstempel vom Termin geerbt, nicht `now()`: die Liste der Einheiten steht
-- chronologisch, und ein Stapel gleichzeitig angelegter Zeilen wäre keine
-- Chronologie.
INSERT INTO "topic_session" (
  "id", "topic_id", "meeting_id", "actionstep_text", "summary_text",
  "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), m."topic_id", m."id", m."actionstep_text", m."summary_text",
  m."created_at", m."updated_at"
FROM "meeting" m
WHERE m."topic_id" IS NOT NULL;

-- 4. Wer die Einheit gehalten hat — die Zuständigen des Themas, so gut wie es
-- geht. Feiner ging es nie: bisher wusste niemand, wer an *welchem* Abend dran
-- war, es stand nur am Thema.
INSERT INTO "topic_session_responsible" ("session_id", "person_id")
SELECT s."id", tr."person_id"
FROM "topic_session" s
JOIN "topic_responsible" tr ON tr."topic_id" = s."topic_id"
WHERE s."meeting_id" IS NOT NULL;

-- 5. Dieselben Personen werden die Zuteilung am Abend — die Rolle, die es bis
-- eben nicht gab.
INSERT INTO "meeting_topic_responsible" ("meeting_id", "person_id")
SELECT m."id", tr."person_id"
FROM "meeting" m
JOIN "topic_responsible" tr ON tr."topic_id" = m."topic_id"
WHERE m."topic_id" IS NOT NULL;

-- 6. Abende mit Nachbereitung, aber ohne Thema.
--
-- Sollte es kaum geben — die Bausteine räumen beides zusammen weg. Aber „kaum"
-- ist kein Grund, einen geschriebenen Text zu verlieren: jeder bekommt ein
-- eigenes titelloses Thema. Die Themen-Id ist die des Termins, damit die
-- Zuordnung ohne Zwischentabelle auskommt; sie liegt in einer anderen Tabelle
-- und kollidiert mit nichts. `COMPLETED`, weil ein nachträglich gefundener
-- Text nichts ist, was noch läuft.
INSERT INTO "topic" ("id", "hauskreis_id", "title", "status", "created_at", "updated_at")
SELECT m."id", m."hauskreis_id", NULL, 'COMPLETED', m."created_at", m."updated_at"
FROM "meeting" m
WHERE m."topic_id" IS NULL
  AND (m."summary_text" IS NOT NULL OR m."actionstep_text" IS NOT NULL);

INSERT INTO "topic_session" (
  "id", "topic_id", "meeting_id", "actionstep_text", "summary_text",
  "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), m."id", m."id", m."actionstep_text", m."summary_text",
  m."created_at", m."updated_at"
FROM "meeting" m
WHERE m."topic_id" IS NULL
  AND (m."summary_text" IS NOT NULL OR m."actionstep_text" IS NOT NULL);

-- Ein Abend, an dem jetzt eine Einheit hängt, hat auch den Baustein.
UPDATE "meeting" m
SET "has_topic_slot" = true, "has_testimony_slot" = false
WHERE EXISTS (SELECT 1 FROM "topic_session" s WHERE s."meeting_id" = m."id")
  AND NOT m."has_topic_slot";

-- 7. Die alten Wege schließen.
DROP TABLE "topic_responsible";

ALTER TABLE "meeting" DROP COLUMN "topic_id";
ALTER TABLE "meeting" DROP COLUMN "actionstep_text";
ALTER TABLE "meeting" DROP COLUMN "summary_text";
