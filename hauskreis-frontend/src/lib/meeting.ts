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
import type {
  AssignmentRole,
  AttendanceStatus,
  MeetingStatus,
  PersonRef,
} from './api/types';
import { hasStarted, isPast, type CalendarDay } from './date';

/**
 * In welchem Zustand ein Termin gerade ist.
 *
 * **Drei und nicht zwei.** Bis hierher gab es „kommend" und „vorbei", gelesen
 * aus `isPast(meeting.date)` — also aus dem **ersten** Tag. Zwei Dinge stimmten
 * damit nicht: Eine Freizeit von Freitag bis Sonntag stand ab Samstag als
 * „Vorbei" da, obwohl sie lief; und ein ganz normaler Dienstag sah um 20 Uhr
 * aus wie um 8 Uhr morgens.
 *
 * Die Grenzen sind dieselben, die der Server zieht: `spanIsPast` für „ganz
 * vorbei" (der letzte Tag, nicht der erste) und `eveningReached` für
 * „angefangen" (die Treffpunktzeit, nicht der Kalendertag).
 */
export type MeetingPhase = 'upcoming' | 'running' | 'past';

export interface MeetingWhen {
  date: CalendarDay;
  endDate: CalendarDay | null;
  startTime: string;
}

export function meetingPhase(meeting: MeetingWhen): MeetingPhase {
  // Vorbei heißt **ganz** vorbei. Bis dahin läuft ein mehrtägiger Termin, auch
  // an seinem letzten Tag.
  if (isPast(meeting.endDate ?? meeting.date)) return 'past';

  return hasStarted(meeting.date, meeting.startTime) ? 'running' : 'upcoming';
}

/**
 * Die häufigste der drei Fragen, als eigener Name.
 *
 * Fast überall interessiert nur „darf man daran noch etwas ändern" — und das
 * ist genau `phase === 'past'`. Ein `meetingPhase(m) === 'past'` an zwanzig
 * Stellen läse sich wie eine Rechnung statt wie eine Auskunft.
 */
export function isMeetingPast(meeting: MeetingWhen): boolean {
  return meetingPhase(meeting) === 'past';
}

/**
 * Wie ein Abend heißt, wenn niemand ihm einen Namen gegeben hat.
 *
 * Abgeleitet und nicht gespeichert. Hier stand einmal `MEETING_TYPE_LABEL`, ein
 * Wörterbuch über die Terminart — und die war für „Standard" gegen „Lobpreis"
 * nichts als eine zweite, ungenauere Fassung dessen, was die Bausteine ohnehin
 * sagen. Zwei Aussagen über denselben Abend, von denen sich nur eine ändert,
 * wenn jemand am Bausteinkasten dreht.
 *
 * Die Reihenfolge ist die des Gewichts: Ein Abend mit Thema ist ein
 * Hauskreis-Abend, auch wenn Lieder dazugehören. Ohne Thema tragen Testimony
 * und Lieder den Abend — das ist der Lobpreisabend. Bleibt nichts davon, heißt
 * er schlicht „Termin"; ein Geburtstag hat ohnehin fast immer einen eigenen
 * Titel.
 */
export function meetingKindLabel(slots: {
  hasTopicSlot: boolean;
  hasSongSlot: boolean;
  hasTestimonySlot: boolean;
}): string {
  if (slots.hasTopicSlot) return 'Hauskreis-Abend';
  if (slots.hasTestimonySlot || slots.hasSongSlot) return 'Lobpreis & Gebet';
  return 'Termin';
}

export type MeetingSlotKey =
  | 'hasTopicSlot'
  | 'hasSongSlot'
  | 'hasTestimonySlot'
  | 'hasNotesSlot'
  | 'hasPrayerSlot'
  | 'hasSnackSlot';

