-- Testimony lässt sich für eine Gruppe abschalten.
--
-- Voreingestellt an, auch für bestehende Gruppen: das hier ist ein
-- Abschalten und keine Einladung. Was das Abschalten an den kommenden
-- Abenden wegräumt, erledigt der Dienst beim Umlegen (MeetingScheduleConfigService).
--
-- Rein additiv.

ALTER TABLE "meeting_schedule_config" ADD COLUMN "testimony" BOOLEAN NOT NULL DEFAULT true;
