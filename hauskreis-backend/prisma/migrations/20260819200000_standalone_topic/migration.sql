-- Die Hülle um eine einzelne Einheit.
--
-- Nur eine Spalte mit Vorgabe: alles, was es bisher gibt, ist ein echtes Thema.
ALTER TABLE "topic" ADD COLUMN "standalone" BOOLEAN NOT NULL DEFAULT false;
