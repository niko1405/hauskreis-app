-- Geburtstage und Geschenke.
--
-- `person.birthdate` gab es seit dem ersten Tag und niemand las es je. Hier
-- bekommt es seine Aufgabe: Wer wann Geburtstag hat, wer das Geschenk besorgt,
-- was vorgeschlagen wurde und was es geworden ist.
--
-- Vier Tabellen, und die Aufteilung ist die eigentliche Entscheidung:
--
--   * `birthday_occasion` ist **ein** Geburtstag in **einem** Jahr. Die
--     Zuständigkeit steht darin und wird nicht bei jedem Aufruf gerechnet:
--     Vergangenes gehört zur Geschichte, Nahes darf nicht mehr wechseln.
--   * `gift_idea` hängt an der **Person**, nicht am Geburtstag. Was letztes
--     Jahr nicht genommen wurde, ist dieses Jahr immer noch eine gute Idee —
--     und was genommen wurde, muss man kennen, um es nicht zweimal zu
--     schenken.
--   * `gift_idea_vote` ist eine Zustimmung als bloße Zeile, wie
--     `meeting_actionstep_done`. Zugestimmt oder nicht, ein dritter Zustand
--     wäre erfunden.
--   * `birthday_gift_config` und `birthday_gift_pairing` sind die Verwaltung:
--     ob überhaupt, rotierend oder fest, und wie lang die Frist ist, in der
--     sich nichts mehr ändert.
--
-- `birthday_gift_config.enabled` steht auf `false`. Nicht jeder Hauskreis
-- schenkt sich etwas, und ein System, das ungefragt Zuständigkeiten verteilt
-- und Nachrichten verschickt, wäre für die ein Ärgernis. Die Geburtstage im
-- Kalender kosten dagegen niemanden etwas — die stehen von Anfang an da.

CREATE TYPE "birthday_gift_mode" AS ENUM ('ROTATING', 'MANUAL');

-- Der Entdopplungs-Schlüssel bekommt eine Spalte dazu und muss deshalb neu
-- gebaut werden. Ohne `related_occasion_id` wäre die Erinnerung „du besorgst
-- das Geschenk für Mira" in jedem Jahr dieselbe Nachricht wie im ersten — und
-- käme genau einmal im Leben an. `related_person_id` reicht dafür nicht: Mira
-- hat jedes Jahr Geburtstag.
DROP INDEX "notification_log_dedup_key";

-- AlterTable
ALTER TABLE "notification_log" ADD COLUMN     "related_occasion_id" UUID;

-- CreateTable
CREATE TABLE "birthday_gift_config" (
    "id" UUID NOT NULL,
    "hauskreis_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "mode" "birthday_gift_mode" NOT NULL DEFAULT 'ROTATING',
    "freeze_days" INTEGER NOT NULL DEFAULT 14,
    "pairings_repaired_at" TIMESTAMP(3),
    "updated_by_person_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "birthday_gift_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "birthday_gift_pairing" (
    "hauskreis_id" UUID NOT NULL,
    "birthday_person_id" UUID NOT NULL,
    "responsible_person_id" UUID NOT NULL,

    CONSTRAINT "birthday_gift_pairing_pkey" PRIMARY KEY ("hauskreis_id","birthday_person_id")
);

-- CreateTable
CREATE TABLE "birthday_occasion" (
    "id" UUID NOT NULL,
    "hauskreis_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "occurs_on" DATE NOT NULL,
    "responsible_person_id" UUID,
    "selected_gift_idea_id" UUID,
    "price_cents" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "birthday_occasion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_idea" (
    "id" UUID NOT NULL,
    "hauskreis_id" UUID NOT NULL,
    "for_person_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "url" TEXT,
    "proposed_by_person_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_idea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_idea_vote" (
    "gift_idea_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_idea_vote_pkey" PRIMARY KEY ("gift_idea_id","person_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "birthday_gift_config_hauskreis_id_key" ON "birthday_gift_config"("hauskreis_id");

-- CreateIndex
CREATE INDEX "birthday_gift_pairing_responsible_person_id_idx" ON "birthday_gift_pairing"("responsible_person_id");

-- CreateIndex
CREATE INDEX "birthday_occasion_hauskreis_id_occurs_on_idx" ON "birthday_occasion"("hauskreis_id", "occurs_on");

-- CreateIndex
CREATE INDEX "birthday_occasion_responsible_person_id_idx" ON "birthday_occasion"("responsible_person_id");

-- CreateIndex
CREATE UNIQUE INDEX "birthday_occasion_person_id_occurs_on_key" ON "birthday_occasion"("person_id", "occurs_on");

-- CreateIndex
CREATE INDEX "gift_idea_hauskreis_id_for_person_id_idx" ON "gift_idea"("hauskreis_id", "for_person_id");

-- CreateIndex
CREATE INDEX "gift_idea_vote_person_id_idx" ON "gift_idea_vote"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_log_dedup_key" ON "notification_log"("person_id", "type", "related_meeting_id", "related_group_id", "related_person_id", "related_role", "related_release_version", "related_occasion_id");

-- AddForeignKey
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_related_occasion_id_fkey" FOREIGN KEY ("related_occasion_id") REFERENCES "birthday_occasion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birthday_gift_config" ADD CONSTRAINT "birthday_gift_config_hauskreis_id_fkey" FOREIGN KEY ("hauskreis_id") REFERENCES "hauskreis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birthday_gift_config" ADD CONSTRAINT "birthday_gift_config_updated_by_person_id_fkey" FOREIGN KEY ("updated_by_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birthday_gift_pairing" ADD CONSTRAINT "birthday_gift_pairing_hauskreis_id_fkey" FOREIGN KEY ("hauskreis_id") REFERENCES "hauskreis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birthday_gift_pairing" ADD CONSTRAINT "birthday_gift_pairing_birthday_person_id_fkey" FOREIGN KEY ("birthday_person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birthday_gift_pairing" ADD CONSTRAINT "birthday_gift_pairing_responsible_person_id_fkey" FOREIGN KEY ("responsible_person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birthday_occasion" ADD CONSTRAINT "birthday_occasion_hauskreis_id_fkey" FOREIGN KEY ("hauskreis_id") REFERENCES "hauskreis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birthday_occasion" ADD CONSTRAINT "birthday_occasion_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birthday_occasion" ADD CONSTRAINT "birthday_occasion_responsible_person_id_fkey" FOREIGN KEY ("responsible_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birthday_occasion" ADD CONSTRAINT "birthday_occasion_selected_gift_idea_id_fkey" FOREIGN KEY ("selected_gift_idea_id") REFERENCES "gift_idea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_idea" ADD CONSTRAINT "gift_idea_hauskreis_id_fkey" FOREIGN KEY ("hauskreis_id") REFERENCES "hauskreis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_idea" ADD CONSTRAINT "gift_idea_for_person_id_fkey" FOREIGN KEY ("for_person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_idea" ADD CONSTRAINT "gift_idea_proposed_by_person_id_fkey" FOREIGN KEY ("proposed_by_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_idea_vote" ADD CONSTRAINT "gift_idea_vote_gift_idea_id_fkey" FOREIGN KEY ("gift_idea_id") REFERENCES "gift_idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_idea_vote" ADD CONSTRAINT "gift_idea_vote_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

