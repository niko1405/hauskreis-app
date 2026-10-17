import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { appPath } from '../notification/app-paths';
import { NotificationType } from '../../generated/prisma/enums';
import { personRefSelect } from '../common/dto/response';
import { updateWithVersionCheck } from '../common/http/optimistic-update';
import { toPage } from '../common/http/pagination';
import { ANGEKOMMEN } from '../person/angekommen';
import { checklistOf, previewOf, toggleCheck } from './note-text';
import {
  mayManageNote,
  mayReadNote,
  visibleNotesWhere,
  type NoteAccess,
} from './note-rules';
import type { Prisma } from '../../generated/prisma/client';
import type { IfMatchCondition } from '../common/http/etag';
import type {
  CheckNoteDto,
  CreateNoteDto,
  ListNotesQueryDto,
  SetNotePeopleDto,
  UpdateNoteDto,
} from './dto/note.dto';

/**
 * `active` mit dabei, obwohl die Antwort es nicht zeigt: Am Ersteller hängt der
 * Notausgang (`mayManageNote`), und an den Eingetragenen, wer noch angezeigt
 * wird — wer gegangen ist, kommt ohnehin nicht mehr herein.
 */
const noteInclude = {
  createdBy: { select: { ...personRefSelect, active: true } },
  updatedBy: { select: personRefSelect },
  members: {
    select: { person: { select: { ...personRefSelect, active: true } } },
    orderBy: { person: { name: 'asc' } },
  },
} as const satisfies Prisma.NoteInclude;

type NoteRow = Prisma.NoteGetPayload<{ include: typeof noteInclude }>;

/** Wie oft ein Haken neu ansetzt, wenn ihm jemand dazwischenschreibt. */
const CHECK_ATTEMPTS = 3;

function accessOf(note: NoteRow): NoteAccess {
  return {
    createdByPersonId: note.createdByPersonId,
    creatorActive: note.createdBy?.active ?? false,
    forEveryone: note.forEveryone,
    memberIds: note.members.map((row) => row.person.id),
  };
}

function ref(person: {
  id: string;
  name: string;
  photoUpdatedAt: Date | null;
}) {
  return {
    id: person.id,
    name: person.name,
    photoUpdatedAt: person.photoUpdatedAt,
  };
}

function shapeNote(note: NoteRow, viewerId: string) {
  return { ...headOf(note, viewerId), body: note.body };
}

/** In der Liste: statt des Texts eine Zeile Vorschau und der Stand der Haken. */
function shapeListItem(note: NoteRow, viewerId: string) {
  return {
    ...headOf(note, viewerId),
    preview: previewOf(note.body),
    checklist: checklistOf(note.body),
  };
}

/** Alles außer dem Text — was Seite und Liste gemeinsam haben. */
function headOf(note: NoteRow, viewerId: string) {
  return {
    id: note.id,
    title: note.title,
    forEveryone: note.forEveryone,
    createdBy: note.createdBy ? ref(note.createdBy) : null,
    updatedBy: note.updatedBy,
    members: note.members
      .filter((row) => row.person.active)
      .map((row) => ({ person: ref(row.person) })),
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    version: note.version,
    mayManage: mayManageNote(accessOf(note), viewerId),
  };
}

