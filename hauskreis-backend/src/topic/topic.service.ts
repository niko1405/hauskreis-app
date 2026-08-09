import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { updateWithVersionCheck } from '../common/http/optimistic-update';
import { toPage } from '../common/http/pagination';
import type { IfMatchCondition } from '../common/http/etag';
import {
  membershipOf,
  shapeTopic,
  topicInclude,
  topicScopeWhere,
  type Viewer,
} from './topic-shape';
import { mayDeleteTopic, mayEditTopic } from './topic-visibility';
import type { ListTopicsQueryDto, UpdateTopicDto } from './dto/topic.dto';

/**
 * Themen lesen, benennen und wegräumen.
 *
 * Angelegt werden sie hier nicht — das passiert beim Wählen an einem Abend
 * (`TopicSessionService`). Ein Thema ohne Anlass wäre ein leerer Datensatz, und
 * genau davon kam das alte Modell nicht los.
 */
@Injectable()
export class TopicService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Die Archivliste.
   *
   * `scope=public` zeigt, was gehalten wurde — die Bedingung steckt als
   * `where`-Fragment in `topicScopeWhere` und nicht in einem Filter danach:
   * sonst müsste die Seitenzahl raten, wie viele Treffer nach dem Aussortieren
   * übrig bleiben.
   */
  async findAll(
    hauskreisId: string,
    query: ListTopicsQueryDto,
    viewer: Viewer,
  ) {
    const createdAt: { gte?: Date; lte?: Date } = {};

    if (query.from) {
      createdAt.gte = query.from;
    }

    if (query.to) {
      // Die Grenze ist ein Tag, die Spalte ein Zeitstempel — ohne das Anheben
      // fiele ein mittags begonnenes Thema aus „bis heute" heraus.
      createdAt.lte = endOfUtcDay(query.to);
    }

    const where = {
      hauskreisId,
      ...topicScopeWhere(query.scope, viewer.personId),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? buildTopicSearch(query.search) : {}),
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.topic.findMany({
        where,
        include: topicInclude,
        // Neueste zuerst: so liest sich sowohl das Archiv als auch „was läuft
        // gerade".
        orderBy: { createdAt: 'desc' },
        take: query.take,
        skip: query.skip,
      }),
      this.prisma.topic.count({ where }),
    ]);

    return toPage(
      items.map((topic) => shapeTopic(topic, viewer)),
      total,
      query,
    );
  }

  /**
   * Ein Thema samt seiner Einheiten.
   *
   * Ohne Sichtbarkeitsprüfung auf dem Thema selbst: wer die Id kennt, darf es
   * sehen. Zurückgehalten wird auf der Ebene darunter — unfertige Einheiten
   * fallen für Fremde weg, und der Inhalt einer noch nicht gehaltenen bleibt
   * `null` (`shapeTopic`).
   */
  async findOne(hauskreisId: string, id: string, viewer: Viewer) {
    const topic = await this.prisma.topic.findFirst({
      where: { id, hauskreisId },
      include: topicInclude,
    });

    if (!topic) {
      throw new NotFoundException(`Topic ${id} not found`);
    }

    return shapeTopic(topic, viewer);
  }

  /**
   * Titel, Zusammenfassung, Status.
   *
   * Alle drei unterliegen derselben Regel: ändern darf, wer zum Thema gehört.
   * Anders als früher gilt das auch für `status` — „wir sind damit durch" ist
   * eine Aussage über die eigene Arbeit, und seit die nächtliche Übernahme weg
   * ist, stößt sie auch nichts mehr an, das die ganze Gruppe betrifft.
   */
  async update(
    hauskreisId: string,
    id: string,
    dto: UpdateTopicDto,
    viewer: Viewer,
    condition?: IfMatchCondition,
  ) {
    await this.assertMayEdit(hauskreisId, id, viewer);

    return updateWithVersionCheck({
      condition,
      update: (versionConstraint) =>
        this.prisma.topic.updateMany({
          where: { id, hauskreisId, ...versionConstraint },
          data: {
            title: dto.title,
            summaryText: dto.summaryText,
            status: dto.status,
            version: { increment: 1 },
          },
        }),
      exists: () => this.prisma.topic.findFirst({ where: { id, hauskreisId } }),
      reload: () => this.findOne(hauskreisId, id, viewer),
      notFoundMessage: `Topic ${id} not found`,
    });
  }

  /**
   * Löscht ein Thema samt aller Einheiten.
   *
   * Nur der Owner (und Admins) — ein Mitarbeiter darf jeden Text ändern, aber
   * nicht die Arbeit aller wegräumen (Spec 8.2).
   *
   * Hing eine Einheit an einem kommenden Abend, fällt der auf „zugeteilt, aber
   * noch nichts gewählt" zurück. Die Zuteilung ist davon unberührt: sie steht am
   * Termin und hatte mit dem Thema nie etwas zu tun.
   */
  async remove(hauskreisId: string, id: string, viewer: Viewer) {
    const topic = await this.load(hauskreisId, id);

    if (
      !mayDeleteTopic({
        isAdmin: viewer.isAdmin,
        personId: viewer.personId,
        topic: membershipOf(topic),
      })
    ) {
      throw new ForbiddenException('Ein Thema löscht, wem es gehört.');
    }

    await this.prisma.topic.delete({ where: { id } });
  }

  /**
   * Entfernt eine:n Mitarbeiter:in — nur der Owner darf das (Spec 8.3).
   *
   * Die Person verliert das Bearbeitungsrecht am ganzen Thema, ab sofort. Was
   * sie gehalten hat, bleibt stehen: `topic_session_responsible` wird nicht
   * angefasst. „Wer war damals dabei" ist eine Tatsache und keine Berechtigung
   * (Spec 8.5).
   */
  async removeCollaborator(
    hauskreisId: string,
    id: string,
    personId: string,
    viewer: Viewer,
  ) {
    const topic = await this.load(hauskreisId, id);

    if (
      !mayDeleteTopic({
        isAdmin: viewer.isAdmin,
        personId: viewer.personId,
        topic: membershipOf(topic),
      })
    ) {
      throw new ForbiddenException(
        'Mitarbeitende verwaltet, wem das Thema gehört.',
      );
    }

    await this.prisma.topicCollaborator.deleteMany({
      where: { topicId: id, personId },
    });
  }

  private async assertMayEdit(
    hauskreisId: string,
    id: string,
    viewer: Viewer,
  ): Promise<void> {
    const topic = await this.load(hauskreisId, id);

    if (
      !mayEditTopic({
        isAdmin: viewer.isAdmin,
        personId: viewer.personId,
        topic: membershipOf(topic),
      })
    ) {
      throw new ForbiddenException('Das Thema benennt, wer daran arbeitet.');
    }
  }

  private async load(hauskreisId: string, id: string) {
    const topic = await this.prisma.topic.findFirst({
      where: { id, hauskreisId },
      select: {
        id: true,
        title: true,
        status: true,
        ownerPersonId: true,
        collaborators: { select: { personId: true } },
      },
    });

    if (!topic) {
      throw new NotFoundException(`Topic ${id} not found`);
    }

    return topic;
  }
}

/**
 * Die Suche trifft Titel **und** Zusammenfassung.
 *
 * Nur den Titel zu durchsuchen hieß, an einem Thema ohne Titel vorbeizusuchen —
 * und die gibt es reichlich, der Titel ist ja optional.
 */
function buildTopicSearch(search: string) {
  return {
    OR: [
      { title: { contains: search, mode: 'insensitive' as const } },
      { summaryText: { contains: search, mode: 'insensitive' as const } },
    ],
  };
}

/** 23:59:59.999 UTC, damit ein einschließendes `to` den ganzen Tag abdeckt. */
function endOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}
