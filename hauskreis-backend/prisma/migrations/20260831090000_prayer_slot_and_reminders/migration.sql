-- Gebetsanliegen werden ein Baustein — und zwei neue Erinnerungen.
--
-- **Der Baustein.** Gebetsanliegen waren der letzte Abschnitt eines Termins
-- ohne Schalter: Sie standen an jedem, auch am Geburtstag und an der Freizeit,
-- während Thema, Lieder, Testimony und Nachbereitung längst einzeln zubuchbar
-- waren.
--
-- `DEFAULT true`, und damit auch für alles, was schon in der Datenbank steht.
-- Alles andere hieße, dass an jedem Abend im Archiv die Anliegen verschwinden,
-- die dort stehen — geschrieben von Menschen über sich selbst.
--
-- Er schließt nichts aus und teilt niemanden ein: Ein Anliegen bringt jede:r
-- für sich mit, auch wer an dem Abend fehlt. Deshalb steht er in `SLOT_FIELDS`
-- mit einer leeren Feldliste — was beim Abschalten wegzuräumen ist, liegt in
-- `meeting_prayer_request` und nicht in einer Spalte hier.
ALTER TABLE "meeting" ADD COLUMN "has_prayer_slot" BOOLEAN NOT NULL DEFAULT true;

-- **Zwei Nachrichten, die bisher fehlten.**
--
-- `MEETING_TODAY` kommt am Morgen des Termintags und fragt gleich mit nach,
-- ob die eigene Antwort noch gilt: „Du hast abgesagt — stimmt das noch?" Das
-- war der eine Tag, an dem die App bisher schwieg, obwohl an ihm alles
-- entschieden wird.
--
-- `NOTES_REMINDER` kommt am Morgen danach, an einem Abend **ohne Thema**, der
-- noch keine Nachbereitung hat. Nur dort, weil nur dort jede:r schreiben darf:
-- Am Themen-Abend gehören Zusammenfassung und Actionstep der Einheit, und die
-- gehört ihrer Crew.
ALTER TYPE "notification_type" ADD VALUE 'MEETING_TODAY';
ALTER TYPE "notification_type" ADD VALUE 'NOTES_REMINDER';
