import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationService,
  type SendResult,
} from '../notification/notification.service';
import { appPath } from '../notification/app-paths';
import {
  BirthdayGiftMode,
  NotificationType,
} from '../../generated/prisma/enums';
import { ANGEKOMMEN } from '../person/angekommen';
import { GroupClockService } from '../meeting/group-clock.service';
import { CRON_TIME_ZONE } from '../common/time/local-evening';
import { currentDay } from '../meeting/meeting-schedule';
import { daysUntil, nextBirthday } from './birthday-dates';
import { repairPairings, rotate, type Duties } from './rotation';
import { DEFAULT_GIFT_CONFIG, type GiftSettings } from './birthday-settings';

export interface PlanResult {
  /** Neu angelegte Geburtstags-Runden. */
  created: number;
  /** Runden, deren Zuständigkeit sich geändert hat. */
  reassigned: number;
  notified: number;
}

/**
 * Hält die Geburtstage und ihre Zuständigkeiten aktuell.
 *
 * **Was hier gerechnet und was gespeichert wird.** Die Zuteilung *entsteht* aus
 * den Geburtstagen (`rotation.ts`), sie *steht* aber in `birthday_occasion`.
 * Beides zusammen ist der Punkt: Rechnen allein könnte die Vergangenheit nicht
 * festhalten und würde jede nahe Zuteilung noch umwerfen; Speichern allein
 * würde nie nachziehen, wenn jemand seinen Geburtstag nachträgt.
 *
 * **Genau eine offene Runde je Person.** Nämlich der nächste Geburtstag. Ist er
 * vorbei, bleibt die Zeile als Geschichte stehen und der Lauf legt die des
 * nächsten Jahres an. Deshalb rutscht jemand, der gestern Geburtstag hatte, in
 * der Liste ans Ende — er kommt erst in einem Jahr wieder dran.
 *
 * **Was eingefroren ist, wird nicht angefasst.** Weder von einem Moduswechsel
 * noch von einem neu eingetragenen Geburtstag. Wer eine Woche vorher erfährt,
 * dass er doch nicht zuständig ist, hat vielleicht schon etwas besorgt — und
 * wer den Preis eingetragen hat, hat es sicher.
 *
 * Täglich statt zum Geburtstag, und es wird geprüft statt angenommen — dieselbe
 * Überlegung wie beim Gebetsbuddy-Generator: Ein Lauf, der genau am Stichtag
 * fällig wäre, übersprünge ihn stillschweigend, wenn der Server an dem Morgen
 * aus war.
 */
@Injectable()
export class BirthdayPlannerService {
  private readonly logger = new Logger(BirthdayPlannerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly clock: GroupClockService,
  ) {}

