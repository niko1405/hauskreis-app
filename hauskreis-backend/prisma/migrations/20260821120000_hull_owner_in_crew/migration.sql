-- Bei einer Hülle bleibt der Owner in der Vorbereitung.
--
-- Vorher konnte er sich herausnehmen: Die Liste auf der Seite der Einheit ist
-- das Einzige, was man dort sieht, und er verschwand daraus — behielt aber über
-- `topic.owner_person_id` weiter jedes Recht. Zwei Aussagen über dieselbe
-- Person, von denen die sichtbare falsch war.
--
-- Die Regel steht ab jetzt in `setSessionResponsibles`. Damit sie auch für den
-- Bestand stimmt, kommt er hier zurück. `ON CONFLICT DO NOTHING`: Wo er schon
-- steht — der Normalfall —, passiert nichts.
INSERT INTO "topic_session_responsible" ("session_id", "person_id")
SELECT s."id", t."owner_person_id"
  FROM "topic_session" s
  JOIN "topic" t ON t."id" = s."topic_id"
 WHERE t."standalone" AND t."owner_person_id" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Ohne den Versionssprung antwortet der Server mit 304 und dem alten Stand:
-- Die Crew steht in der Antwort der Einheit *und* in der des Themas, und beide
-- haben sich gerade geändert.
UPDATE "topic_session"
   SET "version" = "version" + 1
 WHERE "topic_id" IN (SELECT "id" FROM "topic" WHERE "standalone");

UPDATE "topic" SET "version" = "version" + 1 WHERE "standalone";
