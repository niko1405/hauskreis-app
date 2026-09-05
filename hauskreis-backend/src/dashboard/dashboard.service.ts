import { Injectable } from '@nestjs/common';
import { personRefSelect } from '../common/dto/response';
import { PrismaService } from '../prisma/prisma.service';
import {
  PrayerBuddyService,
  type BuddyRef,
} from '../prayer-buddy/prayer-buddy.service';
import { AssignmentService, type Assignment } from './assignment.service';
import { MeetingStatus, NotificationType } from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';
import {
  addDays,
  finishedBefore,
  notFinishedBefore,
} from '../meeting/meeting-schedule';
import { eveningReached } from '../common/time/local-evening';
import { ANGEKOMMEN } from '../person/angekommen';
import { NotificationPreferenceService } from '../notification/notification-preference.service';
import { GroupClockService } from '../meeting/group-clock.service';
import { latestActionstep } from '../meeting/actionstep-source';
import { GroupFeaturesService } from '../hauskreis/group-features.service';
import {
  sessionSelectWithTopic,
  shapeSessionForMeeting,
  type Viewer,
} from '../topic/topic-shape';

/** How far ahead the home screen looks for your own jobs. */
export const HOME_HORIZON_DAYS = 8 * 7;

/**
 * Ein Termin, wie ihn der Startbildschirm braucht.
 *
 * Einmal beschrieben und zweimal benutzt: für den laufenden und den nächsten.
 * Zwei Abschriften desselben Objekts wären zwei Gelegenheiten, sie auseinander
 * laufen zu lassen.
 */
export interface HomeMeeting {
  id: string;
  date: string;
  /**
   * Minuten seit Mitternacht — das Antwort-Schema macht `"19:30"` daraus,
   * genau wie bei `meeting.startTime`.
   *
   * „Wann treffen wir uns" ist die zweite Frage nach „wann", und sie stand auf
   * dem Startbildschirm bisher gar nicht: man musste den Termin öffnen, um
   * eine Uhrzeit zu sehen, die sich inzwischen einstellen lässt.
   */
  startTime: number;
  endDate: string | null;
  /** Ob der Abend überhaupt ein Thema, Lieder bzw. ein Testimony vorsieht. */
  hasTopicSlot: boolean;
  hasSongSlot: boolean;
  hasTestimonySlot: boolean;
  title: string | null;
  /**
   * Mit Position, damit der Home-Screen ein „In Maps öffnen" anbieten kann,
   * ohne den Ort einzeln nachzuladen. `latitude`/`longitude` sind entweder
   * beide gesetzt oder beide null — das erzwingt schon das Location-DTO.
   */
  location: {
    id: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
    address: string | null;
    /** Damit „kein Host nötig" nicht wie ein fehlender Host aussieht. */
    requiresHost: boolean;
  } | null;
  host: { id: string; name: string } | null;
  /** Wer für das Thema zugeteilt ist — steht auch ohne gewähltes Thema da. */
  topicResponsibles: { id: string; name: string }[];
  /** Was gewählt wurde, sofern es der Betrachter schon sehen darf. */
  topic: { id: string; title: string | null } | null;
  /** Who is on for the music. Empty is valid — not every evening has songs. */
  songLeaders: { id: string; name: string }[];
  /** Wer sein Testimony erzählt — an einem Lobpreisabend die tragende Rolle. */
  testimonyPerson: { id: string; name: string } | null;
  /** What *you* answered for that evening. */
  myAttendance: string;
}

