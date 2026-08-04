-- Admin gehört zur Mitgliedschaft, nicht zum Menschen.
--
-- Bisher war „Admin" eine Realm-Rolle in Keycloak und galt damit überall.
-- Sobald sich jemand einen eigenen Hauskreis anlegt, stimmt das nicht mehr: er
-- ist dort Admin und im alten Mitglied.
CREATE TYPE "person_role" AS ENUM ('MEMBER', 'ADMIN');

ALTER TABLE "person"
  ADD COLUMN "role" "person_role" NOT NULL DEFAULT 'MEMBER';

-- Wer bisher die Realm-Rolle `admin` hatte, behält sie hier — nur weiß die
-- Datenbank nicht, wer das ist. Deshalb der pragmatische Weg: die erste Person
-- jedes Hauskreises wird Admin. Bei einer Gruppe, die per Seed entstanden ist,
-- ist das die, die ihn angelegt hat; ansonsten korrigiert es ein Admin in einer
-- Minute. Ein Hauskreis ganz ohne Admin wäre der schlechtere Ausgangspunkt —
-- niemand könnte mehr einladen.
UPDATE "person" p
SET "role" = 'ADMIN'
FROM (
  SELECT DISTINCT ON ("hauskreis_id") "id"
  FROM "person"
  WHERE "active" = true
  ORDER BY "hauskreis_id", "created_at" ASC
) first_member
WHERE p."id" = first_member."id";
