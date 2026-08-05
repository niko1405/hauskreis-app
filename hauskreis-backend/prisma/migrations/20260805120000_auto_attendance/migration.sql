-- „Ich bin grundsätzlich dabei."
--
-- Wer jeden Dienstag kommt, tippt bisher jeden Dienstag dasselbe. Der Schalter
-- sagt kommende Abende im Voraus zu, und zwar rückwirkend beim Einschalten:
-- alle Termine ohne eigene Antwort bekommen ein `ATTENDING`.
--
-- `AUTO` ist dabei kein Beiwerk, sondern der ganze Punkt. `AbsenceSyncService`
-- überschreibt eine `SELF`-Zeile nie — eine ausdrückliche Antwort schlägt einen
-- pauschalen Zeitraum. Eine automatische Zusage als `SELF` zu speichern hieße
-- also, dass ein eingetragener Urlaub still wirkungslos bliebe: der Abend
-- stünde weiter auf „dabei", obwohl die Person nachweislich weg ist. `AUTO`
-- darf der Zeitraum überschreiben, `SELF` gewinnt weiter.
ALTER TYPE "attendance_source" ADD VALUE 'AUTO';

ALTER TABLE "person"
  ADD COLUMN "auto_attend" BOOLEAN NOT NULL DEFAULT false;
