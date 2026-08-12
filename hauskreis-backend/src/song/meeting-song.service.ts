import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { personRefSelect } from '../common/dto/response';
import { PrismaService } from '../prisma/prisma.service';
import { RoleAssignmentNotifier } from '../notification/role-assignment-notifier.service';
import { AssignmentRole } from '../../generated/prisma/enums';
import { AvailabilityService } from '../role-suggestion/availability.service';
import { EditRightsService } from '../meeting/edit-rights.service';
import { touchMeeting } from '../meeting/meeting-version';
import { SongService } from './song.service';
import type {
  AddMeetingSongDto,
  SetSongLeadersDto,
  UpdateMeetingSongDto,
} from './dto/song.dto';

const meetingSongSelect = {
  id: true,
  isSelected: true,
  createdAt: true,
  song: {
    select: { id: true, title: true, artist: true, lyricsUrl: true },
  },
  suggestedBy: { select: personRefSelect },
} as const;

@Injectable()
export class MeetingSongService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly songs: SongService,
    private readonly roleAssignments: RoleAssignmentNotifier,
    private readonly availability: AvailabilityService,
    private readonly editRights: EditRightsService,
  ) {}

  async findAll(hauskreisId: string, meetingId: string) {
    await this.assertMeetingBelongsToHauskreis(hauskreisId, meetingId);

    return this.prisma.meetingSong.findMany({
      where: { meetingId },
      select: meetingSongSelect,
      // Picked ones first, then in the order they were suggested.
      orderBy: [{ isSelected: 'desc' }, { createdAt: 'asc' }],
    });
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
      return existing;
    }

    return this.prisma.meetingSong.create({
      data: { meetingId, songId, suggestedByPersonId },
      select: meetingSongSelect,
    });
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

    const { count } = await this.prisma.meetingSong.updateMany({
      where: { id, meetingId },
      data: { isSelected: dto.isSelected },
    });

    if (count === 0) {
      throw new NotFoundException(`Song entry ${id} not found on this meeting`);
    }

    return this.prisma.meetingSong.findUniqueOrThrow({
      where: { id },
      select: meetingSongSelect,
    });
  }

  async remove(hauskreisId: string, meetingId: string, id: string) {
    await this.assertMeetingBelongsToHauskreis(hauskreisId, meetingId);

    // The song itself stays in the database — it was suggested once and may be
    // wanted again.
    const { count } = await this.prisma.meetingSong.deleteMany({
      where: { id, meetingId },
    });

    if (count === 0) {
      throw new NotFoundException(`Song entry ${id} not found on this meeting`);
    }
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
    await this.assertMeetingBelongsToHauskreis(hauskreisId, meetingId);
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

    await this.prisma.$transaction(async (tx) => {
      await tx.meetingSongLeader.deleteMany({
        where: { meetingId, personId: { notIn: dto.personIds } },
      });

      await tx.meetingSongLeader.createMany({
        data: dto.personIds.map((personId) => ({ meetingId, personId })),
        skipDuplicates: true,
      });

      // Die Musik-Zuteilung steht mit in der Antwort des Termins. Die Lieder
      // selbst nicht — die kommen von `…/meetings/:id/songs` mit eigenem ETag
      // und brauchen diesen Griff deshalb nicht.
      await touchMeeting(tx, meetingId);
    });

    await this.roleAssignments.announce(
      meetingId,
      AssignmentRole.SONG,
      dto.personIds.filter((personId) => !known.has(personId)),
      actorPersonId,
    );

    return this.findLeaders(hauskreisId, meetingId);
  }

  private async assertMeetingBelongsToHauskreis(
    hauskreisId: string,
    meetingId: string,
  ): Promise<void> {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id: meetingId, hauskreisId },
      select: { id: true },
    });

    if (!meeting) {
      throw new NotFoundException(`Meeting ${meetingId} not found`);
    }
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
