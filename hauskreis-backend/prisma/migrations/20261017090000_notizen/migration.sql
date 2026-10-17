-- Notizen: Texte, an denen mehrere schreiben, ohne dass sie an einem Abend
-- hängen.
--
-- Wer sie angelegt hat, darf gehen, ohne sie mitzunehmen (`SET NULL`): Konto
-- löschen heißt anonymisieren. Wer mitschreibt, ist ein Recht und keine
-- Zuschreibung — die Zeile geht mit der Person und mit der Notiz.
--
-- Dazu eine Nachricht, wenn jemand dich dazunimmt.
--
-- Rein additiv.

ALTER TYPE "notification_type" ADD VALUE 'NOTE_SHARED';

CREATE TABLE "note" (
    "id" UUID NOT NULL,
    "hauskreis_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "for_everyone" BOOLEAN NOT NULL DEFAULT false,
    "created_by_person_id" UUID,
    "updated_by_person_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "note_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "note_member" (
    "note_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_member_pkey" PRIMARY KEY ("note_id","person_id")
);

CREATE INDEX "note_hauskreis_id_updated_at_idx" ON "note"("hauskreis_id", "updated_at");

CREATE INDEX "note_created_by_person_id_idx" ON "note"("created_by_person_id");

CREATE INDEX "note_member_person_id_idx" ON "note_member"("person_id");

ALTER TABLE "note" ADD CONSTRAINT "note_hauskreis_id_fkey" FOREIGN KEY ("hauskreis_id") REFERENCES "hauskreis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "note" ADD CONSTRAINT "note_created_by_person_id_fkey" FOREIGN KEY ("created_by_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "note" ADD CONSTRAINT "note_updated_by_person_id_fkey" FOREIGN KEY ("updated_by_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "note_member" ADD CONSTRAINT "note_member_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "note_member" ADD CONSTRAINT "note_member_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
