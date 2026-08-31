-- Zwei Bausteine der Gruppe zum Abschalten, und eine Nachricht für neue Admins.
--
-- Beide Schalter stehen bei ihrer eigenen Einstellung und nicht in einer
-- gemeinsamen Tabelle: `prayer_buddy_cycle_config` hält schon fest, wie lange
-- eine Gebetsrunde dauert, `meeting_schedule_config` schon, wann sich die
-- Gruppe trifft. Eine dritte Tabelle für zwei Boolesche wäre ein dritter Ort
-- für dieselbe Frage.
--
-- `DEFAULT true` gilt in beiden Fällen auch rückwirkend, und das ist der
-- Punkt: Alles andere hieße, dass beim Aufspielen dieser Migration jeder
-- bestehenden Gruppe die Gebetsbuddys und der Wochen-Actionstep abhandenkommen.

ALTER TABLE "prayer_buddy_cycle_config" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "meeting_schedule_config" ADD COLUMN "weekly_actionstep" BOOLEAN NOT NULL DEFAULT true;

ALTER TYPE "notification_type" ADD VALUE 'ADMIN_GRANTED';
