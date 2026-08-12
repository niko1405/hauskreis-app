import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MeetingStatus } from '../../generated/prisma/enums';
import { GroupClockService } from '../meeting/group-clock.service';
import { topicScopeWhere } from '../topic/topic-shape';

export interface ArchiveYear {
  year: number;
  meetings: number;
}

export interface ArchiveSummary {
  /** Newest year first, so the picker opens on the current one. */
  years: ArchiveYear[];
  totals: {
    meetings: number;
    topics: number;
    /**
     * Die eigenen — Owner oder Mitarbeit, auch die noch nicht gehaltenen.
     *
     * Zählt also **nicht** eine Teilmenge von `topics`: ein eigenes Thema, von
     * dem noch kein Abend war, steht hier drin und dort nicht. Genau das ist
     * der Unterschied zwischen den beiden Registern.
     */
    topicsMine: number;
    /**
     * Die Vereinigung der beiden Register — was die Kachel „Themen" zeigt.
     *
     * Nicht `topics + topicsMine`: ein eigenes, schon gehaltenes Thema steht in
     * beiden und wäre doppelt gezählt. Und nicht `topics` allein, was vorher
     * dort stand — darüber konnte „Themen (0)" stehen, während das Register
     * darunter „Eigene (1)" meldete.
     */
    topicsTotal: number;
    songs: number;
    /** Songs the group actually sang, as opposed to only suggested. */
    songsPlayed: number;
  };
  /** Null before the group has met at all. */
  firstMeetingDate: string | null;
}

/**
 * The one thing the archive needs that no single feature owns: an overview.
 *
 * Everything else in the archive is a list the feature modules already serve —
 * `…/meetings?scope=past`, `…/topics`, `…/songs` — with search, date bounds and
 * pagination. Duplicating those here as `/archive/meetings` would mean two
 * endpoints answering the same question and drifting apart. This module adds
 * only what is genuinely cross-cutting: what is in there, and which years to
 * offer.
 *
 * Read-only throughout. There is nothing to write.
 */
@Injectable()
export class ArchiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: GroupClockService,
  ) {}

  async summarise(
    hauskreisId: string,
    /** Für „Eigene Themen (n)" — dieselbe Bedingung wie `scope=mine`. */
    personId: string,
  ): Promise<ArchiveSummary> {
    const today = await this.clock.today(hauskreisId);
    const past = {
      hauskreisId,
      date: { lt: today },
      status: { not: MeetingStatus.CANCELLED },
    };

    /** Was im Register „Alle" steht: mindestens ein Abend war schon. */
    const held = { sessions: { some: { meeting: past } } };
    /** Was im Register „Eigene" steht — dasselbe Fragment wie die Liste. */
    const mine = topicScopeWhere('mine', personId, today);

    // Just the dates, folded into years here. Postgres could group by
    // `date_part`, but Prisma cannot express that without a raw query — and at
    // roughly fifty evenings a year the whole column is a handful of kilobytes.
    // It also saves a second query for the count and the first date.
    const [dates, topics, topicsMine, topicsTotal, songs, songsPlayed] =
      await Promise.all([
        this.prisma.meeting.findMany({
          where: past,
          orderBy: { date: 'asc' },
          select: { date: true },
        }),
        // Nur was auch im Archiv steht: ein Thema wird öffentlich, sobald eine
        // seiner Einheiten gehalten wurde. Alle zu zählen hieße, eine Zahl über
        // die Karte zu schreiben, die größer ist als die Liste darunter.
        this.prisma.topic.count({ where: { hauskreisId, ...held } }),
        // Zwei Formulierungen derselben Frage wären zwei Gelegenheiten, sie
        // verschieden zu beantworten.
        this.prisma.topic.count({ where: { hauskreisId, ...mine } }),
        // Die Vereinigung, nicht die Summe: ein eigenes gehaltenes Thema steht
        // in beiden Registern und darf trotzdem nur einmal zählen.
        this.prisma.topic.count({
          where: { hauskreisId, OR: [held, mine] },
        }),
        this.prisma.song.count({ where: { hauskreisId } }),
        this.prisma.song.count({
          where: {
            hauskreisId,
            pickedIn: {
              some: { isSelected: true, meeting: { date: { lt: today } } },
            },
          },
        }),
      ]);

    const byYear = new Map<number, number>();

    for (const { date } of dates) {
      const year = date.getUTCFullYear();
      byYear.set(year, (byYear.get(year) ?? 0) + 1);
    }

    return {
      years: [...byYear.entries()]
        .map(([year, meetings]) => ({ year, meetings }))
        .toSorted((a, b) => b.year - a.year),
      totals: {
        meetings: dates.length,
        topics,
        topicsMine,
        topicsTotal,
        songs,
        songsPlayed,
      },
      firstMeetingDate: dates[0]
        ? dates[0].date.toISOString().slice(0, 10)
        : null,
    };
  }
}
