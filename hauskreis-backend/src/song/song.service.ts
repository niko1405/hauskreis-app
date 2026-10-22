import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { personRefSelect } from '../common/dto/response';
import { PrismaService } from '../prisma/prisma.service';
import { GroupClockService } from '../meeting/group-clock.service';
import { updateWithVersionCheck } from '../common/http/optimistic-update';
import { toPage } from '../common/http/pagination';
import type { IfMatchCondition } from '../common/http/etag';
import type {
  CreateSongDto,
  ListSongsQueryDto,
  UpdateSongDto,
} from './dto/song.dto';

const songSelect = {
  id: true,
  title: true,
  artist: true,
  lyricsUrl: true,
  createdAt: true,
  version: true,
  createdBy: { select: personRefSelect },
} as const;

@Injectable()
export class SongService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: GroupClockService,
  ) {}

  /**
   * The song database, searchable by title or artist.
   *
   * `contains` with `insensitive` becomes ILIKE. Good enough for a group's
   * repertoire — a few hundred rows, where a trigram index would buy nothing
   * but an extension to install.
   */
  async findAll(hauskreisId: string, query: ListSongsQueryDto) {
    const played = await this.playedFilter(hauskreisId);

    const where = {
      hauskreisId,
      ...(query.search
        ? {
            OR: [
              {
                title: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                artist: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
      ...(query.playedOnly ? { pickedIn: { some: played } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.song.findMany({
        where,
        select: {
          ...songSelect,
          pickedIn: {
            where: played,
            select: { meeting: { select: { date: true } } },
            orderBy: { meeting: { date: 'desc' } },
          },
        },
        // Sorting by usage is done in TypeScript rather than SQL: the counts
        // come from the same rows that are already being loaded for the facts,
        // and a group's repertoire is a few hundred songs.
        orderBy: { title: 'asc' },
        ...(query.sort === 'title'
          ? { take: query.take, skip: query.skip }
          : {}),
      }),
      this.prisma.song.count({ where }),
    ]);

    const withFacts = items.map(({ pickedIn, ...song }) => ({
      ...song,
      timesPlayed: pickedIn.length,
      lastPlayedAt: pickedIn[0] ? isoDate(pickedIn[0].meeting.date) : null,
    }));

    if (query.sort === 'title') {
      return toPage(withFacts, total, query);
    }

    const sorted = withFacts.toSorted(
      query.sort === 'popular' ? byPopularity : byRecency,
    );

    return toPage(
      sorted.slice(query.skip, query.skip + query.take),
      total,
      query,
    );
  }

  /**
   * Was wir über ein Lied wissen — **über alle Hauskreise hinweg**.
   *
   * Die einzige Song-Abfrage im Backend ohne `hauskreisId` im `where`, und das
   * ist Absicht. „Wie heißt das Lied hinter diesem Link" ist keine Frage, deren
   * Antwort von der Gruppe abhängt: Sie kostet sonst einen Modellaufruf für
   * etwas, das eine Gruppe weiter schon dasteht. Derselbe Gedanke steht am
   * Zwischenspeicher in `SongLookupService` — er trennt seine Schlüssel
   * ebenfalls nicht nach Hauskreis.
   *
   * Zurück gehen **nur** `title`, `artist` und `lyricsUrl`: drei Felder, die
   * über niemanden etwas aussagen. Wer den Song angelegt hat, wann, in welcher
   * Gruppe und unter welcher Id — das bleibt hier.
   *
   * Der `HauskreisMemberGuard` bleibt davon unberührt: Er schützt die Route,
   * und die ist weiterhin hauskreisgebunden. Wer hier ankommt, gehört zu einer
   * Gruppe; er erfährt nur nicht, zu welcher das gefundene Lied gehört.
   *
   * Grob eingegrenzt und in TypeScript entschieden: Auf `title` und
   * `lyrics_url` liegt kein Index (und es kommt keiner dazu — bei ein paar
   * hundert Zeilen je Gruppe wäre er Pflege ohne Gegenwert), und die
   * Normalisierung aus `song-key.ts` lässt sich in SQL ohnehin nicht ausdrücken.
   *
   * **Die Titel-Richtung grenzt deshalb gar nicht ein.** Ein `title: { equals }`
   * in SQL verglich buchstabengenau, bevor `songTitleKey` normalisieren könnte —
   * „Goodness of God" fände „Goodness of God (Live)" nicht. Zu laden kostet
   * nichts Zusätzliches: Ohne Index scannt Postgres die Tabelle so oder so.
   */
  async lookupAcrossGroups(
    where: { urlHost?: string } = {},
  ): Promise<{ title: string; artist: string | null; lyricsUrl: string }[]> {
    // Ohne Adresse hilft eine Zeile hier nicht weiter: Gesucht wird in beiden
    // Richtungen etwas, das auf eine Seite zeigt. In der URL-Richtung grenzt
    // der Host echt ein — er überlebt die Normalisierung unverändert.
    const filter: Prisma.SongWhereInput =
      where.urlHost === undefined
        ? { lyricsUrl: { not: null } }
        : {
            lyricsUrl: {
              contains: where.urlHost,
              mode: 'insensitive',
              not: null,
            },
          };

    const rows = await this.prisma.song.findMany({
      where: filter,
      select: { title: true, artist: true, lyricsUrl: true },
      // Die Jüngsten zuerst: Wird der Deckel je erreicht, sind die zuletzt
      // angelegten Lieder die, nach denen gerade jemand sucht.
      orderBy: { createdAt: 'desc' },
      // Eine Obergrenze und keine Seitenzahl: Der Aufrufer sucht ein bestimmtes
      // Lied, nicht die zweite Seite. Reicht das für eine Instanz einmal nicht
      // mehr, ist der Ausweg ein gespeicherter Schlüssel neben dem Titel — wie
      // `location.address_key` — und nicht ein größerer Deckel.
      take: 5000,
    });

    return rows.flatMap((row) =>
      row.lyricsUrl === null ? [] : [{ ...row, lyricsUrl: row.lyricsUrl }],
    );
  }

  /**
   * Which evenings count as "sung".
   *
   * Only evenings the song was actually picked for. A suggestion that did not
   * make the list says something about one person's wish, not about the
   * group's repertoire.
   *
   * `lte` auf den **Kalendertag** der Gruppe, nicht auf den Zeitpunkt: die
   * Spalte ist ein Datum, und ein Lied, das für heute Abend auf der Liste
   * steht, zählt zum Repertoire. `new Date()` meinte in der Nacht nach dem
   * Abend noch den Vortag.
   *
   * Eine Stelle für Liste und Liedseite: Zwei Fassungen derselben Bedingung
   * zählten irgendwann verschieden, und dann stünde auf der Liedseite eine
   * andere Zahl als in der Zeile, von der man kam.
   */
  private async playedFilter(hauskreisId: string) {
    return {
      isSelected: true,
      meeting: { date: { lte: await this.clock.today(hauskreisId) } },
    };
  }

  /**
   * Ein Lied für seine eigene Seite — mit denselben Zahlen wie in der Liste und
   * einer dritten: an wie vielen Abenden es überhaupt steht.
   *
   * Die dritte zählt **jeden** Eintrag, Vorschläge eingeschlossen, denn genau
   * daran hängt `remove`: Gelöscht wird nur, was an keinem Abend mehr steht.
   * Die Seite sagt das vorher, statt einen Knopf anzubieten, der verlässlich
   * eine Fehlermeldung erzeugt.
   *
   * Getrennt von `findOne`, das intern nur „gibt es das" beantwortet (beim
   * Vorschlagen, vor dem Ändern) und dafür keine Zählung braucht.
   */
  async findDetail(hauskreisId: string, id: string) {
    const played = await this.playedFilter(hauskreisId);

    const song = await this.prisma.song.findFirst({
      where: { id, hauskreisId },
      select: {
        ...songSelect,
        pickedIn: {
          where: played,
          select: { meeting: { select: { date: true } } },
          orderBy: { meeting: { date: 'desc' } },
        },
        _count: { select: { pickedIn: true } },
      },
    });

    if (!song) {
      throw new NotFoundException(`Song ${id} not found`);
    }

    const { pickedIn, _count, ...rest } = song;

    return {
      ...rest,
      timesPlayed: pickedIn.length,
      lastPlayedAt: pickedIn[0] ? isoDate(pickedIn[0].meeting.date) : null,
      meetingCount: _count.pickedIn,
    };
  }

  async findOne(hauskreisId: string, id: string) {
    const song = await this.prisma.song.findFirst({
      where: { id, hauskreisId },
      select: songSelect,
    });

    if (!song) {
      throw new NotFoundException(`Song ${id} not found`);
    }

    return song;
  }

  /**
   * Adds a song, or returns the one already there.
   *
   * Reusing rather than rejecting a duplicate is deliberate: the caller wanted
   * "this song in the database", and it already is. A 400 would force the
   * frontend to search first and handle a race it cannot win.
   */
  async createOrReuse(
    hauskreisId: string,
    dto: CreateSongDto,
    createdByPersonId: string | null,
  ) {
    const artist = dto.artist ?? null;

    const existing = await this.prisma.song.findFirst({
      where: { hauskreisId, title: dto.title, artist },
      select: songSelect,
    });

    if (existing) {
      return existing;
    }

    return this.prisma.song.create({
      data: {
        hauskreisId,
        title: dto.title,
        artist,
        lyricsUrl: dto.lyricsUrl ?? null,
        createdByPersonId,
      },
      select: songSelect,
    });
  }

  async update(
    hauskreisId: string,
    id: string,
    dto: UpdateSongDto,
    condition?: IfMatchCondition,
  ) {
    await this.findOne(hauskreisId, id);

    return updateWithVersionCheck({
      condition,
      update: (versionConstraint) =>
        this.prisma.song.updateMany({
          where: { id, hauskreisId, ...versionConstraint },
          data: {
            title: dto.title,
            artist: dto.artist,
            lyricsUrl: dto.lyricsUrl,
            version: { increment: 1 },
          },
        }),
      exists: () => this.prisma.song.findFirst({ where: { id, hauskreisId } }),
      reload: () => this.findDetail(hauskreisId, id),
      notFoundMessage: `Song ${id} not found`,
    });
  }

  /**
   * Removing a song takes it out of every evening it was ever suggested for,
   * history included — so it is admin-only and refused while it is still in
   * use. Renaming is almost always what was meant.
   */
  async remove(hauskreisId: string, id: string) {
    await this.findOne(hauskreisId, id);

    const usages = await this.prisma.meetingSong.count({
      where: { songId: id },
    });

    if (usages > 0) {
      throw new BadRequestException(
        `Song ${id} is still on ${usages} meeting(s). Remove it there first, or edit the song instead.`,
      );
    }

    await this.prisma.song.delete({ where: { id } });
  }
}

interface SongWithFacts {
  title: string;
  timesPlayed: number;
  lastPlayedAt: string | null;
}

/** Most sung first; ties by title so the list never reshuffles on reload. */
function byPopularity(a: SongWithFacts, b: SongWithFacts): number {
  return b.timesPlayed - a.timesPlayed || a.title.localeCompare(b.title);
}

/**
 * Most recently sung first. Never-sung songs go last rather than first — an
 * empty date is "wir kennen es noch nicht", not "ewig her".
 */
function byRecency(a: SongWithFacts, b: SongWithFacts): number {
  if (a.lastPlayedAt === b.lastPlayedAt) {
    return a.title.localeCompare(b.title);
  }

  if (!a.lastPlayedAt) {
    return 1;
  }

  if (!b.lastPlayedAt) {
    return -1;
  }

  return b.lastPlayedAt.localeCompare(a.lastPlayedAt);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
