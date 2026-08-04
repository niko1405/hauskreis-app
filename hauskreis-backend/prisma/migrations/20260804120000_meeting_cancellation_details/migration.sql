-- Warum ein Abend ausfällt, nicht nur dass er ausfällt.
--
-- `status = CANCELLED` war die ganze Information. Auf dem Bildschirm blieb
-- damit ein durchgestrichener Termin ohne Erklärung stehen — und genau die
-- Fragen offen, die er beantworten sollte: seit wann, von wem, warum.
--
-- `cancel_source` ist dabei mehr als Buchhaltung: nur eine automatische Absage
-- („alle haben abgesagt") wird auch automatisch wieder zurückgenommen, sobald
-- jemand doch zusagt. Eine von Hand abgesagte bleibt abgesagt, bis ein Mensch
-- etwas anderes sagt. Deshalb eine eigene Spalte und nicht der Rückschluss aus
-- `cancelled_by_person_id IS NULL` — der wäre für den Altbestand unten falsch
-- und würde längst abgesagte Abende wieder aufleben lassen.
CREATE TYPE "meeting_cancel_source" AS ENUM ('MANUAL', 'ALL_DECLINED');

ALTER TABLE "meeting"
  ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "cancelled_by_person_id" UUID,
  ADD COLUMN "cancel_source" "meeting_cancel_source",
  ADD COLUMN "cancel_reason" TEXT;

ALTER TABLE "meeting"
  ADD CONSTRAINT "meeting_cancelled_by_person_id_fkey"
  FOREIGN KEY ("cancelled_by_person_id") REFERENCES "person"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Der Altbestand gilt als von Hand abgesagt. Wer es war, weiß niemand mehr, und
-- `updated_at` ist für das Wann die beste Schätzung, die es gibt — besser als
-- ein „abgesagt" ganz ohne Datum. Wichtig ist vor allem `MANUAL`: sonst würde
-- der Abgleich diese Termine beim nächsten Anlass wieder aufleben lassen.
UPDATE "meeting"
SET "cancelled_at" = "updated_at", "cancel_source" = 'MANUAL'
WHERE "status" = 'CANCELLED';
