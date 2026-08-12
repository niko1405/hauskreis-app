import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { AttendanceStatus, MeetingType } from '../../../generated/prisma/enums';
import { isoDateOut, personRefSchema } from '../../common/dto/response';
import { wallClockOut } from '../../common/dto/wall-clock';

/**
 * Eine Zuteilung — für alle vier Rollenarten dieselbe Form.
 *
 * Absichtlich einheitlich, obwohl eine Gebetsbuddy-Periode zwei Wochen umspannt
 * und eine Termin-Rolle auf einen Tag fällt: sonst müsste jeder Konsument auf
 * vier Formen verzweigen. `endDate` und `groupId` sind nur bei
 * `PRAYER_BUDDY` gesetzt, `meetingId` nur bei den übrigen dreien.
 */
export const assignmentSchema = z.object({
  role: z.enum(['HOST', 'TOPIC', 'SONG', 'TESTIMONY', 'PRAYER_BUDDY']),
  date: isoDateOut,
  /// Nur bei `PRAYER_BUDDY`: das Ende des Zeitraums, einschließlich.
  endDate: isoDateOut.nullable(),
  person: personRefSchema,
  meetingId: z.uuid().nullable(),
  groupId: z.uuid().nullable(),
  /// Für die Anzeige vorbereitet: „Bei Chris", „mit Antonia und Reini".
  label: z.string().nullable(),
});

/**
 * Der ganze Home-Screen in einer Antwort.
 *
 * Serverseitig zusammengesetzt statt aus vier Aufrufen: auf dem Handy sind die
 * Round Trips der Preis, und jedes Stück hier ist ein Einzeiler, den das
 * Backend ohnehin schon beantworten kann (CLAUDE.md §9).
 */
export const homeScreenSchema = z.object({
  /// `null`, wenn nichts geplant ist — ein gültiger Zustand, kein Fehler.
  nextMeeting: z
    .object({
      id: z.uuid(),
      /// Hier nur der Tag: der Dienst schneidet ihn selbst zu, anders als bei
      /// `…/meetings`.
      date: isoDateOut,
      /// Wann es losgeht, `"19:30"` — dieselbe Schreibweise wie am Termin.
      startTime: wallClockOut,
      /// Gesetzt, wenn sich der Termin über mehrere Tage zieht.
      endDate: isoDateOut.nullable(),
      type: z.enum(MeetingType),
      /// Nur die zwei, die der Startbildschirm braucht: er zeigt Rollen-Chips
      /// für Thema und Musik, und ohne sie stünde an einem Geburtstagsabend
      /// „Thema: noch niemand".
      hasTopicSlot: z.boolean(),
      hasSongSlot: z.boolean(),
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
      /// Was *du* für diesen Abend geantwortet hast. Ohne Antwort `UNKNOWN`.
      myAttendance: z.enum(AttendanceStatus),
    })
    .nullable(),
  /// Die eigenen Aufgaben der nächsten acht Wochen, früheste zuerst.
  myRoles: z.array(assignmentSchema),
  /// Vom jüngsten vergangenen Abend, der einen hat.
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
      withNames: z.array(z.string()),
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
