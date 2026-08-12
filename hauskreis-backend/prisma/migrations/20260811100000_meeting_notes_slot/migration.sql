-- Der Baustein „Nachbereitung": Zusammenfassung und Actionstep an einem Abend
-- **ohne** Thema.
--
-- Die beiden Textspalten standen hier schon einmal und sind mit den Einheiten
-- weggezogen (20260807100000_topic_sessions). Sie kommen zurück, aber mit
-- anderer Bedeutung: an der Einheit gehören sie zum Thema und überleben einen
-- Rollenwechsel, hier gehören sie zum Abend und gehen mit ihm.
--
-- Der Schalter startet überall aus. Bestehende Abende ändern sich damit nicht:
-- wer ein Thema hat, hat seine Nachbereitung dort, und die beiden schließen
-- einander ohnehin aus.

ALTER TABLE "meeting" ADD COLUMN "has_notes_slot" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "meeting" ADD COLUMN "summary_text" TEXT;
ALTER TABLE "meeting" ADD COLUMN "actionstep_text" TEXT;
