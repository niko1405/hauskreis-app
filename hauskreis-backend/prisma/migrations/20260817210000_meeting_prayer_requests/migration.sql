-- Gebetsanliegen: eines je Person und Abend.
--
-- Bis hierher gab es dafür keinen Ort in der App. Wofür gebetet werden soll,
-- stand im Gruppenchat, ging unter, und am Abend fragte jemand „hatte nicht
-- jemand was?" — genau das Muster, gegen das diese App gebaut ist.
--
-- Der zusammengesetzte Primärschlüssel **ist** die Regel „genau eines": Sie
-- muss dadurch nirgends geprüft werden. „Wofür sollen wir beten" ist eine
-- Frage, auf die man eine Antwort gibt; eine Liste eigener Anliegen wäre schon
-- die nächste Sache, nämlich ein Notizbuch.
--
-- Kein `version`: Ändern kann diese Zeile nur die Person, der sie gehört, ein
-- Wettlauf um sie gibt es also nicht. `updated_at` reicht, um zu zeigen, wann
-- zuletzt etwas dastand.
CREATE TABLE "meeting_prayer_request" (
    "meeting_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_prayer_request_pkey" PRIMARY KEY ("meeting_id","person_id")
);

-- Für den Weg von der Person aus — beim Löschen eines Kontos werden alle
-- Anliegen dieser Person weggeräumt, quer über alle Abende.
CREATE INDEX "meeting_prayer_request_person_id_idx" ON "meeting_prayer_request"("person_id");

-- Beide Seiten CASCADE: ein gelöschter Termin und eine gelöschte Person lassen
-- kein Anliegen zurück, das auf nichts mehr zeigt. Beim **Anonymisieren**
-- greift das nicht — dort bleibt die Zeile stehen, und der Dienst räumt die
-- Anliegen ausdrücklich mit weg (`PersonService`, `MembershipService`).
ALTER TABLE "meeting_prayer_request"
  ADD CONSTRAINT "meeting_prayer_request_meeting_id_fkey"
  FOREIGN KEY ("meeting_id") REFERENCES "meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "meeting_prayer_request"
  ADD CONSTRAINT "meeting_prayer_request_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
