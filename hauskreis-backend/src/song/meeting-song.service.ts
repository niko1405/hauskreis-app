import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MeetingStatus } from '../../generated/prisma/enums';
import { personRefSelect } from '../common/dto/response';
import { PrismaService } from '../prisma/prisma.service';
import { RoleAssignmentNotifier } from '../notification/role-assignment-notifier.service';
import { RoleAttendanceService } from '../attendance/role-attendance.service';
import { AssignmentRole } from '../../generated/prisma/enums';
import { AvailabilityService } from '../role-suggestion/availability.service';
import { EditRightsService } from '../meeting/edit-rights.service';
import { GroupClockService } from '../meeting/group-clock.service';
import {
  clearSongSelectionIfUnled,
  touchMeeting,
} from '../meeting/meeting-version';
import { SongService } from './song.service';
import type {
  AddMeetingSongDto,
  ReorderSetlistDto,
  SetSongLeadersDto,
  UpdateMeetingSongDto,
} from './dto/song.dto';

const meetingSongSelect = {
  id: true,
  isSelected: true,
  position: true,
  createdAt: true,
  song: {
    select: { id: true, title: true, artist: true, lyricsUrl: true },
  },
  suggestedBy: { select: personRefSelect },
  votes: { select: { personId: true } },
} as const;

type MeetingSongRow = {
  id: string;
  isSelected: boolean;
  position: number | null;
  createdAt: Date;
  song: {
    id: string;
    title: string;
    artist: string | null;
    lyricsUrl: string | null;
  };
  suggestedBy: { id: string; name: string } | null;
  votes: { personId: string }[];
};

/**
 * Was der Betrachter von einem Eintrag sieht: die Zahl der Stimmen und ob
 * seine dabei ist — nicht, von wem die anderen kommen. Dieselbe Form wie bei
 * den Geschenkideen.
 */
function shape(row: MeetingSongRow, viewerId: string) {
  const { votes, ...rest } = row;
  return {
    ...rest,
    votes: votes.length,
    votedByMe: votes.some((vote) => vote.personId === viewerId),
  };
}

/**
 * Erst die Setlist in ihrer Reihenfolge, dann die Vorschläge nach Stimmen.
 *
 * Zwei Ordnungen in einer Liste, weil es zwei Fragen sind: „in welcher Folge
 * singen wir" entscheidet das Musik-Team, „was wollen die anderen" sagen die
 * Stimmen. Bei Gleichstand gilt, wer zuerst vorgeschlagen hat — dieselbe
 * Regel wie bisher für die ganze Liste.
 */
function bySetlistThenVotes(a: MeetingSongRow, b: MeetingSongRow): number {
  if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1;
  if (a.isSelected) {
    return (
      (a.position ?? Number.MAX_SAFE_INTEGER) -
        (b.position ?? Number.MAX_SAFE_INTEGER) ||
      a.createdAt.getTime() - b.createdAt.getTime()
    );
  }
  return (
    b.votes.length - a.votes.length ||
    a.createdAt.getTime() - b.createdAt.getTime()
  );
}

