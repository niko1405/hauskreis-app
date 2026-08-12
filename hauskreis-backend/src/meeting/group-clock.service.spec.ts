/**
 * Die Uhr der Gruppe — woher sie ihre Zone nimmt und wann sie sie vergisst.
 */
import { GroupClockService } from './group-clock.service';
import type { PrismaService } from '../prisma/prisma.service';

function setup(timeZone?: string) {
  const findUnique = jest
    .fn()
    .mockResolvedValue(timeZone === undefined ? null : { timeZone });

  const service = new GroupClockService({
    meetingScheduleConfig: { findUnique },
  } as unknown as PrismaService);

  return { service, findUnique };
}

describe('GroupClockService', () => {
  it('nimmt Europe/Berlin, solange nichts eingestellt ist', async () => {
    const { service } = setup();

    await expect(service.zoneOf('hk-1')).resolves.toBe('Europe/Berlin');
  });

  it('nimmt, was in der Konfiguration steht', async () => {
    const { service } = setup('Pacific/Auckland');

    await expect(service.zoneOf('hk-1')).resolves.toBe('Pacific/Auckland');
  });

  /**
   * Ohne den Zwischenspeicher stünde für jeden Datumsvergleich einer
   * Terminliste dieselbe Abfrage in der Leitung.
   */
  it('fragt nur einmal nach', async () => {
    const { service, findUnique } = setup('Europe/Berlin');

    await service.zoneOf('hk-1');
    await service.zoneOf('hk-1');

    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('fragt nach dem Vergessen wieder nach', async () => {
    const { service, findUnique } = setup('Europe/Berlin');

    await service.zoneOf('hk-1');
    service.forget('hk-1');
    await service.zoneOf('hk-1');

    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  /** Zwei Gruppen, zwei Uhren — der Speicher darf sie nicht vermischen. */
  it('hält die Gruppen auseinander', async () => {
    const findUnique = jest
      .fn()
      .mockImplementation(({ where }: { where: { hauskreisId: string } }) =>
        Promise.resolve(
          where.hauskreisId === 'hk-1'
            ? { timeZone: 'Europe/Berlin' }
            : { timeZone: 'America/New_York' },
        ),
      );

    const service = new GroupClockService({
      meetingScheduleConfig: { findUnique },
    } as unknown as PrismaService);

    await expect(service.zoneOf('hk-1')).resolves.toBe('Europe/Berlin');
    await expect(service.zoneOf('hk-2')).resolves.toBe('America/New_York');
  });

  /**
   * Der eigentliche Zweck: um halb eins nachts ist in Berlin schon der neue
   * Tag, in UTC noch der alte.
   */
  it('rechnet den Kalendertag in der Zone der Gruppe', async () => {
    const { service } = setup('Europe/Berlin');
    const halbEins = new Date('2026-08-11T22:30:00.000Z');

    await expect(service.today('hk-1', halbEins)).resolves.toEqual(
      new Date('2026-08-12T00:00:00.000Z'),
    );
    await expect(
      service.isPast('hk-1', new Date('2026-08-11T00:00:00.000Z'), halbEins),
    ).resolves.toBe(true);
  });
});
