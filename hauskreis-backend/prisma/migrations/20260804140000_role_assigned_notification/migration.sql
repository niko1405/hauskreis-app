-- „Du wurdest eingeteilt."
--
-- Bisher gab es nur die drei Vorab-Erinnerungen: fünf Tage vor dem Abend hört
-- man, dass man dran ist. Bis dahin steht die Zuteilung nur in der App, und wer
-- nicht hineinschaut, erfährt sie nicht — das eigentliche Problem, das die App
-- lösen sollte (CLAUDE.md §2: „geht unter, niemand hat den Überblick").
--
-- `related_role` ist dabei kein Beiwerk. Ohne die Spalte hielte
-- `NotificationService.hasBeenSent` die Einteilung zur Musik für eine Dublette
-- der Gastgeber-Einteilung am selben Abend — wer beides macht, bekäme nur eine
-- Nachricht. Der Termin allein ist nicht unterscheidbar genug, genau wie schon
-- bei `related_person_id` (zwei Absagen für denselben Abend).
CREATE TYPE "assignment_role" AS ENUM ('HOST', 'TOPIC', 'SONG');

ALTER TYPE "notification_type" ADD VALUE 'ROLE_ASSIGNED';

ALTER TABLE "notification_log" ADD COLUMN "related_role" "assignment_role";

-- Der Schlüssel, an dem die Entdopplung hängt. Wie zuvor erzwingt er für sich
-- genommen wenig — Postgres hält Zeilen mit NULL im Tupel für verschieden —,
-- aber er macht die Abfrage in `hasBeenSent` zu einem Index-Zugriff.
DROP INDEX "notification_log_person_id_type_related_meeting_id_related__key";

CREATE UNIQUE INDEX "notification_log_dedup_key"
  ON "notification_log" (
    "person_id",
    "type",
    "related_meeting_id",
    "related_group_id",
    "related_person_id",
    "related_role"
  );
