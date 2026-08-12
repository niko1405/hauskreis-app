import { Injectable } from '@nestjs/common';
import { personRefSelect } from '../common/dto/response';
import { PrismaService } from '../prisma/prisma.service';
import { PrayerBuddyService } from '../prayer-buddy/prayer-buddy.service';
import { AssignmentService, type Assignment } from './assignment.service';
import { MeetingStatus } from '../../generated/prisma/enums';
import { addDays } from '../meeting/meeting-schedule';
import { GroupClockService } from '../meeting/group-clock.service';
import {
  actionstepOf,
  actionstepSelect,
  hasActionstep,
} from '../meeting/actionstep-source';
import {
  sessionSelectWithTopic,
  shapeSessionForMeeting,
  type Viewer,
} from '../topic/topic-shape';

/** How far ahead the home screen looks for your own jobs. */
export const HOME_HORIZON_DAYS = 8 * 7;

export interface HomeScreen {
  /** Null when nothing is planned — a valid state, not an error. */
  nextMeeting: {
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
    type: string;
    /** Ob der Abend überhaupt ein Thema bzw. Lieder vorsieht. */
    hasTopicSlot: boolean;
    hasSongSlot: boolean;
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
    /** What *you* answered for that evening. */
    myAttendance: string;
  } | null;
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
  /** Who you are praying with right now. */
  prayerBuddies: { until: string; withNames: string[] } | null;
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
  ) {}

  async build(
    hauskreisId: string,
    viewer: Viewer,
    options: { now?: Date } = {},
  ): Promise<HomeScreen> {
    const { personId, isAdmin } = viewer;
    const now = options.now ?? new Date();
    const today = await this.clock.today(hauskreisId, now);

    const [meeting, actionstep, myRoles, buddies, peopleCount] =
      await Promise.all([
        this.prisma.meeting.findFirst({
          where: {
            hauskreisId,
            date: { gte: today },
            status: MeetingStatus.PLANNED,
          },
          orderBy: { date: 'asc' },
          select: {
            id: true,
            date: true,
            startMinutes: true,
            endDate: true,
            type: true,
            hasTopicSlot: true,
            hasSongSlot: true,
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
          },
        }),
        this.prisma.meeting.findFirst({
          where: {
            hauskreisId,
            date: { lt: today },
            status: { not: MeetingStatus.CANCELLED },
            // Aus beiden Quellen — Einheit oder Nachbereitung des Abends.
            ...hasActionstep,
          },
          orderBy: { date: 'desc' },
          select: {
            id: true,
            date: true,
            ...actionstepSelect,
            // Nur die Ids: der Startbildschirm zeigt eine Zahl und den eigenen
            // Haken, die Namen stehen auf der Detailseite.
            actionstepDone: { select: { personId: true } },
          },
        }),
        this.assignments.findAssignments(hauskreisId, {
          from: today,
          to: addDays(today, HOME_HORIZON_DAYS),
          personId,
        }),
        this.buddies.findCurrent(hauskreisId, now),
        this.prisma.person.count({ where: { hauskreisId, active: true } }),
      ]);

    const myGroup = buddies?.groups.find((group) =>
      group.members.some((member) => member.id === personId),
    );

    // `now` reicht bis hierher durch: die Abendregel ist eine Frage an die Uhr,
    // und ein Startbildschirm, der sie anders beantwortet als der Termin selbst,
    // wäre der Fehler, den ein gemeinsamer Helfer gerade verhindern soll.
    const nextSession = meeting?.topicSession
      ? shapeSessionForMeeting(
          meeting.topicSession,
          meeting.topicSession.topic,
          {
            personId,
            isAdmin,
            zone: await this.clock.zoneOf(hauskreisId),
            now,
          },
        )
      : null;

    const actionstepText = actionstep && actionstepOf(actionstep);

    return {
      nextMeeting: meeting
        ? {
            id: meeting.id,
            date: isoDate(meeting.date),
            startTime: meeting.startMinutes,
            endDate: meeting.endDate ? isoDate(meeting.endDate) : null,
            type: meeting.type,
            hasTopicSlot: meeting.hasTopicSlot,
            hasSongSlot: meeting.hasSongSlot,
            title: meeting.title,
            location: meeting.location,
            host: meeting.host,
            topicResponsibles: meeting.topicResponsibles.map((r) => r.person),
            // Über dieselbe Umformung wie überall: vor 18 Uhr am Termintag
            // gehört der Titel denen, die ihn vorbereiten, und `shapeSession`
            // gibt ihn dann als `null` zurück. Ein zweiter Weg an dieselbe
            // Frage wäre ein zweiter Weg, sie falsch zu beantworten.
            topic: nextSession?.contentVisible
              ? { id: nextSession.topic.id, title: nextSession.topic.title }
              : null,
            songLeaders: meeting.songLeaders.map((leader) => leader.person),
            // No row means nobody answered yet, which is exactly UNKNOWN.
            myAttendance: meeting.attendances[0]?.status ?? 'UNKNOWN',
          }
        : null,
      myRoles: myRoles.filter((role) => role.role !== 'PRAYER_BUDDY'),
      openActionstep:
        actionstep && actionstepText
          ? {
              text: actionstepText,
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
        buddies && myGroup
          ? {
              until: buddies.periodEnd,
              withNames: myGroup.members
                .filter((member) => member.id !== personId)
                .map((member) => member.name),
            }
          : null,
    };
  }
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
