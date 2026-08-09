import { Injectable } from '@nestjs/common';
import { personRefSelect } from '../common/dto/response';
import { PrismaService } from '../prisma/prisma.service';
import { MeetingStatus } from '../../generated/prisma/enums';
import { overlapping, toUtcDate } from '../meeting/meeting-schedule';

export type AssignmentRoleName =
  'HOST' | 'TOPIC' | 'SONG' | 'TESTIMONY' | 'PRAYER_BUDDY';

/**
 * One thing somebody is down for.
 *
 * Deliberately the *same shape* for all four roles, even though a meeting role
 * falls on one date and a prayer buddy period spans two weeks. The frontend
 * sorts and renders one list; making it branch on four shapes would push the
 * difference into every consumer.
 */
export interface Assignment {
  role: AssignmentRoleName;
  /** Start of the assignment; the meeting date for the meeting-bound roles. */
  date: string;
  /** Only set where the assignment spans time. Null for a single evening. */
  endDate: string | null;
  person: { id: string; name: string };
  /** Set for the meeting-bound roles. */
  meetingId: string | null;
  /** Set for PRAYER_BUDDY. */
  groupId: string | null;
  /** Ready-to-show context: the home, the topic, who else is in the group. */
  label: string | null;
}

export interface FindAssignmentsOptions {
  from: Date;
  to: Date;
  /** Omit for everyone — that is the multi-week table (CLAUDE.md §9). */
  personId?: string;
}

/**
 * Who is down for what in a stretch of time, across all four roles.
 *
 * A view over data that already exists, like `ArchiveService` — no new tables.
 * Without it the frontend would have to fetch meetings, topics, song leaders
 * and prayer buddies separately and join them itself, which is both four round
 * trips and a second place where "who is on for this evening" is decided.
 *
 * Two queries whatever the range: one for the meetings with their three
 * relations, one for the prayer buddy periods.
 */
@Injectable()
export class AssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  async findAssignments(
    hauskreisId: string,
    options: FindAssignmentsOptions,
  ): Promise<Assignment[]> {
    const from = toUtcDate(options.from);
    const to = toUtcDate(options.to);

    const [meetings, groups] = await Promise.all([
      this.prisma.meeting.findMany({
        where: {
          hauskreisId,
          // Überschneidung, nicht Startdatum: eine Freizeit, die vor dem
          // Fenster begann, findet darin trotzdem statt — und wer dort
          // gastgebend eingetragen ist, ist in diesen Wochen dran.
          ...overlapping(from, to),
          // An evening that was called off is nobody's job any more.
          status: { not: MeetingStatus.CANCELLED },
        },
        select: {
          id: true,
          date: true,
          host: { select: personRefSelect },
          testimonyPerson: { select: personRefSelect },
          location: { select: { name: true } },
          topicResponsibles: {
            select: { person: { select: personRefSelect } },
            orderBy: { person: { name: 'asc' } },
          },
          topicSession: {
            select: { title: true, topic: { select: { title: true } } },
          },
          songLeaders: {
            select: { person: { select: personRefSelect } },
          },
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.prayerBuddyGroup.findMany({
        where: {
          hauskreisId,
          discardedAt: null,
          // Overlap, not containment: a fortnight that started before the
          // window still runs during it, and that is what people are asking
          // about when they open the week.
          periodStart: { lte: to },
          periodEnd: { gte: from },
        },
        select: {
          id: true,
          periodStart: true,
          periodEnd: true,
          members: { select: { person: { select: personRefSelect } } },
        },
        orderBy: { periodStart: 'asc' },
      }),
    ]);

    const assignments: Assignment[] = [];

    for (const meeting of meetings) {
      const date = isoDate(meeting.date);

      if (meeting.host) {
        assignments.push({
          role: 'HOST',
          date,
          endDate: null,
          person: meeting.host,
          meetingId: meeting.id,
          groupId: null,
          label: meeting.location?.name ?? null,
        });
      }

      if (meeting.testimonyPerson) {
        assignments.push({
          role: 'TESTIMONY',
          date,
          endDate: null,
          person: meeting.testimonyPerson,
          meetingId: meeting.id,
          groupId: null,
          label: null,
        });
      }

      // Die Zuteilung, nicht die Einheit: „Lena ist dran" gilt auch, solange
      // noch offen ist, womit. Als Beschriftung der Titel des Abends, sonst der
      // des Themas — und sonst nichts, dann steht nur der Name da.
      const topicLabel =
        meeting.topicSession?.title ??
        meeting.topicSession?.topic.title ??
        null;

      for (const responsible of meeting.topicResponsibles) {
        assignments.push({
          role: 'TOPIC',
          date,
          endDate: null,
          person: responsible.person,
          meetingId: meeting.id,
          groupId: null,
          label: topicLabel,
        });
      }

      for (const leader of meeting.songLeaders) {
        assignments.push({
          role: 'SONG',
          date,
          endDate: null,
          person: leader.person,
          meetingId: meeting.id,
          groupId: null,
          label: null,
        });
      }
    }

    for (const group of groups) {
      const members = group.members.map((member) => member.person);

      for (const person of members) {
        assignments.push({
          role: 'PRAYER_BUDDY',
          date: isoDate(group.periodStart),
          endDate: isoDate(group.periodEnd),
          person,
          meetingId: null,
          groupId: group.id,
          label: formatOthers(members, person.id),
        });
      }
    }

    const filtered = options.personId
      ? assignments.filter(
          (assignment) => assignment.person.id === options.personId,
        )
      : assignments;

    // Chronological, then by role so an evening always reads host → topic →
    // songs rather than in whatever order the rows came back.
    return filtered.toSorted(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
        a.person.name.localeCompare(b.person.name),
    );
  }
}

const ROLE_ORDER: Record<AssignmentRoleName, number> = {
  HOST: 0,
  // Thema und Testimony teilen sich einen Platz: sie schließen einander aus,
  // an einem Abend steht also immer nur eines davon.
  TOPIC: 1,
  TESTIMONY: 1,
  SONG: 2,
  PRAYER_BUDDY: 3,
};

/** "mit Antonia und Reini" — the tone from CLAUDE.md §9. */
function formatOthers(
  members: { id: string; name: string }[],
  selfId: string,
): string | null {
  const names = members
    .filter((member) => member.id !== selfId)
    .map((member) => member.name);

  if (names.length === 0) {
    return null;
  }

  if (names.length === 1) {
    return `mit ${names[0]}`;
  }

  return `mit ${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}`;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