/**
 * Wie jeder Baustein heißt — **alle sechs**, auch der, den man nicht anhakt.
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
  hasPrayerSlot: 'Gebetsanliegen',
  hasSnackSlot: 'Snacks',
};

export const MEETING_SLOT_KEYS = Object.keys(SLOT_LABEL) as MeetingSlotKey[];

/**
 * Die Bausteine, die man beim **Planen** eines Abends anhakt.
 *
 * Fünf, nicht sechs: die **Nachbereitung** steht bewusst nicht dabei. Sie gehört
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
  {
    key: 'hasPrayerSlot',
    label: SLOT_LABEL.hasPrayerSlot,
    hint: 'Wofür ihr an dem Abend beten wollt.',
  },
  {
    key: 'hasSnackSlot',
    label: SLOT_LABEL.hasSnackSlot,
    hint: 'Wer etwas zu essen mitbringt.',
  },
] as const satisfies readonly {
  key: MeetingSlotKey;
  label: string;
  hint: string;
}[];

export type MeetingSlots = Record<MeetingSlotKey, boolean>;

/**
 * Womit ein von Hand angelegter Abend startet — dieselbe Belegung wie im
 * Backend (`EMPTY_SLOTS` in `meeting-slots.ts`), nur fürs Anlege-Formular.
 *
 * Zwei Wahrheiten wären hier ungefährlich, aber verwirrend: Der Server setzt
 * ohnehin seine eigene, wenn nichts mitkommt. Sichtbar zu machen, **was** er
 * setzen wird, ist der ganze Zweck.
 *
 * Leer bis auf die Gebetsanliegen: Ein selbst angelegter Termin muss nichts
 * erfüllen — aber beten kann man an einem Geburtstag genauso.
 */
export const EMPTY_SLOTS: MeetingSlots = {
  hasTopicSlot: false,
  hasSongSlot: false,
  hasTestimonySlot: false,
  hasNotesSlot: false,
  hasPrayerSlot: true,
  // Als einziger auch hier aus: Die Rolle ist eine Einladung. Wer sie an jedem
  // erzeugten Abend haben will, hakt sie in der Verwaltung an.
  hasSnackSlot: false,
};

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
 * sechs Schalter.
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
    // Schließt nichts aus und wird von nichts ausgeschlossen — er fährt einfach
    // unverändert mit. Für die Snacks gilt dasselbe: Kuchen gibt es am
    // Themenabend wie am Geburtstag.
    hasPrayerSlot: slots.hasPrayerSlot,
    hasSnackSlot: slots.hasSnackSlot,
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
 * Die Rollen, die an einem Abend hängen — Gebetsbuddys und Geschenke also nicht.
 *
 * Beide teilt der Server zu und beide hängen an keinem Termin; sie stehen unter
 * „Deine Rollen", aber nie an einem Abend.
 */
export type MeetingRole = Exclude<
  AssignmentRole,
  'PRAYER_BUDDY' | 'BIRTHDAY_GIFT'
>;

/** Warum eine Rolle an diesem Abend gar nicht vorkommt. */
export type RoleAbsence =
  /** Der Baustein ist aus — den Abend gibt es ohne diese Rolle. */
  | 'slot-off'
  /** Der Ort braucht keinen Gastgeber: Schlosspark, Café, Gemeindehaus. */
  | 'not-needed';

export interface MeetingRoleSlot {
  role: MeetingRole;
  people: PersonRef[];
  /** `null` heißt: Die Rolle gibt es hier, sie ist nur vielleicht unbesetzt. */
  absent: RoleAbsence | null;
}

/**
 * Welche Rollen dieser Abend hat, wer sie trägt — und wo es sie gar nicht gibt.
 *
 * **Eine Aufstellung, drei Leser**: die Zuständigkeiten-Sektion am Termin, ihr
 * Zähler („2 von 4 besetzt") und die Planungstabelle. Sie stand vorher dreimal
 * da — als Kette von `&&` in `planningComplete`, als Liste von Zellen in der
 * Tabelle und als Folge von `{slot && <RoleRow …>}` auf der Detailseite. Drei
 * Antworten auf dieselbe Frage laufen irgendwann auseinander, und dann stünde
 * über einer Liste mit vier Zeilen „3 von 5 besetzt".
 *
 * Der Kern ist der Unterschied zwischen *fehlt* und *gibt es hier nicht*: ein
 * Geburtstagsabend ohne Thema ist nicht offen, er hat keins.
 */
