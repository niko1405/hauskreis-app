-- Zwei Nachrichten für besondere Termine.
--
-- Sie sind bewusst getrennt: „es gibt einen neuen Termin" ist eine Ankündigung
-- und kommt einmal, „der Termin steht an" ist eine Erinnerung mit eigener
-- Vorlaufzeit. Wer das eine will und das andere nicht, soll das einstellen
-- können — in einem Wert ließe sich das nicht ausdrücken.
ALTER TYPE "notification_type" ADD VALUE 'CUSTOM_MEETING_CREATED';
ALTER TYPE "notification_type" ADD VALUE 'CUSTOM_MEETING_REMINDER';
