-- Drei neue Nachrichten und Kommentare an Geschenk-Vorschlägen.
--
-- Die Nachrichten: Halbzeit einer Gebetsrunde, ein neuer Kommentar an einem
-- Vorschlag, und die Bitte um Vorschläge von dem, der das Geschenk besorgt.
--
-- Die Kommentare hängen am Vorschlag und gehen mit ihm. Ihr Urheber darf gehen,
-- ohne sie mitzunehmen (`SET NULL`): Konto löschen heißt anonymisieren.
--
-- Rein additiv.

ALTER TYPE "notification_type" ADD VALUE 'PRAYER_BUDDY_HALFTIME';
ALTER TYPE "notification_type" ADD VALUE 'GIFT_IDEA_COMMENTED';
ALTER TYPE "notification_type" ADD VALUE 'BIRTHDAY_IDEAS_REQUESTED';

CREATE TABLE "gift_idea_comment" (
    "id" UUID NOT NULL,
    "gift_idea_id" UUID NOT NULL,
    "author_person_id" UUID,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_idea_comment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "gift_idea_comment_gift_idea_id_created_at_idx" ON "gift_idea_comment"("gift_idea_id", "created_at");

CREATE INDEX "gift_idea_comment_author_person_id_idx" ON "gift_idea_comment"("author_person_id");

ALTER TABLE "gift_idea_comment" ADD CONSTRAINT "gift_idea_comment_gift_idea_id_fkey" FOREIGN KEY ("gift_idea_id") REFERENCES "gift_idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gift_idea_comment" ADD CONSTRAINT "gift_idea_comment_author_person_id_fkey" FOREIGN KEY ("author_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
