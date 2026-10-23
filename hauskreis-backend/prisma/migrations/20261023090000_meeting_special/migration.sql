-- Ob ein Termin aus dem Rhythmus fällt. Bestehende behalten ihr Verhalten:
-- Bisher galt jeder von Hand angelegte als besonders.
ALTER TABLE "meeting" ADD COLUMN "special" BOOLEAN NOT NULL DEFAULT false;
UPDATE "meeting" SET "special" = NOT "generated";
