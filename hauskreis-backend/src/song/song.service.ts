import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
  createdBy: { select: { id: true, name: true } },
} as const;

@Injectable()
export class SongService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The song database, searchable by title or artist.
   *
   * `contains` with `insensitive` becomes ILIKE. Good enough for a group's
   * repertoire — a few hundred rows, where a trigram index would buy nothing
   * but an extension to install.
   */
  async findAll(hauskreisId: string, query: ListSongsQueryDto) {
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
    };

    const [items, total] = await Promise.all([
      this.prisma.song.findMany({
        where,
        select: songSelect,
        orderBy: { title: 'asc' },
        take: query.take,
        skip: query.skip,
      }),
      this.prisma.song.count({ where }),
    ]);

    return toPage(items, total, query);
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
      reload: () => this.findOne(hauskreisId, id),
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
