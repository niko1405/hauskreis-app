-- Kein Baustein aus, an dem noch etwas hängt.
--
-- Die Migration davor hat die Slots nach der Terminart gesetzt. Für
-- LOBPREIS_GEBET hieß das `has_topic_slot = false` — auch dann, wenn an dem
-- Abend ein Thema hing. Herausgekommen wäre ein Zustand, den die Anwendung
-- selbst nie erzeugen würde und beim nächsten Schreiben mit 400 ablehnt: ein
-- Feld, das gesetzt ist, obwohl es der Termin gar nicht haben darf.
--
-- Deshalb hier die Gegenrichtung: ein Baustein ist an, wenn die Terminart ihn
-- vorsieht **oder** an ihm etwas hängt. Nichts wird still weggeräumt; wer
-- einmal eine Zusammenfassung geschrieben hat, findet sie wieder.
--
-- Für neue Termine gilt das nicht — ein besonderer Termin startet leer und
-- bekommt einzeln dazugebucht, was er braucht.
UPDATE "meeting"
SET "has_host_slot" = "has_host_slot"
      OR "host_person_id" IS NOT NULL
      OR "location_id" IS NOT NULL,
    "has_topic_slot" = "has_topic_slot"
      OR "topic_id" IS NOT NULL
      OR "summary_text" IS NOT NULL
      OR "actionstep_text" IS NOT NULL,
    "has_song_slot" = "has_song_slot"
      OR EXISTS (SELECT 1 FROM "meeting_song" s WHERE s."meeting_id" = "meeting"."id")
      OR EXISTS (SELECT 1 FROM "meeting_song_leader" l WHERE l."meeting_id" = "meeting"."id"),
    "has_testimony_slot" = "has_testimony_slot" OR "testimony_text" IS NOT NULL;
