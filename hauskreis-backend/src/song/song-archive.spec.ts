import { SongService } from './song.service';
// Type-only import keeps Jest from loading the real PrismaClient.
import type { PrismaService } from '../prisma/prisma.service';
import { withClock } from '../meeting/group-clock.testing';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

type Row = { title: string; playedOn: string[] };

function setup(rows: Row[]) {
  const findMany = jest.fn().mockResolvedValue(
    rows.map((row, index) => ({
      id: `song-${index}`,
      title: row.title,
      artist: null,
      lyricsUrl: null,
      createdAt: utc('2026-01-01'),
      version: 0,
      createdBy: null,
      // Newest first, matching the orderBy the service asks Prisma for.
      pickedIn: row.playedOn
        .toSorted((a, b) => b.localeCompare(a))
        .map((date) => ({ meeting: { date: utc(date) } })),
    })),
  );

  const service = withClock(
    new SongService({
      song: { findMany, count: jest.fn().mockResolvedValue(rows.length) },
    } as unknown as PrismaService),
  );

  return { service, findMany };
}

const query = { take: 20, skip: 0, sort: 'title' as const, playedOnly: false };

describe('SongService.findAll usage facts', () => {
  it('counts how often a song was sung and when it last was', async () => {
    const { service } = setup([
      { title: 'Der Herr segne dich', playedOn: ['2026-05-05', '2026-07-07'] },
    ]);

    const page = await service.findAll('hk-1', query);

    expect(page.items[0]).toMatchObject({
      timesPlayed: 2,
      lastPlayedAt: '2026-07-07',
    });
  });

  it('reports a never-sung song as such rather than as zero-dated', async () => {
    const { service } = setup([{ title: 'Nur vorgeschlagen', playedOn: [] }]);

    const page = await service.findAll('hk-1', query);

    expect(page.items[0]).toMatchObject({
      timesPlayed: 0,
      lastPlayedAt: null,
    });
  });

  it('counts only evenings the song was actually picked for', async () => {
    const { service, findMany } = setup([{ title: 'X', playedOn: [] }]);

    await service.findAll('hk-1', query);

    // A suggestion that did not make the list says something about one
    // person's wish, not about the group's repertoire.
    expect(findMany.mock.calls[0][0].select.pickedIn.where).toMatchObject({
      isSelected: true,
    });
  });

  it('sorts by how often a song was sung', async () => {
    const { service } = setup([
      { title: 'Selten', playedOn: ['2026-07-07'] },
      { title: 'Oft', playedOn: ['2026-01-01', '2026-02-02', '2026-03-03'] },
      { title: 'Nie', playedOn: [] },
    ]);

    const page = await service.findAll('hk-1', { ...query, sort: 'popular' });

    expect(page.items.map((song) => song.title)).toEqual([
      'Oft',
      'Selten',
      'Nie',
    ]);
  });

  it('sorts by when a song was last sung, never-sung last', async () => {
    const { service } = setup([
      { title: 'Alt', playedOn: ['2026-01-01'] },
      { title: 'Nie', playedOn: [] },
      { title: 'Neu', playedOn: ['2026-07-07'] },
    ]);

    const page = await service.findAll('hk-1', { ...query, sort: 'recent' });

    // An empty date is "wir kennen es noch nicht", not "ewig her".
    expect(page.items.map((song) => song.title)).toEqual(['Neu', 'Alt', 'Nie']);
  });

  it('breaks ties on title so the list does not reshuffle', async () => {
    const { service } = setup([
      { title: 'B', playedOn: ['2026-01-01'] },
      { title: 'A', playedOn: ['2026-01-01'] },
    ]);

    const page = await service.findAll('hk-1', { ...query, sort: 'popular' });

    expect(page.items.map((song) => song.title)).toEqual(['A', 'B']);
  });

  it('paginates after sorting, not before', async () => {
    const { service, findMany } = setup([
      { title: 'Selten', playedOn: ['2026-07-07'] },
      { title: 'Oft', playedOn: ['2026-01-01', '2026-02-02'] },
    ]);

    const page = await service.findAll('hk-1', {
      ...query,
      sort: 'popular',
      take: 1,
    });

    // Letting the database page first would slice an alphabetical list and
    // then rank the slice — the second page could outrank the first.
    expect(findMany.mock.calls[0][0].take).toBeUndefined();
    expect(page.items.map((song) => song.title)).toEqual(['Oft']);
    expect(page.hasMore).toBe(true);
  });

  it('pages in the database when sorting by title', async () => {
    const { service, findMany } = setup([{ title: 'A', playedOn: [] }]);

    await service.findAll('hk-1', { ...query, take: 5, skip: 10 });

    // Nothing to reorder, so there is no reason to load the whole table.
    expect(findMany.mock.calls[0][0]).toMatchObject({ take: 5, skip: 10 });
  });

  it('can restrict the list to songs the group actually sang', async () => {
    const { service, findMany } = setup([]);

    await service.findAll('hk-1', { ...query, playedOnly: true });

    expect(findMany.mock.calls[0][0].where.pickedIn).toBeDefined();
  });
});
