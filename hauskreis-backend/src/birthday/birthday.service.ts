import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { appPath } from '../notification/app-paths';
import { NotificationType } from '../../generated/prisma/enums';
import { personRefSelect } from '../common/dto/response';
import { ANGEKOMMEN } from '../person/angekommen';
import { GroupClockService } from '../meeting/group-clock.service';
import { currentDay } from '../meeting/meeting-schedule';
import { ageAt, daysUntil } from './birthday-dates';
import { frozen } from './birthday-planner.service';
import { BirthdayConfigService } from './birthday-config.service';
import type { CreateGiftIdeaDto, DecideGiftDto } from './dto/birthday.dto';

/**
 * Wie lange sich ein Geschenk noch nachtragen lässt.
 *
 * Der Preis wird selten am Geburtstag eingetragen — meist erst, wenn die Rechnung
 * da ist und geteilt wird. Sofort nach Mitternacht zuzumachen hieße, genau den
 * Fall auszuschließen, für den das Feld gedacht ist. Zwei Wochen sind lang genug
 * dafür und kurz genug, dass niemand eine Runde von vorletztem Jahr umschreibt.
 */
export const SETTLE_DAYS = 14;

/**
 * Wie viele vergangene eigene Zuständigkeiten der Bildschirm zeigt.
 *
 * „Wen hatte ich in den letzten Runden" ist eine Frage nach ein paar Jahren,
 * nicht nach allen. Wer weiter zurück will, hat keine App dafür — und braucht
 * auch keine.
 */
const PAST_DUTIES = 12;

const occasionSelect = {
  id: true,
  occursOn: true,
  priceCents: true,
  selectedGiftIdeaId: true,
  // Die Kennung **neben** der Beziehung: `frozen` fragt nur, ob überhaupt
  // jemand zuständig ist, und dafür eine ganze Person zu vergleichen wäre
  // umständlicher als die Spalte, die ohnehin dasteht.
  responsiblePersonId: true,
  person: { select: { ...personRefSelect, birthdate: true } },
  responsible: { select: personRefSelect },
  selectedIdea: { select: { id: true, text: true } },
} as const;

type OccasionRow = {
  id: string;
  occursOn: Date;
  priceCents: number | null;
  selectedGiftIdeaId: string | null;
  responsiblePersonId: string | null;
  person: {
    id: string;
    name: string;
    photoUpdatedAt: Date | null;
    birthdate: Date | null;
  };
  responsible: { id: string; name: string; photoUpdatedAt: Date | null } | null;
  selectedIdea: { id: string; text: string } | null;
};

/**
 * Geburtstage, Geschenk-Vorschläge und die Entscheidung darüber.
 *
 * **Die eine Regel, die dieses Modul trägt: Wer Geburtstag hat, sieht nichts.**
 * Nicht „sieht es ausgeblendet", sondern bekommt es nicht geschickt — weder die
 * Vorschläge noch die Auswahl noch den Preis. Eine Überraschung, die nur eine
 * Entwicklerkonsole weit weg ist, ist keine. Deshalb steht die Prüfung hier im
 * Dienst und nicht in der Karte, und deshalb geht sie durch **jede** Antwort:
 * Übersicht, Detail und die Karte in der Terminliste.
 *
 * Die zweite Regel ist die Zuständigkeit: Auswählen und den Preis eintragen
 * darf nur, wer das Geschenk besorgt. Vorschlagen und zustimmen dagegen alle —
 * außer dem Geburtstagskind.
 */
