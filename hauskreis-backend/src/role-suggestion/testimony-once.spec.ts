/**
 * Sein Testimony erzählt man einmal.
 *
 * Damit unterscheidet sich diese Liste von den drei anderen: „Wer war am
 * längsten nicht dran" ist keine Frage — wer dran war, steht gar nicht mehr zur
 * Wahl. Und weil ein Hauskreis älter ist als seine App, gibt es dafür zwei
 * Quellen: die Abende, die sie kennt, und ein Häkchen für alles davor.
 */
import { RoleSuggestionService } from './role-suggestion.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AvailabilityService } from './availability.service';
import { withClock } from '../meeting/group-clock.testing';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const HEUTE = new Date('2026-09-01T09:00:00.000Z');
const ABEND = utc('2026-09-08');
const MEETING = 'm-abend';

beforeAll(() => {
  jest.useFakeTimers().setSystemTime(HEUTE);
});

afterAll(() => {
  jest.useRealTimers();
});

function setup() {
  const personFindMany = jest.fn().mockResolvedValue([
    { id: 'anna', name: 'Anna', photoUpdatedAt: null },
    { id: 'ben', name: 'Ben', photoUpdatedAt: null },
  ]);

  const prisma = {
    person: { findMany: personFindMany, count: jest.fn().mockResolvedValue(2) },
    // Anna hat an genau diesem Abend schon das Thema — die einzige
    // Unterscheidung, die hier noch zählt.
    meeting: {
      findMany: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          'hasTopicSlot' in where
            ? [
                {
                  id: MEETING,
                  date: ABEND,
                  topicResponsibles: [{ personId: 'anna' }],
                  topicSession: null,
                },
              ]
            : [],
        ),
      ),
    },
    meetingSongLeader: { findMany: jest.fn().mockResolvedValue([]) },
    absencePeriod: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const service = withClock(
    new RoleSuggestionService(
      prisma as unknown as PrismaService,
      {
        findDeclined: jest.fn().mockResolvedValue(new Set<string>()),
        findSelfAttending: jest.fn().mockResolvedValue(new Set<string>()),
      } as unknown as AvailabilityService,
    ),
  );

  return { service, personFindMany };
}

describe('suggestTestimony', () => {
  it('fragt nur nach denen, die es noch nicht erzählt haben', async () => {
    const { service, personFindMany } = setup();

    await service.suggestTestimony('hk-1', ABEND, {
      excludeMeetingId: MEETING,
    });

    expect(personFindMany).toHaveBeenCalledWith({
      where: {
        hauskreisId: 'hk-1',
        active: true,
        acceptedAt: { not: null },
        // Das Häkchen für alles vor der App …
        testimonyToldBefore: false,
        // … und die Abende, die sie selbst kennt. Nur die vergangenen: ein
        // kommender ist eine Zuteilung wie jede andere und wirkt als Last.
        testimonies: { none: { date: { lt: utc('2026-09-01') } } },
      },
      select: { id: true, name: true, photoUpdatedAt: true },
    });
  });

  /**
   * Was danach übrig bleibt, sortiert allein die Auslastung: Für alle in dieser
   * Liste sind „zuletzt dran" und „wie oft insgesamt" leer, die Kriterien 2 und
   * 3 laufen also ins Leere.
   */
  it('sortiert nach dem, was an dem Abend sonst noch ansteht', async () => {
    const { service } = setup();

    const result = await service.suggestTestimony('hk-1', ABEND, {
      excludeMeetingId: MEETING,
    });

    expect(result.map((entry) => entry.personId)).toEqual(['ben', 'anna']);
    expect(result[0]!.facts.lastAssignedAt).toBeNull();
    expect(result[0]!.facts.timesAssigned).toBe(0);
  });
});
