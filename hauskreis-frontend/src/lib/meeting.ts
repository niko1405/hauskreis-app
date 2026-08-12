/**
 * Wie ein Termin heißt und woraus er besteht.
 *
 * Was dazugehört, sagt seit den Bausteinen der Termin selbst und nicht mehr
 * seine Art: `hasTopicSlot`, `hasSongSlot`, `hasTestimonySlot` stehen als
 * Felder in der Antwort. Die Art ist nur noch die Voreinstellung beim
 * Anlegen — ein besonderer Termin startet leer und bekommt einzeln dazugebucht,
 * was er braucht.
 *
 * Deshalb gibt es hier keine `hasTopicSlot(type)`-Funktion mehr: sie war eine
 * Ableitung aus etwas, das die Frage gar nicht beantwortet.
 *
 * Gastgeber ist kein Baustein: man trifft sich immer irgendwo. Dass an einem
 * Abend niemand gastgebend eingetragen ist, bleibt davon unberührt.
 */
import type { AssignmentRole, MeetingStatus, MeetingType } from './api/types';

export const MEETING_TYPE_LABEL: Record<MeetingType, string> = {
  STANDARD: 'Hauskreis-Abend',
  LOBPREIS_GEBET: 'Lobpreis & Gebet',
  CUSTOM: 'Besonderer Termin',
};

export type MeetingSlotKey =
  'hasTopicSlot' | 'hasSongSlot' | 'hasTestimonySlot' | 'hasNotesSlot';

/**
 * Wie jeder Baustein heißt — **alle vier**, auch der, den man nicht anhakt.
 *
 * Getrennt von `MEETING_SLOTS`, weil die Rückfrage beim Umschalten benennen
 * muss, was verlorengeht: wer „Thema" anhakt, verliert die Nachbereitung. Käme
 * die Beschriftung aus der Liste der sichtbaren Schalter, stünde dort „Thema
 * statt undefined?".
 */
export const SLOT_LABEL: Record<MeetingSlotKey, string> = {
  hasTopicSlot: 'Thema',
  hasNotesSlot: 'Nachbereitung',
  hasSongSlot: 'Lieder',
  hasTestimonySlot: 'Testimony',
};

export const MEETING_SLOT_KEYS = Object.keys(SLOT_LABEL) as MeetingSlotKey[];

/**
 * Die Bausteine, die man beim **Planen** eines Abends anhakt.
 *
 * Drei, nicht vier: die **Nachbereitung** steht bewusst nicht dabei. Sie gehört
 * nicht zur Planung, sondern zu dem, was danach übrig bleibt — hier stand sie
 * neben Thema und Liedern und fragte damit vor dem Abend nach der
 * Zusammenfassung von etwas, das noch nicht stattgefunden hatte. Sie kommt
 * jetzt über einen Hinweis am Abend selbst dazu, und der Server lehnt ein
 * früheres Anschalten ab.
 */
export const MEETING_SLOTS = [
  {
    key: 'hasTopicSlot',
    label: SLOT_LABEL.hasTopicSlot,
    hint: 'Mit Zusammenfassung und Actionstep danach.',
  },
  {
    key: 'hasSongSlot',
    label: SLOT_LABEL.hasSongSlot,
    hint: 'Vorschläge und wer sie macht.',
  },
  {
    key: 'hasTestimonySlot',
    label: SLOT_LABEL.hasTestimonySlot,
    hint: 'Statt eines Themas — jemand erzählt.',
  },
] as const satisfies readonly {
  key: MeetingSlotKey;
  label: string;
  hint: string;
}[];

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
      hasTopicSlot: true,
      hasSongSlot: true,
      hasTestimonySlot: false,
      hasNotesSlot: false,
    };
  }

  if (type === 'LOBPREIS_GEBET') {
    return {
      hasTopicSlot: false,
      hasSongSlot: true,
      hasTestimonySlot: true,
      hasNotesSlot: false,
    };
  }

  return {
    hasTopicSlot: false,
    hasSongSlot: false,
    hasTestimonySlot: false,
    hasNotesSlot: false,
  };
}

