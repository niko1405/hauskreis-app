-- "Eingeladen, aber noch nicht da" war bisher nicht feststellbar: die
-- keycloak_user_id steht schon ab dem Einladen drin, weil das Konto vor der
-- Person angelegt wird. accepted_at wird beim ersten /api/me gesetzt.
ALTER TABLE "person" ADD COLUMN "accepted_at" TIMESTAMP(3);

-- Wer schon einmal angemeldet war, gilt als angekommen. Genauer geht es
-- rückwirkend nicht; der Zeitpunkt ist unbekannt, die Tatsache nicht.
UPDATE "person" SET "accepted_at" = "created_at" WHERE "keycloak_user_id" IS NOT NULL;