/**
 * Die Reihenfolge der Rollen an einem Abend — für die Zeilen am Termin wie für
 * die Spalten der Planung.
 *
 * Musik vor Testimony: die Musik wird an fast jedem Abend zugeteilt, ein
 * Testimony nur einmal im Monat. Was öfter gebraucht wird, steht näher am
 * Datum. **Sie steht hier und nicht in der Tabelle**, weil die Tabelle ihre
 * Überschriften einmal selbst aufzählte: Als die Snacks dazukamen, bekamen die
 * Zeilen eine fünfte Zelle und der Kopf keine fünfte Überschrift.
 */
export const MEETING_ROLE_ORDER: readonly MeetingRole[] = [
  'HOST',
  'TOPIC',
  'SONG',
  'TESTIMONY',
  'SNACK',
];

export function meetingRoles(meeting: {
  hostPersonId: string | null;
  host: PersonRef | null;
  location: { requiresHost: boolean } | null;
  hasTopicSlot: boolean;
  hasSongSlot: boolean;
  hasTestimonySlot: boolean;
  hasSnackSlot: boolean;
  testimonyPerson: PersonRef | null;
  topicResponsibles: readonly { person: PersonRef }[];
  songLeaders: readonly { person: PersonRef }[];
  snackResponsibles: readonly { person: PersonRef }[];
}): MeetingRoleSlot[] {
  const slots: Record<MeetingRole, MeetingRoleSlot> = {
    HOST: {
      role: 'HOST',
      people: meeting.host ? [meeting.host] : [],
      // Einen Gastgeber-Baustein gibt es nicht — man trifft sich immer
      // irgendwo. Fehlen kann er trotzdem nicht, wenn der Ort keinen braucht.
      absent:
        meeting.hostPersonId === null &&
        meeting.location !== null &&
        !meeting.location.requiresHost
          ? 'not-needed'
          : null,
    },
    TOPIC: {
      role: 'TOPIC',
      people: meeting.topicResponsibles.map((row) => row.person),
      absent: meeting.hasTopicSlot ? null : 'slot-off',
    },
    SONG: {
      role: 'SONG',
      people: meeting.songLeaders.map((row) => row.person),
      absent: meeting.hasSongSlot ? null : 'slot-off',
    },
    TESTIMONY: {
      role: 'TESTIMONY',
      people: meeting.testimonyPerson ? [meeting.testimonyPerson] : [],
      absent: meeting.hasTestimonySlot ? null : 'slot-off',
    },
    SNACK: {
      role: 'SNACK',
      people: meeting.snackResponsibles.map((row) => row.person),
      absent: meeting.hasSnackSlot ? null : 'slot-off',
    },
  };

  return MEETING_ROLE_ORDER.map((role) => slots[role]);
}

/** Die Rollen, die es an diesem Abend wirklich gibt. */
export function activeMeetingRoles(
  meeting: Parameters<typeof meetingRoles>[0],
): MeetingRoleSlot[] {
  return meetingRoles(meeting).filter((slot) => slot.absent === null);
}

/**
 * Ist an diesem Abend jede Rolle vergeben, die es an ihm gibt?
 *
 * Die Frage der Planungstabelle. Sie liest dieselbe Aufstellung wie die
 * Zuständigkeiten-Sektion: Was dort als Zeile steht, zählt hier mit.
 *
 * Ein abgesagter Abend ist nie fertig geplant: an ihm gibt es nichts zu planen.
 * Grün zu leuchten wäre dort eine Auszeichnung für einen Abend, der ausfällt.
 */
export function planningComplete(
  meeting: Parameters<typeof meetingRoles>[0] & { status: MeetingStatus },
): boolean {
  if (meeting.status === 'CANCELLED') return false;

  return activeMeetingRoles(meeting).every((slot) => slot.people.length > 0);
}

