-- Der Termin-Rhythmus wird einstellbar.
--
-- Drei Spalten an der Tabelle, die den Rhythmus ohnehin hält:
--
--   auto_generate   ob der nächtliche Lauf überhaupt Termine anlegt
--   interval_weeks  wie viele Wochen zwischen zwei Terminen liegen
--   praise_evenings ob der letzte im Monat ein Lobpreisabend wird
--
-- Alle drei mit einer Vorgabe, die **genau dem bisherigen Verhalten**
-- entspricht, und deshalb rückwirkend: Eine Gruppe, die nie in die Verwaltung
-- schaut, merkt von dieser Migration nichts. Ein Schalter, der bestehendes
-- Verhalten abschaltet, steht auf an — dieselbe Regel wie bei
-- `prayer_buddy_cycle_config.enabled`; auf aus steht nur, was etwas Neues
-- einlädt (`birthday_gift_config.enabled`).

ALTER TABLE "meeting_schedule_config" ADD COLUMN "auto_generate" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "meeting_schedule_config" ADD COLUMN "interval_weeks" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "meeting_schedule_config" ADD COLUMN "praise_evenings" BOOLEAN NOT NULL DEFAULT true;
