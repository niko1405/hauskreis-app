import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { AttendanceStatus } from '../../../generated/prisma/enums';
import { isoDateOut, personRefSchema } from '../../common/dto/response';
import { wallClockOut } from '../../common/dto/wall-clock';

/**
 * Eine Zuteilung — für alle vier Rollenarten dieselbe Form.
 *
 * Absichtlich einheitlich, obwohl eine Gebetsbuddy-Periode zwei Wochen umspannt
 * und eine Termin-Rolle auf einen Tag fällt: sonst müsste jeder Konsument auf
 * fünf Formen verzweigen. `endDate` und `groupId` sind nur bei
 * `PRAYER_BUDDY` gesetzt, `occasionId` nur bei `BIRTHDAY_GIFT`, `meetingId`
 * nur bei den vier Termin-Rollen.
 */
export const assignmentSchema = z.object({
  role: z.enum([
    'HOST',
    'TOPIC',
    'SONG',
    'TESTIMONY',
    'SNACK',
    'PRAYER_BUDDY',
    'BIRTHDAY_GIFT',
  ]),
  date: isoDateOut,
  /// Nur bei `PRAYER_BUDDY`: das Ende des Zeitraums, einschließlich.
  endDate: isoDateOut.nullable(),
  person: personRefSchema,
  meetingId: z.uuid().nullable(),
  groupId: z.uuid().nullable(),
  /// Nur bei `BIRTHDAY_GIFT`: der Geburtstag, für den man das Geschenk besorgt.
  occasionId: z.uuid().nullable(),
  /// Für die Anzeige vorbereitet: „Bei Chris", „mit Antonia und Reini".
  label: z.string().nullable(),
});

/**
 * Ein Termin, wie ihn der Startbildschirm zeigt.
 *
 * Einmal beschrieben und zweimal benutzt — für den laufenden und den nächsten.
 * Als der Abschnitt „Aktueller Termin" dazukam, war die Alternative, dieses
 * Objekt abzuschreiben: zwei Fassungen desselben Termins, die beim nächsten
 * neuen Feld auseinanderlaufen.
 */
