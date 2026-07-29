import { ArchiveService } from './archive.service';
// Type-only import keeps Jest from loading the real PrismaClient.
import type { PrismaService } from '../prisma/prisma.service';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function setup(dates: string[], counts = { topics: 3, songs: 20, played: 12 }) {
  const findMany = jest
    .fn()
    .mockResolvedValue(dates.map((date) => ({ date: utc(date) })));

  const count = jest
    .fn()
    .mockResolvedValueOnce(counts.topics)
    .mockResolvedValueOnce(counts.songs)
    .mockResolvedValueOnce(counts.played);

  const service = new ArchiveService({
    meeting: { findMany },
    topic: { count },
    song: { count },
  } as unknown as PrismaService);

  return { service, findMany };
}

describe('ArchiveService.summarise', () => {
  it('counts the evenings per year, newest year first', async () => {
    const { service } = setup([
      '2025-11-04',
      '2026-01-06',
      '2026-02-03',
      '2026-03-03',
    ]);

    const summary = await service.summarise('hk-1');

    expect(summary.years).toEqual([
      { year: 2026, meetings: 3 },
      { year: 2025, meetings: 1 },
    ]);
  });

  it('reports the totals and when the group first met', async () => {
    const { service } = setup(['2025-11-04', '2026-01-06']);

    const summary = await service.summarise('hk-1');

    expect(summary.totals).toEqual({
      meetings: 2,
      topics: 3,
      songs: 20,
      songsPlayed: 12,
    });
    expect(summary.firstMeetingDate).toBe('2025-11-04');
  });

  it('leaves out cancelled evenings and everything still ahead', async () => {
    const { service, findMany } = setup([]);

    await service.summarise('hk-1');

    // An evening that was called off is not part of what the group did, and a
    // future one is not archive material yet.
    const where = findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: 'CANCELLED' });
    expect(where.date.lt).toBeInstanceOf(Date);
  });

  it('copes with a group that has never met', async () => {
    const { service } = setup([], { topics: 0, songs: 0, played: 0 });

    const summary = await service.summarise('hk-1');

    expect(summary.years).toEqual([]);
    expect(summary.firstMeetingDate).toBeNull();
    expect(summary.totals.meetings).toBe(0);
  });
});
