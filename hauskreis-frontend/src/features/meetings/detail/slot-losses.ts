/**
 * Was beim Umstellen der Bausteine verlorengeht — und die Rückfrage dazu.
 *
 * Steht für sich, weil zwei Stellen sie brauchen: der Bearbeiten-Dialog, in dem
 * die Bausteine jetzt umgestellt werden, und das Entfernen der Nachbereitung
 * am Abend selbst. Zwei Abschriften derselben Sätze liefen irgendwann
 * auseinander, und dann kostete dieselbe Änderung je nach Weg etwas anderes.
 */
import { namesOf } from '@/lib/person';
import { MEETING_SLOT_KEYS, SLOT_LABEL } from '@/lib/meeting';
import type { MeetingSlotKey, MeetingSlots } from '@/lib/meeting';
import type { Meeting } from '@/lib/api/types';

/**
 * Was beim Wegnehmen eines Bausteins verlorengeht — als Satz, oder `null`,
 * wenn nichts dranhängt.
 *
 * Die Rückfrage soll benennen, was sie kostet. „Bist du sicher?" ohne Inhalt
 * ist eine Frage, die man wegklickt, ohne sie gelesen zu haben.
 */
export const SLOT_LOSSES: Record<
  MeetingSlotKey,
  (meeting: Meeting) => string | null
> = {
  hasTopicSlot: (meeting) =>
    meeting.topicSession
      ? 'Der Abend verliert sein Thema. Vorbereitetes geht nicht verloren — es wird nur wieder ein Entwurf, den du jederzeit aufnehmen kannst.'
      : null,
  // Als einziger immer: die Liedvorschläge liegen in einer eigenen Abfrage,
  // dieser Bildschirm sieht von hier aus nicht, ob welche da sind. Und etwas
  // zu löschen, das jemand getippt hat, ohne zu fragen, ist der schlechtere
  // Fehler als eine Rückfrage zu viel.
  hasSongSlot: () =>
    'Alle Liedvorschläge dieses Abends und die Musik-Zuteilung werden gelöscht.',
  hasTestimonySlot: (meeting) =>
    meeting.testimonyPerson
      ? `${meeting.testimonyPerson.name} erzählt an dem Abend dann nichts mehr.`
      : null,
  // Namentlich, wie beim Testimony: Wer eingetragen ist, steht in der Antwort
  // des Termins, und „die Snack-Zuteilung wird gelöscht" sagt weniger als der
  // Name, um den es geht.
  hasSnackSlot: (meeting) =>
    meeting.snackResponsibles.length > 0
      ? `${namesOf(meeting.snackResponsibles.map((row) => row.person))} ${
          meeting.snackResponsibles.length === 1 ? 'bringt' : 'bringen'
        } an dem Abend dann nichts mehr mit.`
      : null,
  // Wie bei den Liedern immer: Die Anliegen liegen in einer eigenen Abfrage,
  // dieser Bildschirm sieht von hier aus nicht, ob welche da sind. Und was
  // hier verlorengeht, sind Sätze, die Menschen über sich selbst geschrieben
  // haben — dafür ist eine Rückfrage zu viel besser als eine zu wenig.
  hasPrayerSlot: () => 'Alle Gebetsanliegen dieses Abends werden gelöscht.',
  // Hier wird wirklich gelöscht, anders als beim Thema: die beiden Texte
  // gehören diesem einen Abend und warten nirgends als Entwurf.
  hasNotesSlot: (meeting) =>
    meeting.summaryText || meeting.actionstepText
      ? 'Zusammenfassung und Actionstep dieses Abends werden gelöscht, die Haken dazu auch.'
      : null,
};

/** „Lieder und Snacks" — die Bausteine, wie sie im Bausteinkasten heißen. */
function names(keys: MeetingSlotKey[]): string {
  return keys.map((slot) => SLOT_LABEL[slot]).join(' und ');
}

/**
 * Die Rückfrage für einen Wechsel von `meeting` auf `next` — oder `null`, wenn
 * dabei nichts verlorengeht.
 *
 * Gezählt wird über **alle sechs** Schlüssel, nicht über die sichtbaren
 * Schalter: Die Nachbereitung ist keiner, fällt beim Anhaken des Themas aber
 * mit — und genau das muss die Rückfrage sagen. Kommt dabei zugleich etwas
 * dazu, heißt sie „… statt …": Wer Testimony anhakt und damit das Thema
 * verliert, meint ersichtlich das eine statt des anderen.
 */
export function slotChangeQuestion(
  meeting: Meeting,
  next: MeetingSlots,
): { title: string; body: string; confirmLabel: string } | null {
  const weg = MEETING_SLOT_KEYS.filter((slot) => meeting[slot] && !next[slot]);
  const dazu = MEETING_SLOT_KEYS.filter((slot) => !meeting[slot] && next[slot]);

  const losses = weg
    .map((slot) => SLOT_LOSSES[slot](meeting))
    .filter((loss): loss is string => loss !== null);

  if (losses.length === 0) return null;

  return dazu.length > 0
    ? {
        title: `${names(dazu)} statt ${names(weg)}?`,
        body: losses.join(' '),
        confirmLabel: 'Umstellen',
      }
    : {
        title: `${names(weg)} wegnehmen?`,
        body: losses.join(' '),
        confirmLabel: 'Wegnehmen',
      };
}
