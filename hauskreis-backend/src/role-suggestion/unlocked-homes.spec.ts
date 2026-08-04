import { RoleSuggestionService } from './role-suggestion.service';
// Type-only import keeps Jest from loading the real PrismaClient.
import type { PrismaService } from '../prisma/prisma.service';
import type { AvailabilityService } from './availability.service';

/**
 * The counterpart to the capacity rule in `host-ranking.spec.ts`: that one
 * keeps small homes out while the evening is full, this one lets them back in
 * once enough people have dropped out.
 */
function setup(options: {
  /** `null` means the home has no stated limit. */
  capacities: Array<number | null>;
  activePeople: number;
  declined: number;
}) {
  const locationFindMany = jest.fn().mockResolvedValue(
    options.capacities.map((capacity, index) => ({
      id: `loc-${index}`,
      name: `Wohnung ${index}`,
      hostWeight: 1,
      capacity,
      residents: [{ id: `person-${index}`, name: `Person ${index}` }],
    })),
  );

  const personCount = jest.fn().mockResolvedValue(options.activePeople);
  const attendanceCount = jest.fn().mockResolvedValue(options.declined);

  const service = new RoleSuggestionService(
    {
      location: { findMany: locationFindMany },
      person: { count: personCount },
      meetingAttendance: { count: attendanceCount },
    } as unknown as PrismaService,
    // Wird von diesem Weg nicht gefragt — die Kapazitäts-Einladung sagt nichts
    // darüber, wer der fairste Gastgeber wäre. Trotzdem mitgegeben, damit der
    // Fake dem echten Konstruktor entspricht.
    {
      findDeclined: jest.fn().mockResolvedValue(new Set<string>()),
    } as unknown as AvailabilityService,
  );

  return service;
}

describe('findHomesUnlockedByAbsences', () => {
  it('invites a home that fits only the reduced group', async () => {
    // Nine people, capacity five, four have dropped out.
    const service = setup({
      capacities: [5],
      activePeople: 9,
      declined: 4,
    });

    const unlocked = await service.findHomesUnlockedByAbsences('hk-1', 'm-1');

    expect(unlocked.map((entry) => entry.home.name)).toEqual(['Wohnung 0']);
  });

  it('stays quiet while the home is still too small', async () => {
    const service = setup({
      capacities: [5],
      activePeople: 9,
      declined: 3,
    });

    await expect(
      service.findHomesUnlockedByAbsences('hk-1', 'm-1'),
    ).resolves.toEqual([]);
  });

  it('ignores homes with no stated limit, even when people drop out', async () => {
    // The normal case: space is not an issue anywhere, so there is nothing to
    // unlock and nobody hears about it.
    const service = setup({
      capacities: [null, null, null],
      activePeople: 9,
      declined: 4,
    });

    await expect(
      service.findHomesUnlockedByAbsences('hk-1', 'm-1'),
    ).resolves.toEqual([]);
  });

  it('ignores a home big enough for everyone', async () => {
    // Capacity 12 for nine people was never locked, so it cannot be unlocked —
    // it is simply part of the normal ranking, absences or not.
    const service = setup({
      capacities: [12],
      activePeople: 9,
      declined: 4,
    });

    await expect(
      service.findHomesUnlockedByAbsences('hk-1', 'm-1'),
    ).resolves.toEqual([]);
  });

  it('treats a home that exactly fits the group as never locked', async () => {
    const service = setup({
      capacities: [9],
      activePeople: 9,
      declined: 4,
    });

    await expect(
      service.findHomesUnlockedByAbsences('hk-1', 'm-1'),
    ).resolves.toEqual([]);
  });

  it('says nothing when nobody has dropped out', async () => {
    const service = setup({
      capacities: [5],
      activePeople: 9,
      declined: 0,
    });

    await expect(
      service.findHomesUnlockedByAbsences('hk-1', 'm-1'),
    ).resolves.toEqual([]);
  });

  it('picks out only the homes that changed status', async () => {
    // Two limits, one of which is still too small at five people coming.
    const service = setup({
      capacities: [null, 5, 3, 12],
      activePeople: 9,
      declined: 4,
    });

    const unlocked = await service.findHomesUnlockedByAbsences('hk-1', 'm-1');

    expect(unlocked.map((entry) => entry.home.capacity)).toEqual([5]);
  });
});
