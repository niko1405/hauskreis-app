-- Wie viel später jemand kommt (Minuten), nur bei einer Zusage.
ALTER TABLE "meeting_attendance" ADD COLUMN "late_minutes" INTEGER;
