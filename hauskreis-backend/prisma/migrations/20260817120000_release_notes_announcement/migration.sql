-- Eine neue Benachrichtigungsart und die Spalte, die sie unterscheidbar macht.
--
-- Ohne `related_release_version` wären bei einer Release-Ankündigung alle
-- vier `related_*`-Spalten leer, und die Entdopplung in
-- `NotificationService.hasBeenSent` ließe je Person genau eine durch — für
-- immer. Der zweite Release käme nie an.

-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE 'RELEASE_NOTES';

-- AlterTable
ALTER TABLE "notification_log" ADD COLUMN     "related_release_version" TEXT;

-- Der Entdopplungs-Schlüssel bekommt die neue Spalte. Neu angelegt statt
-- geändert, weil Postgres einen Unique-Index nicht erweitern kann.
-- DropIndex
DROP INDEX "notification_log_dedup_key";

-- CreateIndex
CREATE UNIQUE INDEX "notification_log_dedup_key" ON "notification_log"("person_id", "type", "related_meeting_id", "related_group_id", "related_person_id", "related_role", "related_release_version");

-- Beantwortet „wurde diese Fassung schon angekündigt?" als Index-Lookup.
-- CreateIndex
CREATE INDEX "notification_log_type_related_release_version_idx" ON "notification_log"("type", "related_release_version");
