-- Der Nutzername, mit dem man sich anmeldet — und mit dem die App ihn kennt.
--
-- Bisher hießen dieselben Menschen an zwei Stellen verschieden: in Keycloak so,
-- wie sie sich beim Aktivieren des Kontos genannt haben, in der App so, wie es
-- der Admin beim Einladen eingetippt hatte. Wer seinen Namen im Profil änderte,
-- konnte sich danach mit dem neuen nicht anmelden.
--
-- **Global** eindeutig und nicht je Hauskreis: Keycloak erzwingt Eindeutigkeit
-- realmweit, und ein Datenmodell, das eine schwächere Regel abbildet, kann sie
-- nur verletzen.
--
-- Getrennt von `name` und nicht statt seiner: Keycloak normalisiert auf
-- Kleinschreibung, „niko" stünde sonst auf jeder Karte. Zwei Felder mit einer
-- klaren Richtung sind ehrlicher als eines mit zwei Wahrheiten.
--
-- Nullable, weil die Zeile beim Einladen entsteht und der Mensch seinen Namen
-- erst beim ersten Anmelden wählt. Wer geht, gibt ihn wieder frei — wie die
-- `keycloak_user_id`: das Konto behält seinen Namen, die Zeile hält ihn nicht
-- länger besetzt.
ALTER TABLE "person" ADD COLUMN "username" TEXT;

CREATE UNIQUE INDEX "person_username_key" ON "person" ("username");
