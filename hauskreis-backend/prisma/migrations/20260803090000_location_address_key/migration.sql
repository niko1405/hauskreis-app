-- Der Name eines Zuhauses wird ab jetzt aus den Bewohner:innen abgeleitet
-- ("Bei Niko & Chris") und taugt damit nicht mehr als Schlüssel: zwei Menschen
-- mit demselben Vornamen ergäben denselben Namen. Der Schlüssel ist die
-- Adresse -- normalisiert, damit "Marienstr. 35" und "Marienstraße 35"
-- dieselbe Wohnung sind. Genau daran erkennt die App eine Wohngemeinschaft.
ALTER TABLE "location" ADD COLUMN "address_key" TEXT;

-- Nach denselben Regeln wie `normalizeAddress` in src/location/address.ts:
-- Kleinschreibung, Umlaute ausgeschrieben, Punkte zu Leerzeichen, "str" am
-- Wortende zu "strasse", dann alles weg, was weder Buchstabe noch Ziffer ist.
-- Postgres kennt kein Lookahead, deshalb wird das Folgezeichen mitgefangen und
-- wieder eingesetzt.
UPDATE "location"
SET "address_key" = regexp_replace(
  regexp_replace(
    replace(
      replace(
        replace(
          replace(
            replace(lower("address"), 'ä', 'ae'),
          'ö', 'oe'),
        'ü', 'ue'),
      'ß', 'ss'),
    '.', ' '),
  'str( |$|[0-9])', 'strasse\1', 'g'),
  '[^a-z0-9]', '', 'g')
WHERE "address" IS NOT NULL;

DROP INDEX "location_hauskreis_id_name_key";

-- NULL zählt in Postgres als verschieden: Orte ohne Anschrift (ein Treffpunkt
-- im Park) dürfen weiterhin mehrfach vorkommen.
CREATE UNIQUE INDEX "location_hauskreis_id_address_key_key" ON "location"("hauskreis_id", "address_key");