export interface HomeScreen {
  /**
   * Der Abend, an dem man **gerade steht** — ab der Treffpunktzeit und bis sein
   * letzter Tag vorbei ist.
   *
   * Getrennt vom nächsten, weil es zwei verschiedene Fragen sind: „wo bin ich
   * jetzt" und „was kommt". Vorher gab es nur eine Karte, und die zeigte den
   * laufenden Abend — „Nächstes Treffen: heute" ist aber keine Auskunft mehr,
   * wenn man schon dort sitzt.
   */
  currentMeeting: HomeMeeting | null;
  /**
   * Der Abend, der zuletzt **ganz** vorbei ist — und nur, wenn gerade keiner
   * läuft.
   *
   * Er teilt sich den oberen Platz mit `currentMeeting`. Wer ihn bekommt,
   * entscheidet hier: Ob ein Abend läuft, hängt an seiner Treffpunktzeit in der
   * Zone der Gruppe, und diese Frage zweimal zu beantworten — hier und im
   * Frontend — wäre eine Antwort zu viel.
   *
   * Der Anlass ist der Mittwochmorgen: Der Abend von gestern, dessen
   * Nachbereitung noch fehlt, stand nirgends, während oben schon der Dienstag
   * in einer Woche angekündigt war.
   */
  lastMeeting: HomeMeeting | null;
  /** Null when nothing is planned — a valid state, not an error. */
  nextMeeting: HomeMeeting | null;
  /**
   * Your own jobs over the next weeks, soonest first.
   *
   * Without the prayer buddies: they have their own field below and their own
   * screen, and being paired up with somebody is not a job you have to do. In
   * `…/assignments` they are still there — that route answers "who is down for
   * what", this one answers "what is on your plate".
   */
  myRoles: Assignment[];
  /** From the most recent past evening that has one. */
  openActionstep: {
    text: string;
    meetingId: string;
    date: string;
    /** Whether *you* have ticked it off. */
    done: boolean;
    /** How many have, and how many could — „5 von 9 haben's geschafft". */
    doneCount: number;
    peopleCount: number;
  } | null;
  /**
   * Deine Gebetsgruppe, so wie sie auch der Gebet-Bildschirm bekommt.
   *
   * Die ganze Besetzung **einschließlich dir selbst**, in Kreis-Reihenfolge:
   * Erst daraus lässt sich ablesen, für wen du betest und wer für dich. Vorher
   * standen hier nur die Namen der anderen, und die Karte auf „Heute" konnte
   * die Richtung deshalb gar nicht zeigen.
   */
  prayerBuddies: {
    until: string;
    members: BuddyRef[];
  } | null;
}

