/**
 * Wie ein Termin heißt und woraus er besteht.
 *
 * Was dazugehört, sagt seit den Bausteinen der Termin selbst und nicht mehr
 * seine Art: `hasHostSlot`, `hasTopicSlot`, `hasSongSlot`, `hasTestimonySlot`
 * stehen als Felder in der Antwort. Die Art ist nur noch die Voreinstellung
 * beim Anlegen — ein besonderer Termin startet leer und bekommt einzeln
 * dazugebucht, was er braucht.
 *
 * Deshalb gibt es hier keine `hasTopicSlot(type)`-Funktion mehr: sie war eine
 * Ableitung aus etwas, das die Frage gar nicht beantwortet.
 */
import type { AssignmentRole, MeetingType } from './api/types';

export const MEETING_TYPE_LABEL: Record<MeetingType, string> = {
  STANDARD: 'Hauskreis-Abend',
  LOBPREIS_GEBET: 'Lobpreis & Gebet',
  CUSTOM: 'Besonderer Termin',
};

/** Die vier Bausteine, in der Reihenfolge, in der sie auf der Seite stehen. */
export const MEETING_SLOTS = [
  {
    key: 'hasHostSlot',
    label: 'Gastgeber & Ort',
    hint: 'Wer einlädt — und damit auch, wo es stattfindet.',
  },
  {
    key: 'hasTopicSlot',
    label: 'Thema',
    hint: 'Mit Zusammenfassung und Actionstep danach.',
  },
  {
    key: 'hasSongSlot',
    label: 'Lieder',
    hint: 'Vorschläge und wer sie macht.',
  },
  {
    key: 'hasTestimonySlot',
    label: 'Testimony',
    hint: 'Statt eines Themas — jemand erzählt.',
  },
] as const satisfies readonly {
  key: MeetingSlotKey;
  label: string;
  hint: string;
}[];

export type MeetingSlotKey =
  'hasHostSlot' | 'hasTopicSlot' | 'hasSongSlot' | 'hasTestimonySlot';

export type MeetingSlots = Record<MeetingSlotKey, boolean>;

/**
 * Was eine Terminart mitbringt — dieselbe Tabelle wie im Backend
 * (`meeting-slots.ts`), nur fürs Formular beim Anlegen.
 *
 * Zwei Wahrheiten wären hier ungefährlich, aber verwirrend: der Server setzt
 * ohnehin seine eigenen, wenn nichts mitkommt. Sichtbar zu machen, **was** er
 * setzen wird, ist der ganze Zweck.
 */
export function slotDefaults(type: MeetingType): MeetingSlots {
  if (type === 'STANDARD') {
    return {
      hasHostSlot: true,
      hasTopicSlot: true,
      hasSongSlot: true,
      hasTestimonySlot: false,
    };
  }

  if (type === 'LOBPREIS_GEBET') {
    return {
      hasHostSlot: true,
      hasTopicSlot: false,
      hasSongSlot: true,
      hasTestimonySlot: true,
    };
  }

  return {
    hasHostSlot: false,
    hasTopicSlot: false,
    hasSongSlot: false,
    hasTestimonySlot: false,
  };
}

/**
 * Die Überschrift einer Terminkarte: der eigene Titel, sonst das Thema, sonst
 * die Art des Termins. Ein Thema ohne Titel bleibt bewusst ohne Titel.
 */
export function meetingHeadline(meeting: {
  type: MeetingType;
  title: string | null;
  topic?: { title: string | null } | null;
}): string {
  if (meeting.title) return meeting.title;
  // Hier **nicht** `topicTitle`: ein „Thema von Niko" als Kartenüberschrift
  // sagt weniger als „Hauskreis-Abend". Der Vorschlag gehört in die
  // Thema-Sektion, wo er ein Feld füllt, das man ändern kann.
  if (meeting.topic?.title) return meeting.topic.title;
  return MEETING_TYPE_LABEL[meeting.type];
}

/**
 * Wie ein Thema heißt — mit einem brauchbaren Vorschlag, wenn niemand einen
 * Titel getippt hat.
 *
 * **Abgeleitet und nicht gespeichert.** Ein „Thema von Niko", das beim ersten
 * Anlegen in die Datenbank geschrieben würde, stünde beim nächsten Rollentausch
 * falsch da — und niemand ginge hin und korrigierte einen Titel, den er nie
 * getippt hat. So bleibt `title` genau das: was jemand eingetragen hat, sonst
 * `null`.
 *
 * Ohne Zuständige schlicht „Thema". Ein Vorschlag mit leerer Lücke wäre keiner.
 */
export function topicTitle(topic: {
  title: string | null;
  responsibles?: { person: { name: string } }[];
}): string {
  if (topic.title) return topic.title;

  const names = (topic.responsibles ?? []).map((r) => r.person.name);
  if (names.length === 0) return 'Thema';

  return `Thema von ${listNames(names)}`;
}

/** „Niko", „Niko und Mira", „Niko, Mira und Chris". */
function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} und ${names.at(-1)}`;
}

export const ROLE_LABEL: Record<AssignmentRole, string> = {
  HOST: 'Host',
  TOPIC: 'Thema',
  SONG: 'Musik',
  PRAYER_BUDDY: 'Gebetsbuddy',
};

/** Überschrift des Zuteilungs-Sheets, im Ton der App. */
export const ROLE_QUESTION: Record<AssignmentRole, string> = {
  HOST: 'Wer hostet?',
  TOPIC: 'Wer macht das Thema?',
  SONG: 'Wer macht die Musik?',
  PRAYER_BUDDY: 'Wer betet miteinander?',
};

/**
 * „5 von 9 haben's geschafft".
 *
 * Bei null Abgehakten steht keine Statistik da, sondern eine Einladung: „0 von
 * 9" liest sich wie ein Vorwurf an alle, dabei hat die Woche vielleicht gerade
 * erst angefangen. Und wenn alle es geschafft haben, ist die Zahl uninteressant
 * — dann ist es eine gute Nachricht.
 */
export function actionstepProgress(done: number, total: number): string {
  if (total === 0 || done === 0) return 'Noch niemand hat abgehakt';
  if (done >= total) return 'Alle haben es geschafft';
  if (done === 1) return `1 von ${total} hat's geschafft`;
  return `${done} von ${total} haben's geschafft`;
}

/** Für Karten mit Ort: „In Maps öffnen" statt einer Adresse zum Abtippen. */
export function mapsUrl(location: {
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}): string {
  if (location.latitude !== null && location.longitude !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
  }
  const query = encodeURIComponent(location.address ?? location.name);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}