function shorten(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Notizen — Texte, an denen mehrere schreiben, ohne dass sie an einem Abend
 * hängen.
 *
 * Thema und Einheit gehören zu Abenden; eine Packliste für die Freizeit oder
 * Gedanken für den nächsten Kurs haben davon nichts. Lesen darf nur, wer dabei
 * ist (`note-rules.ts`), und wer liest, schreibt mit.
 */
@Injectable()
export class NoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  /** Zuletzt Geändertes zuerst — woran gerade geschrieben wird, steht oben. */
  async findAll(
    hauskreisId: string,
    query: ListNotesQueryDto,
    viewerId: string,
  ) {
    const where: Prisma.NoteWhereInput = {
      AND: [
        visibleNotesWhere(hauskreisId, viewerId),
        ...(query.search
          ? [
              {
                OR: [
                  {
                    title: {
                      contains: query.search,
                      mode: 'insensitive' as const,
                    },
                  },
                  {
                    body: {
                      contains: query.search,
                      mode: 'insensitive' as const,
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    };

    const [rows, total] = await Promise.all([
      this.prisma.note.findMany({
        where,
        include: noteInclude,
        orderBy: { updatedAt: 'desc' },
        take: query.take,
        skip: query.skip,
      }),
      this.prisma.note.count({ where }),
    ]);

    return toPage(
      rows.map((row) => shapeListItem(row, viewerId)),
      total,
      query,
    );
  }

  async findOne(hauskreisId: string, id: string, viewerId: string) {
    return shapeNote(await this.load(hauskreisId, id, viewerId), viewerId);
  }

  async create(hauskreisId: string, dto: CreateNoteDto, viewerId: string) {
    const forEveryone = dto.forEveryone ?? false;
    const personIds = await this.validPeople(
      hauskreisId,
      (dto.personIds ?? []).filter((personId) => personId !== viewerId),
    );

    const note = await this.prisma.note.create({
      data: {
        hauskreisId,
        title: dto.title,
        body: dto.body ?? '',
        forEveryone,
        createdByPersonId: viewerId,
        updatedByPersonId: viewerId,
        members: {
          createMany: {
            data: personIds.map((personId) => ({ personId })),
          },
        },
      },
      include: noteInclude,
    });

    await this.announce(hauskreisId, note, viewerId, {
      everyone: forEveryone,
      personIds,
      except: [],
    });

    return shapeNote(note, viewerId);
  }

  /** Titel und Text. Mit `If-Match`: Zwei Fassungen übereinander wären eine zu viel. */
  async update(
    hauskreisId: string,
    id: string,
    dto: UpdateNoteDto,
    viewerId: string,
    condition?: IfMatchCondition,
  ) {
    await this.load(hauskreisId, id, viewerId);

    const note = await updateWithVersionCheck({
      condition,
      update: (versionConstraint) =>
        this.prisma.note.updateMany({
          where: { id, hauskreisId, ...versionConstraint },
          data: {
            title: dto.title,
            body: dto.body,
            updatedByPersonId: viewerId,
            version: { increment: 1 },
          },
        }),
      exists: () => this.prisma.note.findFirst({ where: { id, hauskreisId } }),
      reload: () =>
        this.prisma.note.findUniqueOrThrow({
          where: { id },
          include: noteInclude,
        }),
      notFoundMessage: `Notiz ${id} not found`,
    });

    return shapeNote(note, viewerId);
  }

  /**
   * Wer mitschreibt, als ganze Liste — und „Ganze Gruppe".
   *
   * Die Version steigt mit, obwohl die Notiz-Zeile selbst nur bei `forEveryone`
   * angefasst würde: `members` steht in der Antwort, und ohne neue Version
   * antwortete der Server beim nächsten Laden mit `304`.
   *
   * Eine Nachricht bekommt, wer **neu** hereinkommt — nicht, wer schon dabei
   * war, und nicht, wer die Liste gerade geändert hat.
   */
  async setPeople(
    hauskreisId: string,
    id: string,
    dto: SetNotePeopleDto,
    viewerId: string,
  ) {
    const before = await this.load(hauskreisId, id, viewerId);

    if (!mayManageNote(accessOf(before), viewerId)) {
      throw new ForbiddenException(
        'Wer mitschreibt, entscheidet, wer die Notiz angelegt hat.',
      );
    }

    const personIds = await this.validPeople(
      hauskreisId,
      dto.personIds.filter((personId) => personId !== before.createdByPersonId),
    );

    const note = await this.prisma.$transaction(async (tx) => {
      await tx.noteMember.deleteMany({
        where: { noteId: id, personId: { notIn: personIds } },
      });
      await tx.noteMember.createMany({
        data: personIds.map((personId) => ({ noteId: id, personId })),
        skipDuplicates: true,
      });
      return tx.note.update({
        where: { id },
        data: { forEveryone: dto.forEveryone, version: { increment: 1 } },
        include: noteInclude,
      });
    });

    // Wer vorher schon lesen durfte, hört nichts. War sie schon für alle
    // offen, ist niemand neu.
    if (!before.forEveryone) {
      await this.announce(hauskreisId, note, viewerId, {
        everyone: dto.forEveryone,
        personIds,
        except: [
          ...(before.createdByPersonId ? [before.createdByPersonId] : []),
          ...before.members.map((row) => row.person.id),
        ],
      });
    }

    return shapeNote(note, viewerId);
  }

  /**
   * Einen Checklistenpunkt abhaken — ohne `If-Match`, mit eigener Vorbedingung.
   *
   * Gelesen, umgeschrieben und nur dann geschrieben, wenn die Version noch
   * dieselbe ist. Hat dazwischen jemand anders einen anderen Punkt abgehakt,
   * setzt der Haken auf dem neuen Stand noch einmal an — beide bleiben stehen.
   * Steht an der Stelle inzwischen ein anderer Punkt, gibt es 409: Dann wäre
   * jeder Haken der falsche.
   */
  async check(
    hauskreisId: string,
    id: string,
    dto: CheckNoteDto,
    viewerId: string,
    attemptsLeft = CHECK_ATTEMPTS,
  ): Promise<ReturnType<typeof shapeNote>> {
    const current = await this.load(hauskreisId, id, viewerId);
    const body = toggleCheck(current.body, dto.index, dto.text, dto.done);

    if (body === null) {
      throw new ConflictException(
        'Dieser Punkt hat sich inzwischen geändert. Sieh dir die Liste noch einmal an.',
      );
    }

    const { count } = await this.prisma.note.updateMany({
      where: { id, hauskreisId, version: current.version },
      data: {
        body,
        updatedByPersonId: viewerId,
        version: { increment: 1 },
      },
    });

    if (count === 1) return this.findOne(hauskreisId, id, viewerId);

    // Jemand war dazwischen — auf seinem Stand noch einmal ansetzen.
    if (attemptsLeft > 1) {
      return this.check(hauskreisId, id, dto, viewerId, attemptsLeft - 1);
    }

    throw new ConflictException(
      'Gerade schreiben zu viele gleichzeitig. Versuch es gleich noch einmal.',
    );
  }

  async remove(
    hauskreisId: string,
    id: string,
    viewerId: string,
  ): Promise<void> {
    const note = await this.load(hauskreisId, id, viewerId);

    if (!mayManageNote(accessOf(note), viewerId)) {
      throw new ForbiddenException(
        'Löschen darf nur, wer die Notiz angelegt hat.',
      );
    }

    await this.prisma.note.delete({ where: { id } });
  }

  /**
   * Lädt eine Notiz — oder sagt, dass es sie nicht gibt.
   *
   * Zweimal geprüft: einmal in der Abfrage, einmal mit `mayReadNote`. Die
   * zweite Prüfung ist dieselbe Regel und kostet nichts; sie hält die Abfrage
   * ehrlich, falls jemand dort einmal etwas lockert.
   */
  private async load(
    hauskreisId: string,
    id: string,
    viewerId: string,
  ): Promise<NoteRow> {
    const note = await this.prisma.note.findFirst({
      where: { AND: [{ id }, visibleNotesWhere(hauskreisId, viewerId)] },
      include: noteInclude,
    });

    if (!note || !mayReadNote(accessOf(note), viewerId)) {
      throw new NotFoundException('Diese Notiz gibt es nicht');
    }

    return note;
  }

  /**
   * Nur Leute aus dieser Gruppe, die noch dabei sind.
   *
   * Eine fremde Id ist ein Fehler und kein stilles Weglassen: Wer sie schickt,
   * meint jemanden, und der käme nicht an.
   */
  private async validPeople(
    hauskreisId: string,
    personIds: string[],
  ): Promise<string[]> {
    const unique = [...new Set(personIds)];
    if (unique.length === 0) return [];

    const found = await this.prisma.person.findMany({
      where: { hauskreisId, active: true, id: { in: unique } },
      select: { id: true },
    });

    if (found.length !== unique.length) {
      throw new BadRequestException(
        'Mindestens eine dieser Personen gehört nicht zu diesem Hauskreis.',
      );
    }

    return unique;
  }

  /**
   * „Du kannst mitschreiben" — an alle, die gerade hereingekommen sind.
   *
   * Einmal je Person und Notiz (`relatedKey`): Wer herausgenommen und wieder
   * dazugenommen wird, weiß schon, worum es geht. Änderungen am Text melden
   * nichts — das wäre ein zweiter Chat.
   */
  private async announce(
    hauskreisId: string,
    note: { id: string; title: string },
    actorId: string,
    audience: { everyone: boolean; personIds: string[]; except: string[] },
  ): Promise<void> {
    if (!audience.everyone && audience.personIds.length === 0) return;

    const recipients = await this.prisma.person.findMany({
      where: {
        hauskreisId,
        ...ANGEKOMMEN,
        id: {
          ...(audience.everyone ? {} : { in: audience.personIds }),
          notIn: [actorId, ...audience.except],
        },
      },
      select: { id: true },
    });
    if (recipients.length === 0) return;

    const actor = await this.prisma.person.findUnique({
      where: { id: actorId },
      select: { name: true },
    });
    const name = actor?.name ?? 'Jemand';

    await Promise.all(
      recipients.map((person) =>
        this.notifications.notify({
          personId: person.id,
          type: NotificationType.NOTE_SHARED,
          relatedKey: note.id,
          payload: {
            title: `Notiz: ${shorten(note.title, 60)}`,
            body: audience.everyone
              ? `${name} hat sie für alle geöffnet — du kannst mitschreiben.`
              : `${name} hat dich dazugenommen — du kannst mitschreiben.`,
            url: appPath.note(note.id),
          },
        }),
      ),
    );
  }
}