/**
 * The whole home screen in one request.
 *
 * Assembled server-side rather than left to four calls from the app: on a phone
 * the round trips are the cost, and every piece here is a one-liner the backend
 * already knows how to answer. CLAUDE.md §9 asks for exactly this shape.
 *
 * Nothing here is new logic — the actionstep uses the same "most recent past
 * evening that has one" rule as `ActionstepReminderService`, and the roles come
 * from `AssignmentService`. Two places deciding the same thing differently is
 * the failure worth avoiding.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: AssignmentService,
    private readonly buddies: PrayerBuddyService,
    private readonly clock: GroupClockService,
    private readonly preferences: NotificationPreferenceService,
    private readonly features: GroupFeaturesService,
  ) {}

  async build(
    hauskreisId: string,
    viewer: Viewer,
    options: { now?: Date } = {},
  ): Promise<HomeScreen> {
    const { personId, isAdmin } = viewer;
    const now = options.now ?? new Date();
    const today = await this.clock.today(hauskreisId, now);

    // Einmal beschrieben und zweimal abgefragt — der kommende Abend und der
    // vergangene sind auf dem Startbildschirm dieselbe Karte, und zwei
    // Abschriften desselben `select` wären zwei Gelegenheiten, sie auseinander
    // laufen zu lassen.
    const meetingSelect = {
      id: true,
      date: true,
      startMinutes: true,
      endDate: true,
      hasTopicSlot: true,
      hasSongSlot: true,
      hasTestimonySlot: true,
      title: true,
      location: {
        select: {
          id: true,
          name: true,
          latitude: true,
          longitude: true,
          address: true,
          requiresHost: true,
        },
      },
      host: { select: personRefSelect },
      testimonyPerson: { select: personRefSelect },
      topicResponsibles: {
        select: { person: { select: personRefSelect } },
        orderBy: { person: { name: 'asc' } },
      },
      topicSession: { select: sessionSelectWithTopic },
      songLeaders: {
        select: { person: { select: personRefSelect } },
      },
      attendances: {
        where: { personId },
        select: { status: true },
      },
    } satisfies Prisma.MeetingSelect;

    const [
      features,
      meetings,
      lastFinished,
      actionstep,
      myRoles,
      buddies,
      peopleCount,
    ] = await Promise.all([
      this.features.of(hauskreisId),
      // **Zwei** Zeilen und nicht eine: Läuft gerade ein Abend, ist er die
      // erste — der nächste steht dann dahinter. `notFinishedBefore` statt
      // `date >= today`, damit eine Freizeit ab ihrem zweiten Tag nicht aus
      // der eigenen Übersicht fällt.
      this.prisma.meeting.findMany({
        where: {
          hauskreisId,
          ...notFinishedBefore(today),
          status: MeetingStatus.PLANNED,
        },
        orderBy: { date: 'asc' },
        take: 2,
        select: meetingSelect,
      }),
      // Der jüngste Abend, der **ganz** vorbei ist. `finishedBefore` und
      // nicht `date < today`: Sonst stünde eine laufende Freizeit ab ihrem
      // zweiten Tag zugleich oben als „aktuell" und darüber als „letzter".
      //
      // **`{ not: CANCELLED }` und nicht `PLANNED`.** Gemeint war immer „ein
      // Abend, der ausgefallen ist, ist keiner, den man nachliest" — aber
      // `PLANNED` sagt das nicht: Der nächtliche Lauf setzt jeden vergangenen
      // Abend auf `COMPLETED` (`closePastMeetings`). Die Karte stand damit in
      // Produktion von Mitternacht bis drei Uhr da und danach nie wieder,
      // während sie in der Entwicklung immer stand — dort läuft nachts kein
      // Server. Dieselbe Bedingung wie in `latestActionstep`, das für denselben
      // Abend dieselbe Frage stellt.
      //
      // Sortiert nach dem Anfangstag, ebenfalls wie dort.
      this.prisma.meeting.findFirst({
        where: {
          hauskreisId,
          ...finishedBefore(today),
          status: { not: MeetingStatus.CANCELLED },
        },
        orderBy: { date: 'desc' },
        select: meetingSelect,
      }),
      // Dieselbe Regel wie in der wöchentlichen Erinnerung: ein leerer Abend
      // beendet den Vorsatz von davor, nur ein besonderer Termin ohne
      // Actionstep wird übersprungen.
      latestActionstep(this.prisma, hauskreisId, today),
      this.assignments.findAssignments(hauskreisId, {
        from: today,
        to: addDays(today, HOME_HORIZON_DAYS),
        personId,
        // Der Geburtstag taucht hier genau dann auf, wenn auch die
        // Erinnerung kommt — dieselbe Zahl, dieselbe Einstellung. Zwei
        // Systeme mit zwei Meinungen darüber, ab wann etwas „ansteht",
        // wären eines zu viel.
        birthdayLeadDays:
          (
            await this.preferences.resolve(
              personId,
              NotificationType.BIRTHDAY_GIFT_REMINDER,
            )
          ).leadDays ?? 0,
      }),
      this.buddies.findCurrent(hauskreisId, now),
      // Dieselbe Menge wie in der Anwesenheitsliste am Termin: „3 von 8"
      // muss auf beiden Bildschirmen dieselben acht meinen.
      this.prisma.person.count({ where: { hauskreisId, ...ANGEKOMMEN } }),
    ]);

    const myGroup = buddies?.groups.find((group) =>
      group.members.some((member) => member.id === personId),
    );

    const zone = await this.clock.zoneOf(hauskreisId);

    /**
     * Ein Abend „läuft" ab seiner Treffpunktzeit und bis sein letzter Tag um
     * ist. Dass er nicht vorbei ist, weiß die Abfrage oben schon
     * (`notFinishedBefore`) — hier bleibt nur die Uhr des Anfangstags.
     *
     * Dieselbe Grenze wie beim Abhaken des Actionsteps und beim Freigeben des
     * Themen-Inhalts (`eveningReached`). Zwei Rechnungen für „hat der Abend
     * angefangen" wären eine zu viel.
     */
    const läuft = (meeting: (typeof meetings)[number]) =>
      eveningReached(meeting.date, zone, now, meeting.startMinutes);

    const current = meetings[0] && läuft(meetings[0]) ? meetings[0] : null;
    const next = meetings.find((meeting) => meeting !== current) ?? null;
    // Der obere Platz gehört dem laufenden Abend, sonst dem letzten. Beides
    // zugleich wäre eine Karte zu viel und die Frage „wo bin ich jetzt" zweimal
    // beantwortet.
    const last = current ? null : lastFinished;

    // `now` reicht bis hierher durch: die Abendregel ist eine Frage an die Uhr,
    // und ein Startbildschirm, der sie anders beantwortet als der Termin selbst,
    // wäre der Fehler, den ein gemeinsamer Helfer gerade verhindern soll.
    const shape = (
      meeting: (typeof meetings)[number] | null,
    ): HomeMeeting | null => {
      if (!meeting) return null;

      const session = meeting.topicSession
        ? shapeSessionForMeeting(
            meeting.topicSession,
            meeting.topicSession.topic,
            {
              personId,
              isAdmin,
              zone,
              now,
            },
          )
        : null;

      return {
        id: meeting.id,
        date: isoDate(meeting.date),
        startTime: meeting.startMinutes,
        endDate: meeting.endDate ? isoDate(meeting.endDate) : null,
        hasTopicSlot: meeting.hasTopicSlot,
        hasSongSlot: meeting.hasSongSlot,
        hasTestimonySlot: meeting.hasTestimonySlot,
        title: meeting.title,
        location: meeting.location,
        host: meeting.host,
        topicResponsibles: meeting.topicResponsibles.map((r) => r.person),
        // Über dieselbe Umformung wie überall: vor der Treffpunktzeit gehört
        // der Titel denen, die ihn vorbereiten, und `shapeSession` gibt ihn
        // dann als `null` zurück. Ein zweiter Weg an dieselbe Frage wäre ein
        // zweiter Weg, sie falsch zu beantworten.
        topic: session?.contentVisible
          ? { id: session.topic.id, title: session.topic.title }
          : null,
        songLeaders: meeting.songLeaders.map((leader) => leader.person),
        testimonyPerson: meeting.testimonyPerson,
        // No row means nobody answered yet, which is exactly UNKNOWN.
        myAttendance: meeting.attendances[0]?.status ?? 'UNKNOWN',
      };
    };

    return {
      currentMeeting: shape(current),
      lastMeeting: shape(last),
      nextMeeting: shape(next),
      myRoles: myRoles.filter((role) => role.role !== 'PRAYER_BUDDY'),
      // Abgeschaltet heißt nicht „leer", sondern „gibt es hier nicht" — beide
      // Karten fallen im Frontend an genau diesem `null` von selbst weg.
      openActionstep:
        features.weeklyActionstep && actionstep
          ? {
              text: actionstep.text,
              meetingId: actionstep.id,
              date: isoDate(actionstep.date),
              done: actionstep.actionstepDone.some(
                (row) => row.personId === personId,
              ),
              doneCount: actionstep.actionstepDone.length,
              peopleCount,
            }
          : null,
      prayerBuddies:
        features.prayerBuddies && buddies && myGroup
          ? { until: buddies.periodEnd, members: myGroup.members }
          : null,
    };
  }
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