  // Eine Viertelstunde nach den Gebetsbuddys. Nicht, weil sie einander stören
  // würden, sondern damit in den Logs erkennbar bleibt, welcher Lauf welche
  // Zeilen geschrieben hat.
  @Cron('15 4 * * *', {
    name: 'plan-birthdays',
    timeZone: CRON_TIME_ZONE,
  })
  async handleCron(): Promise<void> {
    const hauskreise = await this.prisma.hauskreis.findMany({
      select: { id: true },
    });

    let created = 0;
    let reassigned = 0;

    for (const hauskreis of hauskreise) {
      // Ein Hauskreis, in dem etwas schiefgeht, darf die anderen nicht
      // mitnehmen — der Lauf ist eine Schleife, kein Alles-oder-nichts.
      try {
        const result = await this.plan(hauskreis.id);
        created += result.created;
        reassigned += result.reassigned;
      } catch (error) {
        this.logger.error(
          `Geburtstage in Hauskreis ${hauskreis.id} ließen sich nicht planen`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    if (created > 0)
      this.logger.log(`${created} Geburtstags-Runde(n) angelegt`);
    if (reassigned > 0) {
      this.logger.log(`${reassigned} Zuständigkeit(en) neu gesetzt`);
    }
  }

  /**
   * Legt fehlende Runden an und setzt die Zuständigkeiten neu.
   *
   * Der einzige Schreibweg. Aufgerufen wird er vom nächtlichen Lauf und von
   * allem, was die Grundlage ändert: ein eingetragener Geburtstag, ein Zu- oder
   * Abgang, eine andere Einstellung, eine geänderte feste Zuteilung.
   */
  async plan(hauskreisId: string, now?: Date): Promise<PlanResult> {
    const zone = await this.clock.zoneOf(hauskreisId);
    const today = currentDay(zone, now);
    const settings = await this.settings(hauskreisId);

    const people = await this.prisma.person.findMany({
      where: { hauskreisId, ...ANGEKOMMEN, birthdate: { not: null } },
      select: { id: true, name: true, birthdate: true },
      orderBy: { id: 'asc' },
    });

    const wanted = new Map(
      people.map((person) => [
        person.id,
        nextBirthday(person.birthdate!, today),
      ]),
    );

    const created = await this.materialise(hauskreisId, wanted, today);
    const duties = await this.duties(hauskreisId, settings, people);
    const { reassigned, notified } = await this.assign(
      hauskreisId,
      duties,
      settings,
      today,
    );

    return { created, reassigned, notified };
  }

  /**
   * Sagt Bescheid, dass jemand nicht mehr dabei ist — **bevor** die Zeile geht.
   *
   * Danach ginge es nicht mehr: Der Geburtstag verschwindet mit der Person
   * (`onDelete: Cascade`), und mit ihm die Auskunft, wer für ihn zuständig war.
   * Der Nachplanungslauf sähe hinterher nur noch eine Zuteilung, die es nie
   * gegeben hat.
   *
   * Wer danach jemand anderen bekommt, erfährt das aus dem normalen Lauf. Wer
   * niemanden mehr bekommt, weiß es aus dieser Nachricht.
   */
  async announceDeparture(
    hauskreisId: string,
    personId: string,
  ): Promise<void> {
    const zone = await this.clock.zoneOf(hauskreisId);
    const today = currentDay(zone);

    const open = await this.prisma.birthdayOccasion.findMany({
      where: {
        hauskreisId,
        personId,
        occursOn: { gte: today },
        responsiblePersonId: { not: null },
      },
      select: {
        id: true,
        responsiblePersonId: true,
        person: { select: { name: true } },
      },
    });

    await Promise.all(
      open.map((occasion) =>
        this.notifications.notify({
          personId: occasion.responsiblePersonId!,
          type: NotificationType.BIRTHDAY_GIFT_ASSIGNED,
          relatedOccasionId: occasion.id,
          payload: {
            title: 'Kein Geschenk mehr nötig',
            body: `${occasion.person.name} ist nicht mehr im Hauskreis — für den Geburtstag musst du nichts mehr besorgen.`,
            url: appPath.birthdays(),
          },
        }),
      ),
    );
  }

  /** Die Einstellungen, **ohne** eine Zeile anzulegen — wie `getRhythm`. */
  private async settings(hauskreisId: string): Promise<GiftSettings> {
    const config = await this.prisma.birthdayGiftConfig.findUnique({
      where: { hauskreisId },
      select: { enabled: true, mode: true, freezeDays: true },
    });

    return config ?? DEFAULT_GIFT_CONFIG;
  }

  /**
   * Sorgt dafür, dass jede Person genau eine offene Runde hat — ihre nächste.
   *
   * Vergangene Runden bleiben unangetastet: Sie **sind** die Geschichte.
   */
  private async materialise(
    hauskreisId: string,
    wanted: ReadonlyMap<string, Date>,
    today: Date,
  ): Promise<number> {
    const open = await this.prisma.birthdayOccasion.findMany({
      where: { hauskreisId, occursOn: { gte: today } },
      select: {
        id: true,
        personId: true,
        occursOn: true,
        priceCents: true,
        selectedGiftIdeaId: true,
      },
    });

    const stale = open.filter((occasion) => {
      const target = wanted.get(occasion.personId);
      if (target && target.getTime() === occasion.occursOn.getTime()) {
        return false;
      }

      // Steht schon eine Entscheidung oder ein Preis dran, bleibt die Zeile —
      // auch wenn das Datum nicht mehr stimmt. Jemand hat etwas besorgt, und
      // das stillschweigend wegzuräumen wäre die schlechtere Überraschung.
      return (
        occasion.priceCents === null && occasion.selectedGiftIdeaId === null
      );
    });

    if (stale.length > 0) {
      await this.prisma.birthdayOccasion.deleteMany({
        where: { id: { in: stale.map((occasion) => occasion.id) } },
      });
    }

    const alive = new Set(
      open
        .filter((occasion) => !stale.includes(occasion))
        .map(
          (occasion) => `${occasion.personId}@${occasion.occursOn.getTime()}`,
        ),
    );

    const missing = [...wanted].filter(
      ([personId, occursOn]) => !alive.has(`${personId}@${occursOn.getTime()}`),
    );

    if (missing.length === 0) return 0;

    const result = await this.prisma.birthdayOccasion.createMany({
      data: missing.map(([personId, occursOn]) => ({
        hauskreisId,
        personId,
        occursOn,
      })),
      // Zwei Läufe kurz hintereinander sollen nicht am Unique-Index scheitern.
      skipDuplicates: true,
    });

    return result.count;
  }

  /** Wer für wen zuständig sein soll — nach Modus, und bei `MANUAL` repariert. */
  private async duties(
    hauskreisId: string,
    settings: GiftSettings,
    people: { id: string; name: string; birthdate: Date | null }[],
  ): Promise<Duties> {
    // Ausgeschaltet heißt: niemand ist zuständig. Nicht „die alte Zuteilung
    // bleibt stehen" — dann stünde in der App eine Rolle, die niemand mehr
    // pflegt.
    if (!settings.enabled) return new Map();

    if (settings.mode === BirthdayGiftMode.ROTATING)
      return rotate(giftable(people));

    const stored = await this.prisma.birthdayGiftPairing.findMany({
      where: { hauskreisId },
      select: { birthdayPersonId: true, responsiblePersonId: true },
    });

    // **Der Wechsel auf „fest" hält fest, was gilt** — er würfelt nicht neu.
    // Beim ersten Lauf im neuen Modus steht noch keine Zeile da, und ohne
    // diesen Anfang füllte `repairPairings` alle Löcher gleichzeitig: Das
    // Ergebnis wäre eine ausgewogene, aber willkürliche Zuteilung, in der
    // niemand mehr den bekommt, für den er bis eben zuständig war.
    if (stored.length === 0) {
      const seeded = rotate(giftable(people));
      if (seeded.size > 0) await this.storePairings(hauskreisId, seeded, false);

      return seeded;
    }

    const { duties, changed } = repairPairings(
      new Map(
        stored.map((row) => [row.birthdayPersonId, row.responsiblePersonId]),
      ),
      people.map((person) => person.id),
    );

    // Die Reparatur wird **festgeschrieben**, nicht nur benutzt: Sonst
    // rechnete der nächste Lauf sie erneut aus, und ein Admin, der in die
    // Verwaltung schaut, sähe dort die alte, löchrige Zuteilung.
    if (changed) await this.storePairings(hauskreisId, duties, true);

    return duties;
  }

  /**
   * Die feste Zuteilung ablegen.
   *
   * `repaired` sagt, ob der Admin hinsehen sollte. Ein Loch zu stopfen ist eine
   * Entscheidung, die das System für ihn getroffen hat; die Zuteilung beim
   * Moduswechsel zu übernehmen ist keine — dafür einen Hinweis zu setzen hieße,
   * ihn zu etwas aufzufordern, das schon stimmt.
   */
  private async storePairings(
    hauskreisId: string,
    duties: Duties,
    repaired: boolean,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.birthdayGiftPairing.deleteMany({ where: { hauskreisId } }),
      this.prisma.birthdayGiftPairing.createMany({
        data: [...duties].map(([birthdayPersonId, responsiblePersonId]) => ({
          hauskreisId,
          birthdayPersonId,
          responsiblePersonId,
        })),
      }),
      this.prisma.birthdayGiftConfig.updateMany({
        where: { hauskreisId },
        data: { pairingsRepairedAt: repaired ? new Date() : null },
      }),
    ]);
  }

  /** Schreibt die Zuständigkeiten und sagt denen Bescheid, die es betrifft. */
  private async assign(
    hauskreisId: string,
    duties: Duties,
    settings: GiftSettings,
    today: Date,
  ): Promise<{ reassigned: number; notified: number }> {
    const open = await this.prisma.birthdayOccasion.findMany({
      where: { hauskreisId, occursOn: { gte: today } },
      select: {
        id: true,
        personId: true,
        occursOn: true,
        responsiblePersonId: true,
        priceCents: true,
        person: { select: { name: true } },
      },
    });

    const changes = open
      .filter((occasion) => !frozen(occasion, today, settings.freezeDays))
      .map((occasion) => ({
        occasion,
        to: duties.get(occasion.personId) ?? null,
      }))
      .filter(({ occasion, to }) => occasion.responsiblePersonId !== to);

    if (changes.length === 0) return { reassigned: 0, notified: 0 };

    await this.prisma.$transaction(
      changes.map(({ occasion, to }) =>
        this.prisma.birthdayOccasion.update({
          where: { id: occasion.id },
          data: { responsiblePersonId: to, version: { increment: 1 } },
        }),
      ),
    );

    // Die Entdopplung merkt sich (Person, Art, Runde) — und alle drei sind
    // dieselben geblieben. Ohne dieses Aufräumen verschluckte sie jede zweite
    // Nachricht zu derselben Runde, und wer zurück in die Zuständigkeit
    // rutscht, erführe es nie. Derselbe Griff wie bei den Gebetsbuddys.
    await this.prisma.notificationLog.deleteMany({
      where: {
        type: NotificationType.BIRTHDAY_GIFT_ASSIGNED,
        relatedOccasionId: { in: changes.map(({ occasion }) => occasion.id) },
      },
    });

    const results = await Promise.all(
      changes.flatMap(({ occasion, to }) => {
        const sent: Promise<SendResult>[] = [];

        if (occasion.responsiblePersonId) {
          sent.push(
            this.notifications.notify({
              personId: occasion.responsiblePersonId,
              type: NotificationType.BIRTHDAY_GIFT_ASSIGNED,
              relatedOccasionId: occasion.id,
              payload: {
                title: 'Doch nicht du',
                body: `Für den Geburtstag von ${occasion.person.name} ist jetzt jemand anders zuständig.`,
                url: appPath.birthdays(),
              },
            }),
          );
        }

        if (to) {
          sent.push(
            this.notifications.notify({
              personId: to,
              type: NotificationType.BIRTHDAY_GIFT_ASSIGNED,
              relatedOccasionId: occasion.id,
              payload: {
                title: 'Du besorgst ein Geschenk',
                body: `${occasion.person.name} hat am ${formatDate(occasion.occursOn)} Geburtstag — du bist dran.`,
                url: appPath.birthday(occasion.id),
              },
            }),
          );
        }

        return sent;
      }),
    );

    return {
      reassigned: changes.length,
      notified: results.filter((result) => result.skipped === 0).length,
    };
  }
}

/**
 * Ob an dieser Runde nichts mehr geändert werden darf.
 *
 * Zwei Gründe, und der zweite ist der interessantere:
 *
 *   * **Die Frist läuft.** Der Geburtstag ist nah genug, dass eine Umverteilung
 *     jemanden kalt erwischen würde. Vergangene Runden fallen automatisch
 *     hierunter — bei ihnen ist die Zahl negativ.
 *   * **Es ist schon Geld geflossen.** Wer den Preis eingetragen hat, hat das
 *     Geschenk. Dass ihm die Zuständigkeit hinterher abhandenkommt, weil jemand
 *     seinen Geburtstag nachgetragen hat, wäre der schlechteste Fall von allen.
 *
 * **Beides schützt eine Zuständigkeit — es gibt also nichts zu schützen,
 * solange keine da ist.** Ohne diese Zeile war die Frist eine Sperre statt
 * eines Schutzes: Wer die Geschenke einschaltete, während der nächste
 * Geburtstag schon in der Frist lag, bekam für ihn nie jemanden zugeteilt. Der
 * Lauf übersprang die Runde jeden Tag aufs Neue, bis der Tag vorbei war — und
 * genau der eine Geburtstag, um den es ging, blieb als einziger ohne
 * Zuständigen stehen.
 */
/**
 * Nur die, die einen Platz in der Reihe haben.
 *
 * Die Abfrage filtert bereits auf `birthdate: { not: null }`; das Ausrufezeichen
 * steht hier einmal statt an jeder Aufrufstelle.
 */
function giftable(
  people: { id: string; name: string; birthdate: Date | null }[],
) {
  return people.map((person) => ({
    id: person.id,
    name: person.name,
    birthdate: person.birthdate!,
  }));
}

export function frozen(
  occasion: {
    occursOn: Date;
    priceCents: number | null;
    responsiblePersonId: string | null;
  },
  today: Date,
  freezeDays: number,
): boolean {
  if (occasion.responsiblePersonId === null) return false;
  if (occasion.priceCents !== null) return true;
  return daysUntil(occasion.occursOn, today) <= freezeDays;
}

const dateFormat = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

function formatDate(date: Date): string {
  return dateFormat.format(date);
}
