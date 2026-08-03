-- Der Actionstep wird pro Person abgehakt, nicht pro Abend.
--
-- Ein Häkchen am Termin hätte bedeutet: einer hakt ab, für alle. Der
-- Actionstep ist aber ein Vorsatz, den sich jede:r einzeln nimmt — dass
-- eine Person ihn geschafft hat, sagt über die anderen acht nichts.
--
-- Kein Boolean, sondern die reine Anwesenheit einer Zeile: abgehakt oder
-- nicht abgehakt. Ein dritter Zustand wäre erfunden, und `done_at` bleibt
-- deshalb NOT NULL — eine Zeile ohne Zeitpunkt gibt es nicht.
CREATE TABLE "meeting_actionstep_done" (
    "meeting_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "done_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_actionstep_done_pkey" PRIMARY KEY ("meeting_id","person_id")
);

-- Für „was habe ich alles abgehakt" von der Personenseite aus. Der
-- Primärschlüssel deckt nur die andere Richtung ab.
CREATE INDEX "meeting_actionstep_done_person_id_idx" ON "meeting_actionstep_done"("person_id");

-- Beide Seiten CASCADE: ein gelöschter Termin und eine gelöschte Person
-- lassen kein Häkchen zurück, das auf nichts mehr zeigt.
ALTER TABLE "meeting_actionstep_done"
  ADD CONSTRAINT "meeting_actionstep_done_meeting_id_fkey"
  FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "meeting_actionstep_done"
  ADD CONSTRAINT "meeting_actionstep_done_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
