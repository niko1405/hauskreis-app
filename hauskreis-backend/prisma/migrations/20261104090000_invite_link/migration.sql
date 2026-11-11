-- Beitreten per Link.
--
-- Bisher kam man nur über eine E-Mail-Einladung in einen Hauskreis: Ein Admin
-- tippte eine Adresse ein, und das Anmelden verknüpfte über genau diese
-- Adresse. Der Link verknüpft über ein Geheimnis, nicht über die Adresse — wer
-- ihn hat, tritt bei, mit welchem Konto auch immer, und immer als Mitglied.
--
-- Höchstens einer je Hauskreis, deshalb ist die Gruppe selbst der Schlüssel.
-- Erneuern überschreibt den Code, Abschalten löscht die Zeile.
--
-- Dazu die Nachricht „Jemand kommt dazu" — das Gegenstück zu MEMBER_LEFT.
-- Entdoppelt wird über `related_key` (den Zeitpunkt des Ankommens), damit ein
-- Wiederkommen nach einem Austritt nicht als Dublette des ersten Ankommens
-- verschluckt wird.
--
-- Rein additiv.

CREATE TABLE "hauskreis_invite_link" (
    "hauskreis_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_person_id" UUID,
    "join_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "hauskreis_invite_link_pkey" PRIMARY KEY ("hauskreis_id")
);

CREATE UNIQUE INDEX "hauskreis_invite_link_code_key" ON "hauskreis_invite_link"("code");

ALTER TABLE "hauskreis_invite_link" ADD CONSTRAINT "hauskreis_invite_link_hauskreis_id_fkey" FOREIGN KEY ("hauskreis_id") REFERENCES "hauskreis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hauskreis_invite_link" ADD CONSTRAINT "hauskreis_invite_link_created_by_person_id_fkey" FOREIGN KEY ("created_by_person_id") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TYPE "notification_type" ADD VALUE 'MEMBER_JOINED';
