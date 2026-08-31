import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { personRefSelect } from '../common/dto/response';
import { updateWithVersionCheck } from '../common/http/optimistic-update';
import { PersonRole } from '../../generated/prisma/enums';
import type { HauskreisMembership } from '../auth/auth.types';
import type { IfMatchCondition } from '../common/http/etag';
import type {
  CreateGroupIdeaDto,
  UpdateGroupIdeaDto,
} from './dto/group-idea.dto';

const ideaInclude = {
  createdBy: { select: personRefSelect },
  doneBy: { select: personRefSelect },
} as const;

/**
 * Ideen der Gruppe — „lasst uns mal grillen".
 *
 * Eine Liste mit Haken und sonst nichts. Kein Zustimmen, keine Kommentare: Ein
 * Kommentarfaden wäre ein zweiter Chat neben WhatsApp, und gegen den ist diese
 * App gebaut. Was besprochen werden muss, wird am Abend besprochen.
 *
 * Anlegen und abhaken darf **jede:r**. Eine Idee ist keine Zuteilung, und wer
 * beim Grillen dabei war, darf sagen, dass es stattgefunden hat — auch wenn
 * jemand anders sie aufgeschrieben hat.
 */
@Injectable()
export class GroupIdeaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Offene zuerst, erledigte darunter.
   *
   * Die Sortierung steht hier und nicht in der Oberfläche: Sie ist Teil der
   * Antwort auf „was steht an", und zwei Listen daraus zu machen hieße, dieselbe
   * Abfrage zweimal zu stellen.
   *
   * Innerhalb der offenen die neuesten zuerst — eine frische Idee ist die, über
   * die gerade gesprochen wird. Bei den erledigten das zuletzt Abgehakte oben.
   */
  findAll(hauskreisId: string) {
    return this.prisma.groupIdea.findMany({
      where: { hauskreisId },
      // `desc` mit `nulls: 'first'` erledigt beides in einer Spalte: Offene
      // (ohne Zeitpunkt) stehen oben, und darunter das zuletzt Abgehakte
      // zuerst. Mit `asc` stünde unten das älteste Erledigte — die Zeile, die
      // am wenigsten jemanden interessiert.
      orderBy: [
        { doneAt: { sort: 'desc', nulls: 'first' } },
        { createdAt: 'desc' },
      ],
      include: ideaInclude,
    });
  }

  create(
    hauskreisId: string,
    dto: CreateGroupIdeaDto,
    membership: HauskreisMembership,
  ) {
    return this.prisma.groupIdea.create({
      data: {
        hauskreisId,
        title: dto.title,
        note: dto.note ?? null,
        createdByPersonId: membership.id,
      },
      include: ideaInclude,
    });
  }

  /**
   * `done` ist der Schalter, `doneAt`/`doneBy` sind seine Folge.
   *
   * Ein erneutes `done: true` auf eine schon erledigte Idee lässt den
   * ursprünglichen Zeitpunkt stehen — abgehakt wurde sie, als sie zum ersten
   * Mal abgehakt wurde. Sonst wanderte sie bei jedem Speichern eines Titels
   * nach oben.
   */
  async update(
    hauskreisId: string,
    id: string,
    dto: UpdateGroupIdeaDto,
    membership: HauskreisMembership,
    condition?: IfMatchCondition,
  ) {
    const current = await this.prisma.groupIdea.findFirst({
      where: { id, hauskreisId },
      select: { doneAt: true },
    });

    if (!current) {
      throw new NotFoundException(`Idee ${id} not found`);
    }

    const done =
      dto.done === undefined
        ? {}
        : dto.done
          ? current.doneAt
            ? {}
            : { doneAt: new Date(), doneByPersonId: membership.id }
          : { doneAt: null, doneByPersonId: null };

    return updateWithVersionCheck({
      condition,
      update: (versionConstraint) =>
        this.prisma.groupIdea.updateMany({
          where: { id, hauskreisId, ...versionConstraint },
          data: {
            title: dto.title,
            note: dto.note,
            ...done,
            version: { increment: 1 },
          },
        }),
      exists: () =>
        this.prisma.groupIdea.findFirst({ where: { id, hauskreisId } }),
      reload: () =>
        this.prisma.groupIdea.findUniqueOrThrow({
          where: { id },
          include: ideaInclude,
        }),
      notFoundMessage: `Idee ${id} not found`,
    });
  }

  /**
   * Löschen darf, wer sie aufgeschrieben hat — und ein Admin.
   *
   * Das ist die eine Stelle, an der die Rechte enger sind als beim Rest.
   * Abhaken ist eine Aussage über die Welt („haben wir gemacht"), Löschen eine
   * über die Liste („das wollten wir nie"). Die zweite gehört dem, der den
   * Eintrag gemacht hat; für alle anderen ist der Haken der richtige Weg.
   */
  async remove(
    hauskreisId: string,
    id: string,
    membership: HauskreisMembership,
  ): Promise<void> {
    const idea = await this.prisma.groupIdea.findFirst({
      where: { id, hauskreisId },
      select: { createdByPersonId: true },
    });

    if (!idea) {
      throw new NotFoundException(`Idee ${id} not found`);
    }

    if (
      idea.createdByPersonId !== membership.id &&
      membership.role !== PersonRole.ADMIN
    ) {
      throw new ForbiddenException(
        'Löschen darf nur, wer die Idee aufgeschrieben hat. Hak sie ab, wenn sie erledigt ist.',
      );
    }

    await this.prisma.groupIdea.delete({ where: { id } });
  }
}