@Injectable()
export class BirthdayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly clock: GroupClockService,
    private readonly config: BirthdayConfigService,
  ) {}

  /** Der ganze Bildschirm: alle Mitglieder, die kommenden Runden, das Eigene. */
  async overview(hauskreisId: string, viewerId: string) {
    const zone = await this.clock.zoneOf(hauskreisId);
    const today = currentDay(zone);
    const config = await this.config.get(hauskreisId);

    const [members, upcoming, myNext, myPast] = await Promise.all([
      this.prisma.person.findMany({
        where: { hauskreisId, ...ANGEKOMMEN },
        select: { ...personRefSelect, birthdate: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.birthdayOccasion.findMany({
        where: { hauskreisId, occursOn: { gte: today } },
        select: occasionSelect,
        orderBy: { occursOn: 'asc' },
      }),
      this.prisma.birthdayOccasion.findFirst({
        where: {
          hauskreisId,
          responsiblePersonId: viewerId,
          occursOn: { gte: today },
        },
        select: occasionSelect,
        orderBy: { occursOn: 'asc' },
      }),
      this.prisma.birthdayOccasion.findMany({
        where: {
          hauskreisId,
          responsiblePersonId: viewerId,
          occursOn: { lt: today },
        },
        select: occasionSelect,
        orderBy: { occursOn: 'desc' },
        take: PAST_DUTIES,
      }),
    ]);

    const shape = (row: OccasionRow) =>
      this.shapeOccasion(row, viewerId, today, config.freezeDays);

    return {
      members: members.map((person) => ({
        person: {
          id: person.id,
          name: person.name,
          photoUpdatedAt: person.photoUpdatedAt,
        },
        birthdate: person.birthdate,
      })),
      upcoming: upcoming.map(shape),
      myNext: myNext ? shape(myNext) : null,
      myPast: myPast.map(shape),
      config,
    };
  }

  /**
   * Die kommenden Geburtstage in einem Zeitraum — für die Terminliste.
   *
   * Dieselbe Form wie in der Übersicht, damit die Karte an beiden Orten
   * dieselbe sein kann.
   */
  async between(hauskreisId: string, viewerId: string, from: Date, to: Date) {
    const config = await this.config.get(hauskreisId);
    const zone = await this.clock.zoneOf(hauskreisId);
    const today = currentDay(zone);

    const rows = await this.prisma.birthdayOccasion.findMany({
      where: { hauskreisId, occursOn: { gte: from, lte: to } },
      select: occasionSelect,
      orderBy: { occursOn: 'asc' },
    });

    return rows.map((row) =>
      this.shapeOccasion(row, viewerId, today, config.freezeDays),
    );
  }

  /** Ein Geburtstag mit seinen Vorschlägen — oder ohne, wenn er der eigene ist. */
  async detail(hauskreisId: string, id: string, viewerId: string) {
    const zone = await this.clock.zoneOf(hauskreisId);
    const today = currentDay(zone);
    const config = await this.config.get(hauskreisId);
    const occasion = await this.load(hauskreisId, id);

    const shaped = this.shapeOccasion(
      occasion,
      viewerId,
      today,
      config.freezeDays,
    );

    if (shaped.isOwn) {
      // Nichts. Kein leeres Array, das man auffüllen könnte, kein `canPropose`
      // mit einer Begründung — die Antwort trägt schlicht keine Vorschläge.
      return { ...shaped, ideas: null, canPropose: false, canDecide: false };
    }

    const settling = daysUntil(occasion.occursOn, today) >= -SETTLE_DAYS;

    return {
      ...shaped,
      ideas: await this.ideasFor(hauskreisId, occasion.person.id, viewerId),
      canPropose: settling,
      canDecide: settling && occasion.responsible?.id === viewerId,
    };
  }

  /** Einen Vorschlag machen. Darf jede:r außer dem Geburtstagskind. */
  async proposeIdea(
    hauskreisId: string,
    id: string,
    dto: CreateGiftIdeaDto,
    viewerId: string,
  ) {
    const occasion = await this.load(hauskreisId, id);
    this.assertNotOwn(occasion, viewerId);

    const idea = await this.prisma.giftIdea.create({
      data: {
        hauskreisId,
        forPersonId: occasion.person.id,
        text: dto.text,
        url: dto.url ?? null,
        proposedByPersonId: viewerId,
      },
      select: { id: true },
    });

    // Wer vorschlägt, findet ihn selbst gut — alles andere wäre ein Vorschlag,
    // den man gleich wieder zurücknimmt.
    await this.prisma.giftIdeaVote.create({
      data: { giftIdeaId: idea.id, personId: viewerId },
    });

    return this.ideasFor(hauskreisId, occasion.person.id, viewerId);
  }

  /**
   * Einen Vorschlag zurückziehen. Nur den eigenen — und nur, solange er nicht
   * schon einmal verschenkt wurde: Was einmal unter dem Baum lag, gehört in die
   * Geschichte, sonst schenkt man es nächstes Jahr nochmal.
   */
  async removeIdea(
    hauskreisId: string,
    id: string,
    ideaId: string,
    viewerId: string,
  ) {
    const occasion = await this.load(hauskreisId, id);
    this.assertNotOwn(occasion, viewerId);

    const idea = await this.prisma.giftIdea.findFirst({
      where: { id: ideaId, hauskreisId, forPersonId: occasion.person.id },
      select: { proposedByPersonId: true, chosenAt: { select: { id: true } } },
    });

    if (!idea) throw new NotFoundException('Diesen Vorschlag gibt es nicht');

    if (idea.proposedByPersonId !== viewerId) {
      throw new ForbiddenException(
        'Wegnehmen kann einen Vorschlag nur, wer ihn gemacht hat',
      );
    }

    if (idea.chosenAt.length > 0) {
      throw new BadRequestException(
        'Das wurde schon einmal verschenkt — es bleibt stehen, damit es niemand ein zweites Mal aussucht',
      );
    }

    await this.prisma.giftIdea.delete({ where: { id: ideaId } });

    return this.ideasFor(hauskreisId, occasion.person.id, viewerId);
  }

  /** Zustimmen oder die Zustimmung zurücknehmen. */
  async vote(
    hauskreisId: string,
    id: string,
    ideaId: string,
    viewerId: string,
    approve: boolean,
  ) {
    const occasion = await this.load(hauskreisId, id);
    this.assertNotOwn(occasion, viewerId);

    const idea = await this.prisma.giftIdea.findFirst({
      where: { id: ideaId, hauskreisId, forPersonId: occasion.person.id },
      select: { id: true },
    });

    if (!idea) throw new NotFoundException('Diesen Vorschlag gibt es nicht');

    if (approve) {
      // Zweimal zustimmen ist dasselbe wie einmal — kein Fehler, nur nichts Neues.
      await this.prisma.giftIdeaVote.upsert({
        where: {
          giftIdeaId_personId: { giftIdeaId: ideaId, personId: viewerId },
        },
        create: { giftIdeaId: ideaId, personId: viewerId },
        update: {},
      });
    } else {
      await this.prisma.giftIdeaVote.deleteMany({
        where: { giftIdeaId: ideaId, personId: viewerId },
      });
    }

    return this.ideasFor(hauskreisId, occasion.person.id, viewerId);
  }

  /**
   * Auswählen und den Preis eintragen — beides nur für den Zuständigen.
   *
   * Mit der Auswahl ist die Abstimmung beendet; zurücknehmen geht, solange sich
   * überhaupt noch etwas eintragen lässt. Die anderen erfahren beides — außer
   * dem Geburtstagskind, das hier nie eine Nachricht bekommt.
   */
  async decide(
    hauskreisId: string,
    id: string,
    dto: DecideGiftDto,
    viewerId: string,
  ) {
    const zone = await this.clock.zoneOf(hauskreisId);
    const today = currentDay(zone);
    const occasion = await this.load(hauskreisId, id);

    if (occasion.responsible?.id !== viewerId) {
      throw new ForbiddenException(
        'Aussuchen darf nur, wer das Geschenk besorgt',
      );
    }

    if (daysUntil(occasion.occursOn, today) < -SETTLE_DAYS) {
      throw new BadRequestException(
        'Der Geburtstag ist zu lange her, um daran noch etwas zu ändern',
      );
    }

    if (dto.giftIdeaId) {
      const idea = await this.prisma.giftIdea.findFirst({
        where: {
          id: dto.giftIdeaId,
          hauskreisId,
          forPersonId: occasion.person.id,
        },
        select: { id: true },
      });

      if (!idea) {
        throw new BadRequestException(
          'Dieser Vorschlag gehört nicht zu diesem Geburtstag',
        );
      }
    }

    await this.prisma.birthdayOccasion.update({
      where: { id },
      data: {
        ...(dto.giftIdeaId !== undefined && {
          selectedGiftIdeaId: dto.giftIdeaId,
        }),
        ...(dto.priceCents !== undefined && { priceCents: dto.priceCents }),
        version: { increment: 1 },
      },
    });

    await this.announceDecision(hauskreisId, id, viewerId);

    return this.detail(hauskreisId, id, viewerId);
  }

  /**
   * Die Vorschläge für eine Person — offene und schon verschenkte zusammen.
   *
   * Sortiert nach Zustimmung, denn genau das ist die Frage, die man an eine
   * Liste von Geschenkideen stellt. Bei Gleichstand der ältere zuerst: Wer
   * zuerst da war, steht oben.
   */
  private async ideasFor(
    hauskreisId: string,
    forPersonId: string,
    viewerId: string,
  ) {
    const ideas = await this.prisma.giftIdea.findMany({
      where: { hauskreisId, forPersonId },
      select: {
        id: true,
        text: true,
        url: true,
        createdAt: true,
        proposedBy: { select: personRefSelect },
        votes: { select: { personId: true } },
        chosenAt: {
          select: { occursOn: true },
          orderBy: { occursOn: 'desc' },
          take: 1,
        },
      },
    });

    return ideas
      .map((idea) => ({
        id: idea.id,
        text: idea.text,
        url: idea.url,
        proposedBy: idea.proposedBy,
        votes: idea.votes.length,
        votedByMe: idea.votes.some((vote) => vote.personId === viewerId),
        giftedOn: idea.chosenAt[0]?.occursOn ?? null,
        createdAt: idea.createdAt,
      }))
      .toSorted(
        (a, b) =>
          b.votes - a.votes || a.createdAt.getTime() - b.createdAt.getTime(),
      )
      .map(({ createdAt: _createdAt, ...idea }) => idea);
  }

  /**
   * Die gemeinsame Form — und der Ort, an dem das Geburtstagskind ausgeblendet
   * wird.
   *
   * `isOwn` ist kein Hinweis fürs Frontend, sondern die Bedingung selbst: Ist
   * es der eigene Geburtstag, sind `gift`, `priceCents` und `giftDecided` leer,
   * egal was in der Datenbank steht.
   */
  private shapeOccasion(
    row: OccasionRow,
    viewerId: string,
    today: Date,
    freezeDays: number,
  ) {
    const isOwn = row.person.id === viewerId;

    return {
      id: row.id,
      person: {
        id: row.person.id,
        name: row.person.name,
        photoUpdatedAt: row.person.photoUpdatedAt,
      },
      occursOn: row.occursOn,
      age: row.person.birthdate
        ? ageAt(row.person.birthdate, row.occursOn)
        : null,
      daysUntil: daysUntil(row.occursOn, today),
      responsible: row.responsible,
      frozen: frozen(row, today, freezeDays),
      isOwn,
      giftDecided: isOwn ? false : row.selectedGiftIdeaId !== null,
      gift: isOwn ? null : row.selectedIdea,
      priceCents: isOwn ? null : row.priceCents,
    };
  }

  private async load(hauskreisId: string, id: string): Promise<OccasionRow> {
    // Mandantengrenze und Existenz in einer Abfrage — eine fremde Kennung
    // unterscheidet sich damit nicht von einer erfundenen.
    const occasion = await this.prisma.birthdayOccasion.findFirst({
      where: { id, hauskreisId },
      select: occasionSelect,
    });

    if (!occasion)
      throw new NotFoundException('Diesen Geburtstag gibt es nicht');

    return occasion;
  }

  private assertNotOwn(occasion: OccasionRow, viewerId: string): void {
    if (occasion.person.id === viewerId) {
      throw new ForbiddenException(
        'Das ist dein eigener Geburtstag — lass dich überraschen',
      );
    }
  }

  /** Sagt allen Bescheid, die es angeht — und nur denen. */
  private async announceDecision(
    hauskreisId: string,
    id: string,
    actorId: string,
  ): Promise<void> {
    const occasion = await this.prisma.birthdayOccasion.findUniqueOrThrow({
      where: { id },
      select: {
        personId: true,
        priceCents: true,
        person: { select: { name: true } },
        selectedIdea: { select: { text: true } },
      },
    });

    const audience = await this.prisma.person.findMany({
      where: {
        hauskreisId,
        ...ANGEKOMMEN,
        // Das Geburtstagskind nicht, und wer die Entscheidung getroffen hat,
        // muss sie sich nicht selbst mitteilen lassen.
        id: { notIn: [occasion.personId, actorId] },
      },
      select: { id: true },
    });

    // Erst aufräumen, dann melden. Die Entdopplung merkt sich (Person, Art,
    // Runde), und alle drei bleiben gleich — ohne diesen Griff käme die
    // Auswahl an und der Preis nie. Derselbe Fall wie beim Planer.
    await this.prisma.notificationLog.deleteMany({
      where: {
        type: NotificationType.BIRTHDAY_GIFT_DECIDED,
        relatedOccasionId: id,
      },
    });

    const what = occasion.selectedIdea
      ? `Es wird: ${occasion.selectedIdea.text}.`
      : 'Die Auswahl steht wieder offen.';
    const price =
      occasion.priceCents === null
        ? ''
        : ` Kosten: ${euros(occasion.priceCents)}.`;

    await Promise.all(
      audience.map((person) =>
        this.notifications.notify({
          personId: person.id,
          type: NotificationType.BIRTHDAY_GIFT_DECIDED,
          relatedOccasionId: id,
          payload: {
            title: `Geschenk für ${occasion.person.name}`,
            body: `${what}${price}`,
            url: appPath.birthday(id),
          },
        }),
      ),
    );
  }
}

const euroFormat = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

function euros(cents: number): string {
  return euroFormat.format(cents / 100);
}
