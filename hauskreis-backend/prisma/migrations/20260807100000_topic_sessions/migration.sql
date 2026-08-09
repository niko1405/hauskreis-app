-- Das Thema bekommt Einheiten, und „Thema" wird eine Rolle am Abend.
--
-- Bis hier hing die Zuständigkeit an der Themen-Entität. Ein Rollenwechsel
-- schrieb damit rückwirkend jeden Abend um, an dem das Thema je dran war, und
-- eine Vorbereitung ohne Termin hatte gar keinen Ort. Drei Dinge, die in einer
-- Tabelle steckten, werden getrennt: **Zuständigkeit** (wer ist für diesen
-- Abend zugeteilt), **Auswahl** (welche Einheit hängt daran) und **Inhalt**.
--
-- Diese Migration legt nur an. Die Daten ziehen um und die alten Spalten
-- schließen sich in `..._topic_sessions_backfill` — getrennt, damit ein
-- fehlgeschlagener Umzug nicht auf halb abgerissenen Spalten sitzt.

-- Der Überblick über alle Einheiten. Die Nachbereitung des einzelnen Abends
-- steht an der Einheit, nicht hier.
ALTER TABLE "topic" ADD COLUMN "summary_text" TEXT;

-- Wem das Thema gehört. Nullable, weil die Themen von vor diesem Modell keinen
-- Owner haben und weil jemand den Hauskreis verlassen kann, ohne sein Thema
-- mitzunehmen.
ALTER TABLE "topic" ADD COLUMN "owner_person_id" UUID;

ALTER TABLE "topic"
  ADD CONSTRAINT "topic_owner_person_id_fkey"
  FOREIGN KEY ("owner_person_id") REFERENCES "person"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "topic_session" (
    "id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "meeting_id" UUID,
    "title" TEXT,
    "actionstep_text" TEXT,
    "summary_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "topic_session_pkey" PRIMARY KEY ("id")
);

-- An einem Abend hängt höchstens eine Einheit — und genau dieser Index ist die
-- Absicherung dafür, dass von zwei gleichzeitig Zugeteilten nur eine:r wählt:
-- der zweite Schreibvorgang läuft in den Konflikt statt in eine zweite Einheit.
-- `NULL` zählt in Postgres als verschieden, unfertige Einheiten stören sich
-- also nicht gegenseitig.
CREATE UNIQUE INDEX "topic_session_meeting_id_key" ON "topic_session"("meeting_id");

-- CreateIndex
CREATE INDEX "topic_session_topic_id_idx" ON "topic_session"("topic_id");

-- CreateTable
CREATE TABLE "topic_session_responsible" (
    "session_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,

    CONSTRAINT "topic_session_responsible_pkey" PRIMARY KEY ("session_id","person_id")
);

-- CreateIndex
CREATE INDEX "topic_session_responsible_person_id_idx" ON "topic_session_responsible"("person_id");

-- CreateTable
CREATE TABLE "topic_collaborator" (
    "topic_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,

    CONSTRAINT "topic_collaborator_pkey" PRIMARY KEY ("topic_id","person_id")
);

-- CreateIndex
CREATE INDEX "topic_collaborator_person_id_idx" ON "topic_collaborator"("person_id");

-- CreateTable
CREATE TABLE "meeting_topic_responsible" (
    "meeting_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,

    CONSTRAINT "meeting_topic_responsible_pkey" PRIMARY KEY ("meeting_id","person_id")
);

-- CreateIndex
CREATE INDEX "meeting_topic_responsible_person_id_idx" ON "meeting_topic_responsible"("person_id");

-- AddForeignKey
ALTER TABLE "topic_session"
  ADD CONSTRAINT "topic_session_topic_id_fkey"
  FOREIGN KEY ("topic_id") REFERENCES "topic"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL und nicht CASCADE: verschwindet ein Termin, ist die Vorbereitung
-- nicht verschwunden, sondern wieder unfertig.
ALTER TABLE "topic_session"
  ADD CONSTRAINT "topic_session_meeting_id_fkey"
  FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_session_responsible"
  ADD CONSTRAINT "topic_session_responsible_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "topic_session"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_session_responsible"
  ADD CONSTRAINT "topic_session_responsible_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "person"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_collaborator"
  ADD CONSTRAINT "topic_collaborator_topic_id_fkey"
  FOREIGN KEY ("topic_id") REFERENCES "topic"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_collaborator"
  ADD CONSTRAINT "topic_collaborator_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "person"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_topic_responsible"
  ADD CONSTRAINT "meeting_topic_responsible_meeting_id_fkey"
  FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_topic_responsible"
  ADD CONSTRAINT "meeting_topic_responsible_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "person"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
