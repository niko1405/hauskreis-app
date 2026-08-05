-- Profilbilder.
--
-- Nur der Zeitstempel steht in der Datenbank; die Datei liegt unter
-- `UPLOAD_DIR/people/{id}.webp`. Ein Dateiname in einer Spalte wäre eine
-- zweite Wahrheit über etwas, das ohnehin aus der Id folgt — und ein Name, der
-- sich nie ändert, wäre für den Browser für immer dasselbe Bild.
ALTER TABLE "person" ADD COLUMN "photo_updated_at" TIMESTAMP(3);
