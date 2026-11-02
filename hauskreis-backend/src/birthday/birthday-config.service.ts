import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { personRefSelect } from '../common/dto/response';
import { ANGEKOMMEN } from '../person/angekommen';
import { BirthdayGiftMode } from '../../generated/prisma/enums';
import { updateWithVersionCheck } from '../common/http/optimistic-update';
import type { IfMatchCondition } from '../common/http/etag';
import type {
  UpdateBirthdayGiftConfigDto,
  UpdateGiftPairingsDto,
} from './dto/birthday.dto';
import { giftable, inYearOrder, rotate } from './rotation';

/**
 * Ob und wie sich die Gruppe zu Geburtstagen beschenkt.
 *
 * Eine Zeile je Hauskreis, beim ersten Lesen angelegt — dasselbe Muster wie
 * `MeetingScheduleConfig` und `PrayerBuddyCycleConfig`, und aus demselben
 * Grund: Die Einstellung hält fest, **wer** sie zuletzt geändert hat, und das
 * geht in einer Spalte am Hauskreis nicht.
 *
 * Der Planer liest die Werte auf einem zweiten Weg, der **keine** Zeile anlegt
 * (`birthday-settings.ts`). Ein nächtlicher Lauf soll keine Konfiguration
 * erzeugen, nur weil er nachgesehen hat.
 */
@Injectable()
export class BirthdayConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async get(hauskreisId: string) {
    const existing = await this.prisma.birthdayGiftConfig.findUnique({
      where: { hauskreisId },
      select: configSelect,
    });

    if (existing) return existing;