/**
 * Die Überschrift einer Terminkarte: der eigene Titel, sonst der Name, der sich
 * aus den Bausteinen ergibt.
 *
 * **Der Termin heißt nach sich selbst.** Hier standen dazwischen zwei Zeilen,
 * die auf den Titel der Einheit zurückfielen und dann auf den des Themas. Ein
 * Abend hieß damit „Teil 2: Was Petrus tat" — das ist aber der Name der
 * Einheit, nicht der des Abends. Wer seinem Termin einen eigenen Namen geben
 * will, trägt ihn ein (`HeadlineEdit` schreibt `meeting.title`, und zwar seit
 * jeher nur das); wer nicht, bekommt `meetingKindLabel`.
 *
 * Das Thema bleibt sichtbar, nur nicht als Überschrift: als Rollen-Chip auf der
 * Karte, als Themen-Kasten auf der Terminseite, im Archiv unter „Themen".
 *
 * Nebenbei sagen damit alle Bildschirme dasselbe. Der Startbildschirm reichte
 * `HomeNextMeeting` herein, und dieses DTO hatte gar kein `topicSession` — dort
 * stand also längst die Terminart, während Liste, Kalender und Detailseite den
 * Themen-Titel zeigten.
 */
export function meetingHeadline(meeting: {
  hasTopicSlot: boolean;
  hasSongSlot: boolean;
  hasTestimonySlot: boolean;
  title: string | null;
}): string {
  // Auf Wahrheit geprüft und nicht auf `null`: Ein leerer Titel ist keiner, und
  // `??` ließe eine Überschrift aus null Zeichen stehen.
  return meeting.title || meetingKindLabel(meeting);
}

export const ROLE_LABEL: Record<AssignmentRole, string> = {
  HOST: 'Host',
  TOPIC: 'Thema',
  SONG: 'Musik',
  TESTIMONY: 'Testimony',
  SNACK: 'Snacks',
  PRAYER_BUDDY: 'Gebetsbuddy',
  BIRTHDAY_GIFT: 'Geschenk',
};

/** Überschrift des Zuteilungs-Sheets, im Ton der App. */
export const ROLE_QUESTION: Record<AssignmentRole, string> = {
  HOST: 'Wer hostet?',
  TOPIC: 'Wer macht das Thema?',
  SONG: 'Wer macht die Musik?',
  TESTIMONY: 'Wer erzählt?',
  SNACK: 'Wer bringt was zu essen mit?',
  PRAYER_BUDDY: 'Wer betet miteinander?',
  // Steht nie in einem Zuteilungs-Sheet — Geschenke teilt der Server zu, nicht
  // ein Mensch an einem Abend. Der Eintrag ist hier, weil TypeScript die Karte
  // vollständig verlangt, und das ist gut so: Er erinnert daran, dass es die
  // Rolle gibt.
  BIRTHDAY_GIFT: 'Wer besorgt das Geschenk?',
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

/**
 * Wie viele dabei sind — und mit wie vielen geplant wird.
 *
 * **Die Personenliste ist die Grundmenge, die Anwesenheit nur ein
 * Nachschlagewerk.** Andersherum ginge es nicht: Eine Zeile in `attendances`
 * bekommt nur, wer eine hat, und eine mit `UNKNOWN` entsteht fast nur, wenn
 * jemand eine Zusage aktiv zurücknimmt. Wer nie geantwortet hat, steht gar
 * nicht im Array — über `attendances` gezählt wären die Unentschiedenen also
 * meistens null.
 *
 * **Eingeladene zählen nicht mit.** Wer sich noch nie angemeldet hat, kann
 * nicht antworten und stünde auf ewig unter „weiß noch nicht"; der Server
 * rechnet für „alle haben abgesagt" mit derselben Menge. Ausgetretene kommen
 * gar nicht erst an.
 *
 * Die beiden Zahlen beantworten zwei Fragen, und beide werden gebraucht:
 * `attending` ist „wer war da", `planned` ist „mit wie vielen rechne ich".
 * Letzteres ist dieselbe Menge wie `countExpectedAttendance` im Server
 * (Gruppengröße minus Absagen), nur von der anderen Seite gezählt.
 */
export function attendanceCounts(
  people: readonly { id: string; acceptedAt: string | null }[],
  attendances: readonly { personId: string; status: AttendanceStatus }[],
): { attending: number; planned: number } {
  const active = people.filter((person) => person.acceptedAt !== null);
  const statusOf = (personId: string): AttendanceStatus =>
    attendances.find((entry) => entry.personId === personId)?.status ??
    'UNKNOWN';

  const attending = active.filter((p) => statusOf(p.id) === 'ATTENDING').length;
  const absent = active.filter((p) => statusOf(p.id) === 'ABSENT').length;

  return { attending, planned: active.length - absent };
}