/**
 * Einen Schalter umlegen — und dabei die Ausschlüsse wahren.
 *
 * Zwei Paare vertragen sich nicht: **Thema und Testimony** (beides ist der
 * Beitrag, um den sich der Abend dreht) und **Thema und Nachbereitung** (beide
 * tragen Zusammenfassung und Actionstep). Testimony und Nachbereitung dagegen
 * schon — das ist der Lobpreisabend, an dem jemand erzählt und die Gruppe sich
 * danach etwas vornimmt.
 *
 * Der Server lehnt eine verbotene Kombination mit `400` ab. Das Formular soll
 * aber gar nicht erst dorthin führen: wer Testimony anhakt, meint damit
 * ersichtlich „statt eines Themas", und ihn dafür in eine Fehlermeldung laufen
 * zu lassen wäre eine Belehrung über eine Regel, die er gerade befolgt.
 *
 * **Feld für Feld statt `{ ...slots }`.** Die Detailseite reicht hier den ganzen
 * Termin herein — er *ist* ein `MeetingSlots`, aber er trägt noch alles andere
 * mit sich. Ein Spread nahm das mit in den PATCH, und dann stand im Körper auch
 * `summaryText`, während `hasNotesSlot` gerade auf `false` ging: der Server
 * antwortete „Dieser Termin hat keine Nachbereitung — schalte das erst dazu",
 * und das Anhaken von „Thema" tat nichts. Was hier herauskommt, sind genau die
 * vier Schalter.
 */
export function applySlotToggle(
  slots: MeetingSlots,
  key: MeetingSlotKey,
  value: boolean,
): MeetingSlots {
  const next: MeetingSlots = {
    hasTopicSlot: slots.hasTopicSlot,
    hasSongSlot: slots.hasSongSlot,
    hasTestimonySlot: slots.hasTestimonySlot,
    hasNotesSlot: slots.hasNotesSlot,
  };
  next[key] = value;

  if (value && key === 'hasTopicSlot') {
    next.hasTestimonySlot = false;
    next.hasNotesSlot = false;
  }
  if (value && key === 'hasTestimonySlot') next.hasTopicSlot = false;
  if (value && key === 'hasNotesSlot') next.hasTopicSlot = false;

  return next;
}

/**
 * Ist an diesem Abend jede Rolle vergeben, die es an ihm gibt?
 *
 * Die Frage der Planungstabelle, und ihr Kern ist der Unterschied zwischen
 * *fehlt* und *gibt es hier nicht*: ein Geburtstagsabend ohne Thema ist nicht
 * offen, er hat keins. Ein Gastgeber fehlt auch dann nicht, wenn der Ort schon
 * feststeht und keinen braucht — Schlosspark, Café, Gemeindehaus.
 *
 * Ein abgesagter Abend ist nie fertig geplant: an ihm gibt es nichts zu planen.
 * Grün zu leuchten wäre dort eine Auszeichnung für einen Abend, der ausfällt.
 */
export function planningComplete(meeting: {
  status: MeetingStatus;
  hostPersonId: string | null;
  location: { requiresHost: boolean } | null;
  hasTopicSlot: boolean;
  hasSongSlot: boolean;
  hasTestimonySlot: boolean;
  testimonyPersonId: string | null;
  topicResponsibles: readonly unknown[];
  songLeaders: readonly unknown[];
}): boolean {
  if (meeting.status === 'CANCELLED') return false;

  const hostGeklärt =
    meeting.hostPersonId !== null ||
    (meeting.location !== null && !meeting.location.requiresHost);

  return (
    hostGeklärt &&
    (!meeting.hasTopicSlot || meeting.topicResponsibles.length > 0) &&
    (!meeting.hasSongSlot || meeting.songLeaders.length > 0) &&
    (!meeting.hasTestimonySlot || meeting.testimonyPersonId !== null)
  );
}

/**
 * Die Überschrift einer Terminkarte: der eigene Titel, sonst das Thema, sonst
 * die Art des Termins. Ein Thema ohne Titel bleibt bewusst ohne Titel.
 */
export function meetingHeadline(meeting: {
  type: MeetingType;
  title: string | null;
  topicSession?: {
    title: string | null;
    topic: { title: string | null };
  } | null;
}): string {
  if (meeting.title) return meeting.title;

  // Der Titel des Abends schlägt den des Themas: „Teil 2: Was Petrus tat" sagt
  // mehr als „Vergebung", wenn beides dasteht. Beide sind `null`, solange die
  // Einheit für den Betrachter nicht freigegeben ist — dann steht hier die
  // Terminart, und das ist genau richtig: zu sehen gibt es noch nichts.
  const session = meeting.topicSession;
  if (session?.title) return session.title;
  if (session?.topic.title) return session.topic.title;

  return MEETING_TYPE_LABEL[meeting.type];
}

export const ROLE_LABEL: Record<AssignmentRole, string> = {
  HOST: 'Host',
  TOPIC: 'Thema',
  SONG: 'Musik',
  TESTIMONY: 'Testimony',
  PRAYER_BUDDY: 'Gebetsbuddy',
};

/** Überschrift des Zuteilungs-Sheets, im Ton der App. */
export const ROLE_QUESTION: Record<AssignmentRole, string> = {
  HOST: 'Wer hostet?',
  TOPIC: 'Wer macht das Thema?',
  SONG: 'Wer macht die Musik?',
  TESTIMONY: 'Wer erzählt?',
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