    return this.prisma.birthdayGiftConfig.create({
      data: { hauskreisId },
      select: configSelect,
    });
  }

  async update(
    hauskreisId: string,
    dto: UpdateBirthdayGiftConfigDto,
    personId: string,
    ifMatch?: IfMatchCondition,
  ) {
    // Legt die Zeile an, falls es sie noch nicht gibt — sonst schlüge das
    // erste Speichern mit „gibt es nicht" fehl, obwohl die Verwaltung die
    // Einstellungen gerade angezeigt hat.
    const current = await this.get(hauskreisId);

    return updateWithVersionCheck({
      condition: ifMatch,
      notFoundMessage: 'Diese Einstellungen gibt es nicht',
      update: (versionCondition) =>
        this.prisma.birthdayGiftConfig.updateMany({
          where: { hauskreisId, ...versionCondition },
          data: {
            enabled: dto.enabled,
            mode: dto.mode,
            freezeDays: dto.freezeDays,
            updatedByPersonId: personId,
            version: { increment: 1 },
          },
        }),
      exists: async () => current !== null,
      reload: () =>
        this.prisma.birthdayGiftConfig.findUniqueOrThrow({
          where: { hauskreisId },
          select: configSelect,
        }),
    });
  }

  /**
   * Die Zuteilung, wie sie in der Verwaltung steht — gespeichert und
   * ausgerechnet (`giftPairingListResponseSchema`).
   *
   * Aufgelistet werden **alle** Mitglieder mit Geburtstag, auch die ohne
   * Zuständigen — ein Loch ist genau das, was der Admin hier sehen soll. Wer
   * keinen Geburtstag eingetragen hat, steht nicht dabei: Er hat keinen Platz
   * in der Reihe, und einen Zuständigen für einen Tag zu benennen, den es nicht
   * gibt, wäre eine Zuteilung ins Leere.
   */
  async listPairings(hauskreisId: string) {
    const [people, pairings, config] = await Promise.all([
      this.prisma.person.findMany({
        where: { hauskreisId, ...ANGEKOMMEN, birthdate: { not: null } },
        select: { ...personRefSelect, birthdate: true },
      }),
      this.prisma.birthdayGiftPairing.findMany({
        where: { hauskreisId },
        select: {
          birthdayPersonId: true,
          responsible: { select: personRefSelect },
        },
      }),
      this.get(hauskreisId),
    ]);

    const stored = new Map(
      pairings.map((row) => [row.birthdayPersonId, row.responsible]),
    );
    const refs = new Map(
      people.map((person) => [
        person.id,
        {
          id: person.id,
          name: person.name,
          photoUpdatedAt: person.photoUpdatedAt,
        },
      ]),
    );
    const ordered = inYearOrder(giftable(people));
    const rotation = rotate(ordered);

    const rows = (responsibleOf: (personId: string) => string | undefined) =>
      ordered.map((person) => ({
        birthdayPerson: refs.get(person.id)!,
        birthday: monthDay(person.birthdate),
        responsible: refs.get(responsibleOf(person.id) ?? '') ?? null,
      }));

    return {
      pairings: rows((personId) => stored.get(personId)?.id),
      rotation: rows((personId) => rotation.get(personId)),
      config,
    };
  }

  /**
   * Die feste Zuteilung setzen — als Ganzes, nicht Zeile für Zeile.
   *
   * Eine Zuteilung stimmt nur vollständig: Wer B von A auf C umhängt, muss auch
   * sagen, was aus A wird. Zwei Aufrufe hintereinander hätten dazwischen einen
   * Zustand, den niemand wollte — und den der Planer in der Zwischenzeit
   * ausrollen würde.
   *
   * **Und vollständig heißt: für jeden Geburtstag jemand.** Eine Lücke füllte
   * früher der Planer beim Speichern selbst — der Admin hätte also etwas
   * gespeichert, das er nie gesehen hat. Die Reparatur bleibt nur für den Fall,
   * dass sich hinterher die Gruppe ändert (`repairPairings`), und dort sagt es
   * ein Hinweis in der Verwaltung.
   *
   * Mit dem Speichern verschwindet auch der Hinweis „das System musste hier
   * etwas schließen": Der Admin hat jetzt hingesehen.
   */
  async setPairings(
    hauskreisId: string,
    dto: UpdateGiftPairingsDto,
    personId: string,
  ) {
    const members = await this.prisma.person.findMany({
      where: { hauskreisId, ...ANGEKOMMEN, birthdate: { not: null } },
      select: { id: true },
    });
    const known = new Set(members.map((person) => person.id));

    for (const pairing of dto.pairings) {
      if (
        !known.has(pairing.birthdayPersonId) ||
        !known.has(pairing.responsiblePersonId)
      ) {
        throw new BadRequestException(
          'In der Zuteilung steht jemand, der nicht dabei ist oder keinen Geburtstag eingetragen hat',
        );
      }

      if (pairing.birthdayPersonId === pairing.responsiblePersonId) {
        throw new BadRequestException(
          'Sich selbst etwas zu schenken ist keine Zuteilung',
        );
      }
    }

    const seen = new Set<string>();
    for (const pairing of dto.pairings) {
      if (seen.has(pairing.birthdayPersonId)) {
        throw new BadRequestException(
          'Für einen Geburtstag kann nur eine Person zuständig sein',
        );
      }
      seen.add(pairing.birthdayPersonId);
    }

    // Und die Gegenrichtung: niemand besorgt zwei Geschenke, solange jemand
    // anders keines besorgt. Das ist die Zusage der ganzen Reihe — jede:r ist
    // in einem Jahr genau einmal dran (CLAUDE.md §6.10) —, und sie ließ sich
    // hier aushebeln: Die Prüfung darüber sah nur die linke Spalte. Wer die
    // Zeilen in der Verwaltung durchklickte, konnte eine Person zweimal
    // eintragen, und eine andere blieb ohne Aufgabe.
    const giving = new Set<string>();
    for (const pairing of dto.pairings) {
      if (giving.has(pairing.responsiblePersonId)) {
        throw new BadRequestException(
          'Jede:r besorgt genau ein Geschenk — hier steht jemand zweimal',
        );
      }
      giving.add(pairing.responsiblePersonId);
    }

    // Bei einer einzigen Person mit Geburtstag gibt es niemanden, der sie
    // beschenken könnte — dann ist die leere Zuteilung die vollständige.
    if (known.size >= 2 && seen.size !== known.size) {
      throw new BadRequestException(
        'Für jeden Geburtstag muss jemand eingetragen sein',
      );
    }

    await this.prisma.$transaction([
      this.prisma.birthdayGiftPairing.deleteMany({ where: { hauskreisId } }),
      this.prisma.birthdayGiftPairing.createMany({
        data: dto.pairings.map((pairing) => ({
          hauskreisId,
          ...pairing,
        })),
      }),
      this.prisma.birthdayGiftConfig.updateMany({
        where: { hauskreisId },
        data: {
          mode: BirthdayGiftMode.MANUAL,
          pairingsRepairedAt: null,
          updatedByPersonId: personId,
          version: { increment: 1 },
        },
      }),
    ]);

    return this.listPairings(hauskreisId);
  }
}

/** `MM-DD` — der Tag im Jahr, ohne das Alter. */
function monthDay(birthdate: Date): string {
  const month = String(birthdate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(birthdate.getUTCDate()).padStart(2, '0');
  return `${month}-${day}`;
}

const configSelect = {
  enabled: true,
  mode: true,
  freezeDays: true,
  pairingsRepairedAt: true,
  updatedBy: { select: personRefSelect },
  // Gehört in **jede** Antwort, nicht nur in die zum Schreiben: Aus ihr baut
  // `EtagInterceptor` den ETag, und ohne ihn kann das bedingte Schreiben nie
  // gelingen. Siehe die Begründung am Antwort-Schema.
  version: true,
} as const;