const homeMeetingSchema = z.object({
  id: z.uuid(),
  /// Hier nur der Tag: der Dienst schneidet ihn selbst zu, anders als bei
  /// `…/meetings`.
  date: isoDateOut,
  /// Wann es losgeht, `"19:30"` — dieselbe Schreibweise wie am Termin.
  startTime: wallClockOut,
  /// Gesetzt, wenn sich der Termin über mehrere Tage zieht.
  endDate: isoDateOut.nullable(),
  /// Die Bausteine, die auf der Karte einen Rollen-Chip tragen. Ohne sie
  /// stünde an einem Geburtstagsabend „Thema: noch niemand" — und sie sagen
  /// zugleich, wie der Abend heißt, wenn er keinen eigenen Titel hat
  /// (`meetingKindLabel` im Frontend).
  hasTopicSlot: z.boolean(),
  hasSongSlot: z.boolean(),
  hasTestimonySlot: z.boolean(),
  hasSnackSlot: z.boolean(),
  title: z.string().nullable(),
  /// Mit Position, damit „In Maps öffnen" ohne zweiten Aufruf geht.
  /// `latitude`/`longitude` sind entweder beide gesetzt oder beide `null`.
  location: z
    .object({
      id: z.uuid(),
      name: z.string(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
      address: z.string().nullable(),
      /// Damit „kein Host nötig" nicht wie ein vergessener Host aussieht.
      requiresHost: z.boolean(),
    })
    .nullable(),
  host: personRefSchema.nullable(),
  /// Wer an diesem Abend das Thema vorbereitet — die Zuteilung. Steht für
  /// sich, weil sie schon dasteht, bevor jemand ein Thema gewählt hat: „Lena
  /// ist dran" ist die Nachricht, auch wenn noch offen ist, womit.
  ///
  /// Flach, nicht `{ person }` wie im Termin-DTO: dort spiegelt die Hülle
  /// die Verknüpfungstabelle, hier ist es eine eigens gebaute Ansicht.
  topicResponsibles: z.array(personRefSchema),
  /// Was gewählt wurde. `null` heißt entweder „noch nichts" oder „geht dich
  /// vor dem Abend nichts an" — beides sieht von außen gleich aus, und das
  /// ist gewollt.
  topic: z
    .object({
      id: z.uuid(),
      title: z.string().nullable(),
    })
    .nullable(),
  /// Wer die Musik macht. Flach, nicht `{ person }` wie im Termin-DTO —
  /// dort spiegelt die Hülle die Verknüpfungstabelle, hier ist es eine
  /// eigens gebaute Ansicht und die Hülle wäre nur Ballast.
  songLeaders: z.array(personRefSchema),
  /// Wer etwas zu essen mitbringt. Flach wie `songLeaders`, aus demselben
  /// Grund.
  snackResponsibles: z.array(personRefSchema),
  /// Wer sein Testimony erzählt. `null` heißt „noch niemand" — der Chip
  /// lädt dann zum Eintragen ein, wie bei den anderen Rollen auch.
  testimonyPerson: personRefSchema.nullable(),
  /// Was *du* für diesen Abend geantwortet hast. Ohne Antwort `UNKNOWN`.
  myAttendance: z.enum(AttendanceStatus),
});

/**
 * Der ganze Home-Screen in einer Antwort.
 *
 * Serverseitig zusammengesetzt statt aus vier Aufrufen: auf dem Handy sind die
 * Round Trips der Preis, und jedes Stück hier ist ein Einzeiler, den das
 * Backend ohnehin schon beantworten kann (CLAUDE.md §9).
 */
export const homeScreenSchema = z.object({
  /// Der Abend, an dem man **gerade steht** — ab seiner Treffpunktzeit und bis
  /// sein letzter Tag um ist. `null` ist der Normalfall.
  ///
  /// Getrennt vom nächsten, weil es zwei Fragen sind: „wo bin ich jetzt" und
  /// „was kommt". Vorher gab es nur eine Karte, und die zeigte den laufenden
  /// Abend unter der Überschrift „Nächstes Treffen" — keine Auskunft mehr,
  /// wenn man schon dort sitzt.
  currentMeeting: homeMeetingSchema.nullable(),
  /// Der Abend, der zuletzt **ganz** vorbei ist — und zwar nur, wenn gerade
  /// keiner läuft.
  ///
  /// Er teilt sich den oberen Platz mit `currentMeeting`, und wer ihn bekommt,
  /// entscheidet der Server: Ob gerade ein Abend läuft, hängt an der
  /// Treffpunktzeit in der Zone der Gruppe (`eveningReached`), und diese Frage
  /// zweimal zu beantworten — hier und im Frontend — wäre eine Antwort zu viel.
  ///
  /// Der Anlass ist der Mittwochmorgen: Der Abend von gestern, dessen
  /// Nachbereitung noch fehlt, stand nirgends, während oben schon der Dienstag
  /// in einer Woche angekündigt war.
  lastMeeting: homeMeetingSchema.nullable(),
  /// `null`, wenn nichts geplant ist — ein gültiger Zustand, kein Fehler.
  nextMeeting: homeMeetingSchema.nullable(),
  /// Die eigenen Aufgaben der nächsten acht Wochen, früheste zuerst.
  myRoles: z.array(assignmentSchema),
  /// Vom jüngsten vergangenen Abend. Ein leerer Abend beendet den Vorsatz von
  /// davor; nur ein besonderer Termin ohne Actionstep wird übersprungen
  /// (`latestActionstep`).
  openActionstep: z
    .object({
      text: z.string(),
      meetingId: z.uuid(),
      date: isoDateOut,
      /// Ob *du* ihn abgehakt hast. Der Actionstep gilt pro Person — dass
      /// jemand anders ihn geschafft hat, nimmt ihn dir nicht ab.
      done: z.boolean(),
      /// „5 von 9 haben's geschafft". Nur die Zahlen: die Namen stehen auf
      /// der Detailseite des Abends.
      doneCount: z.number().int().nonnegative(),
      peopleCount: z.number().int().nonnegative(),
    })
    .nullable(),
  /// Mit wem du gerade betest. `null`, wenn für heute niemand zugeteilt ist.
  prayerBuddies: z
    .object({
      until: isoDateOut,
      /// Die ganze Gruppe, **du eingeschlossen**, und die Reihenfolge **ist der
      /// Kreis**: Wer hier steht, betet für den Nächsten, der Letzte für den
      /// Ersten. Dieselbe Zusage wie in `prayerBuddyAssignmentSchema` — hier
      /// standen vorher nur die Namen der anderen, und damit ließ sich die
      /// Richtung auf „Heute" nicht anzeigen.
      members: z.array(personRefSchema),
    })
    .nullable(),
});

/**
 * Absichtlich ohne Paginierungs-Huelle: die Zeitspanne ist bereits auf ein Jahr
 * begrenzt, und ein Home-Screen, der durch die eigenen Badges blaettert, waere
 * absurd. `items` bleibt trotzdem, damit spaeter Felder danebenpassen.
 */
export const assignmentListSchema = z.object({
  items: z.array(assignmentSchema),
});

export class AssignmentListResponseDto extends createZodDto(
  assignmentListSchema,
) {}
export class HomeScreenResponseDto extends createZodDto(homeScreenSchema) {}
