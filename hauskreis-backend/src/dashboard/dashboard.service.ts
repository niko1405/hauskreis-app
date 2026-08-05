import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrayerBuddyService } from '../prayer-buddy/prayer-buddy.service';
import { AssignmentService, type Assignment } from './assignment.service';
import { MeetingStatus } from '../../generated/prisma/enums';
import { addDays, toUtcDate } from '../meeting/meeting-schedule';

/** How far ahead the home screen looks for your own jobs. */
export const HOME_HORIZON_DAYS = 8 * 7;

export interface HomeScreen {
  /** Null when nothing is planned — a valid state, not an error. */
  nextMeeting: {
    id: string;
    date: string;
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
    topic: {
      id: string;
      title: string | null;
      responsibles: { id: string; name: string }[];
    } | null;
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
  ) {}

  async build(
    hauskreisId: string,
    personId: string,
    options: { now?: Date } = {},
  ): Promise<HomeScreen> {
    const now = options.now ?? new Date();
    const today = toUtcDate(now);

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
            host: { select: { id: true, name: true } },
            topic: {
              select: {
                id: true,
                title: true,
                responsibles: {
                  select: { person: { select: { id: true, name: true } } },
                },
              },
            },
            songLeaders: {
              select: { person: { select: { id: true, name: true } } },
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
            actionstepText: { not: null },
          },
          orderBy: { date: 'desc' },
          select: {
            id: true,
            date: true,
            actionstepText: true,
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

    return {
      nextMeeting: meeting
        ? {
            id: meeting.id,
            date: isoDate(meeting.date),
            endDate: meeting.endDate ? isoDate(meeting.endDate) : null,
            type: meeting.type,
            hasTopicSlot: meeting.hasTopicSlot,
            hasSongSlot: meeting.hasSongSlot,
            title: meeting.title,
            location: meeting.location,
            host: meeting.host,
            topic: meeting.topic
              ? {
                  id: meeting.topic.id,
                  title: meeting.topic.title,
                  responsibles: meeting.topic.responsibles.map((r) => r.person),
                }
              : null,
            songLeaders: meeting.songLeaders.map((leader) => leader.person),
            // No row means nobody answered yet, which is exactly UNKNOWN.
            myAttendance: meeting.attendances[0]?.status ?? 'UNKNOWN',
          }
        : null,
      myRoles: myRoles.filter((role) => role.role !== 'PRAYER_BUDDY'),
      openActionstep:
        actionstep && actionstep.actionstepText?.trim()
          ? {
              text: actionstep.actionstepText,
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