@Injectable()
export class MeetingSongService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly songs: SongService,
    private readonly roleAssignments: RoleAssignmentNotifier,
    private readonly roleAttendance: RoleAttendanceService,
    private readonly availability: AvailabilityService,
    private readonly editRights: EditRightsService,
    private readonly clock: GroupClockService,
  ) {}

  async findAll(hauskreisId: string, meetingId: string, viewerId: string) {
    await this.assertMeetingBelongsToHauskreis(hauskreisId, meetingId);

    const rows = await this.prisma.meetingSong.findMany({
      where: { meetingId },
      select: meetingSongSelect,
    });

    return rows.toSorted(bySetlistThenVotes).map((row) => shape(row, viewerId));
  }

  /**
   * Puts a song forward for one evening.
   *
   * Takes either an existing `songId` or a new song's details, because that is
   * how the field actually behaves: you type a title and it is either known or
   * it is not. Anything new lands in the database and is offered next time.
   */
  async add(
    hauskreisId: string,
    meetingId: string,
    dto: AddMeetingSongDto,
    suggestedByPersonId: string | null,
  ) {
    await this.assertMeetingBelongsToHauskreis(hauskreisId, meetingId);

    // The schema guarantees exactly one of the two is set.
    const song = dto.songId
      ? await this.songs.findOne(hauskreisId, dto.songId)
      : await this.songs.createOrReuse(
          hauskreisId,
          {
            title: dto.title as string,
            artist: dto.artist,
            lyricsUrl: dto.lyricsUrl,
          },
          suggestedByPersonId,
        );
    const songId = song.id;

    const existing = await this.prisma.meetingSong.findUnique({
      where: { meetingId_songId: { meetingId, songId } },
      select: meetingSongSelect,
    });

    // Suggesting the same song twice is the same wish, not a second entry.
    if (existing) {
      return shape(existing, suggestedByPersonId ?? '');
    }

    const created = await this.prisma.meetingSong.create({
      data: { meetingId, songId, suggestedByPersonId },
      select: meetingSongSelect,
    });

    return shape(created, suggestedByPersonId ?? '');
  }

  /**
   * Moves a suggestion on or off the evening's actual set list.
   *
   * Vor dem Abend dürfen das nur die Musik-Zuständigen: das Abhaken ist dann
   * eine Entscheidung („das singen wir"), und die trifft, wer die Musik macht.
   * Danach darf jede:r — dann ist es ein Protokoll („das haben wir gesungen"),
   * und daran erinnert sich jede:r gleich gut. Ist niemand zugeteilt, darf
   * vorher **niemand**; die Regel steht in `edit-rights.service.ts`.
   */
  async setSelected(
    hauskreisId: string,
    meetingId: string,
    id: string,
    dto: UpdateMeetingSongDto,
    actorPersonId: string,
  ) {
    await this.assertMeetingBelongsToHauskreis(hauskreisId, meetingId);
    await this.editRights.assertMayPickSongs(meetingId, actorPersonId);

    // Wer in die Setlist kommt, kommt ans Ende — die Reihenfolge davor hat
    // schon jemand gemacht. Wer herausfällt, verliert seinen Platz und ist
    // wieder ein Vorschlag; seine Stimmen bleiben stehen.
    const count = await this.prisma.$transaction(async (tx) => {
      const last = await tx.meetingSong.findFirst({
        where: { meetingId, isSelected: true },
        orderBy: { position: { sort: 'desc', nulls: 'last' } },
        select: { position: true },
      });

      const result = await tx.meetingSong.updateMany({
        // Ein Lied, das schon in der Setlist steht, behält seinen Platz.
        where: { id, meetingId, isSelected: { not: dto.isSelected } },
        data: dto.isSelected
          ? { isSelected: true, position: (last?.position ?? 0) + 1 }
          : { isSelected: false, position: null },
      });

      if (result.count > 0) return result.count;

      return tx.meetingSong.count({ where: { id, meetingId } });
    });

    if (count === 0) {
      throw new NotFoundException(`Song entry ${id} not found on this meeting`);
    }

    const row = await this.prisma.meetingSong.findUniqueOrThrow({
      where: { id },
      select: meetingSongSelect,
    });

    return shape(row, actorPersonId);
  }

  /**
   * Die Reihenfolge der Setlist, neu gesetzt.
   *
   * Wer sie setzt, schickt die **ganze** Setlist — dieselbe Regel wie beim
   * Abhaken (`assertMayPickSongs`): vor dem Abend das Musik-Team, danach
   * jede:r. Eine Liste, die nicht genau die Setlist ist, wird abgelehnt statt
   * geraten: Hat jemand inzwischen ein Lied dazugenommen, sähe man sonst eine
   * Reihenfolge, die keiner gewählt hat.
   */
  async reorder(
    hauskreisId: string,
    meetingId: string,
    dto: ReorderSetlistDto,
    actorPersonId: string,
  ) {
    await this.assertMeetingBelongsToHauskreis(hauskreisId, meetingId);
    await this.editRights.assertMayPickSongs(meetingId, actorPersonId);

    await this.prisma.$transaction(async (tx) => {
      const setlist = await tx.meetingSong.findMany({
        where: { meetingId, isSelected: true },
        select: { id: true },
      });

      const current = new Set(setlist.map((row) => row.id));
      const wanted = new Set(dto.meetingSongIds);

      if (
        wanted.size !== dto.meetingSongIds.length ||
        wanted.size !== current.size ||
        [...wanted].some((id) => !current.has(id))
      ) {
        throw new BadRequestException(
          'Die Reihenfolge muss genau die Lieder der Setlist enthalten — lade die Seite neu.',
        );
      }

      await Promise.all(
        dto.meetingSongIds.map((id, index) =>
          tx.meetingSong.update({
            where: { id },
            data: { position: index + 1 },
          }),
        ),
      );
    });

    return this.findAll(hauskreisId, meetingId, actorPersonId);
  }

  /**
   * Eine Stimme für einen Vorschlag — oder ihre Rücknahme.
   *
   * Jede:r darf, solange der Abend nicht abgesagt ist: Eine Stimme ist ein
   * Wunsch und keine Entscheidung, die trifft weiterhin das Musik-Team.
   */
  async setVote(
    hauskreisId: string,
    meetingId: string,
    id: string,
    personId: string,
    voted: boolean,
  ) {
    const meeting = await this.assertMeetingBelongsToHauskreis(
      hauskreisId,
      meetingId,
    );

    if (meeting.status === MeetingStatus.CANCELLED) {
      throw new BadRequestException(
        'Der Abend ist abgesagt — da gibt es nichts mehr zu wünschen.',
      );
    }

    const entry = await this.prisma.meetingSong.findFirst({
      where: { id, meetingId },
      select: { id: true },
    });

    if (!entry) {
      throw new NotFoundException(`Song entry ${id} not found on this meeting`);
    }

    if (voted) {
      await this.prisma.meetingSongVote.upsert({
        where: { meetingSongId_personId: { meetingSongId: id, personId } },
        create: { meetingSongId: id, personId },
        update: {},
      });
    } else {
      await this.prisma.meetingSongVote.deleteMany({
        where: { meetingSongId: id, personId },
      });
    }

    return this.findAll(hauskreisId, meetingId, personId);
  }

  /**
   * Nimmt einen Eintrag vom Abend.
   *
   * Einen **Vorschlag** darf jede:r löschen — er ist ein Wunsch, und wer sich
   * vertan hat, soll ihn wieder loswerden. Ein Lied in der **Setlist** dagegen
   * hat das Musik-Team dorthin gestellt; herausnehmen darf es nur, wer es
   * auch hineinstellen darf (`assertMayPickSongs`). Bis hierher prüfte diese
   * Route gar nichts.
   */
  async remove(
    hauskreisId: string,
    meetingId: string,
    id: string,
    actorPersonId: string,
  ) {
    await this.assertMeetingBelongsToHauskreis(hauskreisId, meetingId);

    const entry = await this.prisma.meetingSong.findFirst({
      where: { id, meetingId },
      select: { isSelected: true },
    });

    if (!entry) {
      throw new NotFoundException(`Song entry ${id} not found on this meeting`);
    }

    if (entry.isSelected) {
      await this.editRights.assertMayPickSongs(meetingId, actorPersonId);
    }

    // The song itself stays in the database — it was suggested once and may be
    // wanted again.
    await this.prisma.meetingSong.deleteMany({ where: { id, meetingId } });
  }

  findLeaders(hauskreisId: string, meetingId: string) {
    return this.prisma.meetingSongLeader
      .findMany({
        where: { meetingId, meeting: { hauskreisId } },
        select: { person: { select: personRefSelect } },
      })
      .then((rows) => rows.map((row) => row.person));
  }

  /**
   * Replaces who looks after the music for one evening.
   *
   * An empty list is valid: not every evening has songs, and then nobody is
   * needed (CLAUDE.md §6). No check on `playsInstrument` here — the ranking
   * suggests only people who play, but the group stays free to enter whoever
   * they agreed on.
   *
   * Auf **Anwesenheit** wird dagegen geprüft, und das ist kein Widerspruch: ob
   * jemand ein Instrument spielt, weiß die Gruppe besser als die App; ob jemand
   * an dem Abend da ist, hat er selbst eingetragen.
   */
  async setLeaders(
    hauskreisId: string,
    meetingId: string,
    dto: SetSongLeadersDto,
    /** Wer gerade einträgt — bekommt keine Nachricht über sich selbst. */
    actorPersonId?: string,
  ) {
    const meeting = await this.assertMeetingBelongsToHauskreis(
      hauskreisId,
      meetingId,
    );
    await this.assertPeopleBelongToHauskreis(hauskreisId, dto.personIds);

    // Vor dem Schreiben: benachrichtigt wird, wer **dazukommt**. Die Liste
    // ersetzt hier den ganzen Stand, ohne diesen Vergleich hörte beim
    // Nachrücken einer zweiten Person auch die erste noch einmal davon.
    const before = await this.findLeaders(hauskreisId, meetingId);
    const known = new Set(before.map((person) => person.id));

    // Nur die Neuen: wer schon eingetragen war und inzwischen abgesagt hat,
    // darf nicht dafür sorgen, dass sich die Liste gar nicht mehr ändern lässt.
    await this.availability.assertAvailable(
      hauskreisId,
      meetingId,
      dto.personIds.filter((personId) => !known.has(personId)),
    );

    // Ob dieser Abend noch bevorsteht — entscheidet unten, ob eine verwaiste
    // Auswahl aufgeräumt wird oder als Protokoll stehen bleibt.
    const past = await this.clock.isPast(hauskreisId, meeting);

    await this.prisma.$transaction(async (tx) => {
      await tx.meetingSongLeader.deleteMany({
        where: { meetingId, personId: { notIn: dto.personIds } },
      });

      await tx.meetingSongLeader.createMany({
        data: dto.personIds.map((personId) => ({ meetingId, personId })),
        skipDuplicates: true,
      });

      // Bleibt niemand übrig, darf die getroffene Auswahl auch niemand mehr
      // ändern — sie geht deshalb mit. In derselben Transaktion, damit es nie
      // einen Augenblick gibt, in dem beides zugleich gilt.
      if (!past) await clearSongSelectionIfUnled(tx, [meetingId]);

      // Die Musik-Zuteilung steht mit in der Antwort des Termins. Die Lieder
      // selbst nicht — die kommen von `…/meetings/:id/songs` mit eigenem ETag
      // und brauchen diesen Griff deshalb nicht.
      await touchMeeting(tx, meetingId);
    });

    const dazu = dto.personIds.filter((personId) => !known.has(personId));

    // Wer die Lieder übt, kommt auch. Anders als die Nachricht gilt das auch
    // für die Person, die sich selbst einträgt.
    await this.roleAttendance.confirm(meetingId, dazu);

    await this.roleAssignments.announce(
      meetingId,
      AssignmentRole.SONG,
      dazu,
      actorPersonId,
    );

    return this.findLeaders(hauskreisId, meetingId);
  }

  /**
   * Antwortet mit dem Zeitraum, weil `setLeaders` wissen muss, ob der Abend
   * vorbei ist — und „vorbei" heißt bei einer Freizeit: nach ihrem letzten Tag.
   */
  private async assertMeetingBelongsToHauskreis(
    hauskreisId: string,
    meetingId: string,
  ): Promise<{ date: Date; endDate: Date | null; status: MeetingStatus }> {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, hauskreisId },
      select: { date: true, endDate: true, status: true },
    });

    if (!meeting) {
      throw new NotFoundException(`Meeting ${meetingId} not found`);
    }

    return meeting;
  }

  private async assertPeopleBelongToHauskreis(
    hauskreisId: string,
    personIds: string[],
  ): Promise<void> {
    if (personIds.length === 0) {
      return;
    }

    const found = await this.prisma.person.count({
      where: { id: { in: personIds }, hauskreisId },
    });

    if (found !== new Set(personIds).size) {
      throw new BadRequestException(
        'At least one person does not belong to this Hauskreis',
      );
    }
  }
}
