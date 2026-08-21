/**
 * „Doch, ich komme" sticht den Urlaub — auch in den Vorschlägen.
 *
 * Der Fall kam aus der Benutzung: Abwesenheit für den Zeitraum eingetragen,
 * für einen einzelnen Abend daraus wieder zugesagt — und trotzdem aus dem
 * Ranking gefallen. Überall sonst gewinnt die Antwort von Hand (der
 * Abwesenheits-Abgleich fasst eine `SELF`-Zeile nie an); hier wurde der
 * Zeitraum getrennt gefragt und schlug sie.
 *
 * Geprüft über den Dienst, weil genau das Füttern die Stelle war: `exceptOn`
 * hat einen eigenen Test, aber niemand hätte gemerkt, wenn die Zusage nie
 * ankommt.
 */
import { RoleSuggestionService } from './role-suggestion.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AvailabilityService } from './availability.service';
import { withClock } from '../meeting/group-clock.testing';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const ABEND = utc('2026-09-01');
const MEETING = 'm-heute';

/** Mira ist die ganze Woche weg — und hat für diesen Abend trotzdem zugesagt. */
function setup(zugesagt: string[]) {
  const prisma = {
    person: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'anna', name: 'Anna', photoUpdatedAt: null },
        { id: 'mira', name: 'Mira', photoUpdatedAt: null },
      ]),
      count: jest.fn().mockResolvedValue(2),
    },
    meeting: { findMany: jest.fn().mockResolvedValue([]) },
    meetingSongLeader: { findMany: jest.fn().mockResolvedValue([]) },
    meetingAttendance: { count: jest.fn().mockResolvedValue(0) },
    absencePeriod: {
      findMany: jest.fn().mockResolvedValue([
        {
          personId: 'mira',
          startDate: utc('2026-08-28'),
          endDate: utc('2026-09-05'),
        },
      ]),
    },
    location: { findMany: jest.fn().mockResolvedValue([]) },
  };

  return withClock(
    new RoleSuggestionService(
      prisma as unknown as PrismaService,
      {
        findDeclined: jest.fn().mockResolvedValue(new Set<string>()),
        findSelfAttending: jest.fn().mockResolvedValue(new Set(zugesagt)),
      } as unknown as AvailabilityService,
    ),
  );
}

describe('Urlaub und eigene Zusage', () => {
  it('lässt weg, wer in dem Zeitraum verreist ist', async () => {
    const service = setup([]);

    const result = await service.suggestTopicResponsibles('hk-1', ABEND, {
      meetingId: MEETING,
    });

    expect(result.map((entry) => entry.personId)).toEqual(['anna']);
  });

  it('nimmt zurück ins Ranking, wer für den Abend zugesagt hat', async () => {
    const service = setup(['mira']);

    const result = await service.suggestTopicResponsibles('hk-1', ABEND, {
      meetingId: MEETING,
    });

    expect(result.map((entry) => entry.personId).toSorted()).toEqual([
      'anna',
      'mira',
    ]);
  });
});
