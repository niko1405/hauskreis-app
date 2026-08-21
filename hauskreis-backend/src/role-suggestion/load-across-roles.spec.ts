/**
 * Regel 1 gilt in **allen** vier Ranglisten: „wer hat am wenigsten zu tun,
 * über alle Rollen".
 *
 * Sie stand seit jeher so im Kopf von `ranking.ts` und stimmte in keiner
 * einzigen Liste ganz — jede bekam ihre eigene Rolle, Gastgeber und Thema, und
 * je nachdem fehlten Musik oder Testimony. Am schlimmsten beim Gastgeber, der
 * ausschließlich Gastgeber-Dienste sah: Wer an dem Abend das Thema vorbereitet,
 * stand trotzdem ganz oben.
 *
 * Geprüft wird deshalb über den Dienst und nicht über `rankForRole` — die reine
 * Funktion war nie das Problem, das Füttern war es.
 */
import { RoleSuggestionService } from './role-suggestion.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AvailabilityService } from './availability.service';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Der Abend, für den gerade eingeteilt wird. */
const ABEND = utc('2026-09-01');
const MEETING = 'm-heute';

/**
 * Anna hat an genau diesem Abend **alle vier** Rollen. Absichtlich absurd: So
 * zeigt jede der vier Listen für sich, welche Dienste sie überhaupt sieht — es
 * fehlt immer genau der, der gerade eingeteilt wird.
 */
function setup() {
  const meetingFindMany = jest.fn(
    ({ where }: { where: Record<string, unknown> }) => {
      // Der Abend fällt heraus, wo der Aufrufer ihn ausschließt.
      const raus = (where.id as { not?: string } | undefined)?.not === MEETING;
      const abend = raus ? [] : [{ id: MEETING, date: ABEND }];

      if ('hostPersonId' in where) {
        return Promise.resolve(
          abend.map((m) => ({ ...m, hostPersonId: 'anna' })),
        );
      }

      if ('testimonyPersonId' in where) {
        return Promise.resolve(
          abend.map((m) => ({ ...m, testimonyPersonId: 'anna' })),
        );
      }

      if ('hasTopicSlot' in where) {
        return Promise.resolve(
          abend.map((m) => ({
            ...m,
            topicResponsibles: [{ personId: 'anna' }],
            topicSession: null,
          })),
        );
      }

      // `collectHomeUses` — die Wohnungs-Historie, hier leer.
      return Promise.resolve([]);
    },
  );

  const prisma = {
    person: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'anna', name: 'Anna', photoUpdatedAt: null },
        { id: 'ben', name: 'Ben', photoUpdatedAt: null },
      ]),
      count: jest.fn().mockResolvedValue(2),
    },
    meeting: { findMany: meetingFindMany },
    meetingSongLeader: {
      findMany: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        const meeting = where.meeting as Record<string, unknown>;
        const raus =
          (meeting.id as { not?: string } | undefined)?.not === MEETING;
        return Promise.resolve(
          raus ? [] : [{ personId: 'anna', meeting: { date: ABEND } }],
        );
      }),
    },
    meetingAttendance: { count: jest.fn().mockResolvedValue(0) },
    absencePeriod: { findMany: jest.fn().mockResolvedValue([]) },
    location: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'loc-anna',
          name: 'Bei Anna',
          hostWeight: 1,
          capacity: null,
          residents: [{ id: 'anna', name: 'Anna', photoUpdatedAt: null }],
        },
      ]),
    },
  };

  return new RoleSuggestionService(
    prisma as unknown as PrismaService,
    {
      findDeclined: jest.fn().mockResolvedValue(new Set<string>()),
      findSelfAttending: jest.fn().mockResolvedValue(new Set<string>()),
    } as unknown as AvailabilityService,
  );
}

/** Welche Rollen die Liste für Anna an genau diesem Abend gesehen hat. */
function annasDienste(
  suggestions: {
    personId: string;
    facts: { upcomingCommitments: { role: string; thisEvening: boolean }[] };
  }[],
): string[] {
  const anna = suggestions.find((entry) => entry.personId === 'anna');

  return (anna?.facts.upcomingCommitments ?? [])
    .filter((commitment) => commitment.thisEvening)
    .map((commitment) => commitment.role)
    .toSorted();
}

describe('Auslastung über alle vier Rollen', () => {
  it('sieht beim Gastgeber Thema, Musik und Testimony', async () => {
    const service = setup();

    const result = await service.suggestHosts('hk-1', ABEND, {
      excludeMeetingId: MEETING,
    });

    // Nicht `HOST`: Das ist die Zuteilung, die gerade überdacht wird.
    expect(annasDienste(result)).toEqual(['SONG', 'TESTIMONY', 'TOPIC']);
  });

  it('sieht beim Thema Gastgeber, Musik und Testimony', async () => {
    const service = setup();

    const result = await service.suggestTopicResponsibles('hk-1', ABEND, {
      meetingId: MEETING,
    });

    expect(annasDienste(result)).toEqual(['HOST', 'SONG', 'TESTIMONY']);
  });

  it('sieht bei der Musik Gastgeber, Thema und Testimony', async () => {
    const service = setup();

    const result = await service.suggestSongLeaders('hk-1', ABEND, {
      excludeMeetingId: MEETING,
    });

    expect(annasDienste(result)).toEqual(['HOST', 'TESTIMONY', 'TOPIC']);
  });

  it('sieht beim Testimony Gastgeber, Thema und Musik', async () => {
    const service = setup();

    const result = await service.suggestTestimony('hk-1', ABEND, {
      excludeMeetingId: MEETING,
    });

    expect(annasDienste(result)).toEqual(['HOST', 'SONG', 'TOPIC']);
  });

  /**
   * Und die Folge davon, um die es eigentlich geht: Wer an dem Abend nichts zu
   * tun hat, steht vor dem, der schon dreifach eingespannt ist.
   */
  it('stellt den Unbeschäftigten nach vorn', async () => {
    const service = setup();

    const result = await service.suggestTopicResponsibles('hk-1', ABEND, {
      meetingId: MEETING,
    });

    expect(result.map((entry) => entry.personId)).toEqual(['ben', 'anna']);
  });
});
