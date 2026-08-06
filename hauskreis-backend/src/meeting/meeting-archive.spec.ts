import { MeetingService } from './meeting.service';
// Type-only imports keep Jest from loading the real PrismaClient and web-push.
import type { PrismaService } from '../prisma/prisma.service';
import type { RoleSuggestionService } from '../role-suggestion/role-suggestion.service';
import type { MeetingNotificationService } from './meeting-notification.service';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const TODAY = utc('2026-07-29');

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(TODAY);
});

afterEach(() => {
  jest.useRealTimers();
});

function setup() {
  const findMany = jest.fn().mockResolvedValue([]);

  const service = new MeetingService(
    {
      meeting: { findMany, count: jest.fn().mockResolvedValue(0) },
    } as unknown as PrismaService,
    {} as unknown as RoleSuggestionService,
    {} as unknown as MeetingNotificationService,
  );

  return { service, findMany };
}

const query = { take: 20, skip: 0, scope: 'past' as const };

describe('MeetingService.findAll for the archive', () => {
  it('reads newest first', async () => {
    const { service, findMany } = setup();

    await service.findAll('hk-1', query);

    expect(findMany.mock.calls[0][0].orderBy).toEqual({ date: 'desc' });
    expect(findMany.mock.calls[0][0].where.date).toEqual({ lt: TODAY });
  });

  it('searches every field an evening was written down in', async () => {
    const { service, findMany } = setup();

    await service.findAll('hk-1', { ...query, search: 'Vergebung' });

    // Nobody remembers whether it ended up in the summary, the info line or
    // the topic title, so the search does not ask them to.
    const fields = findMany.mock.calls[0][0].where.OR.map(
      (clause: Record<string, unknown>) => Object.keys(clause)[0],
    );

    expect(fields).toEqual([
      'title',
      'summaryText',
      'actionstepText',
      'infoText',
      'topic',
    ]);
  });

  it('matches case-insensitively', async () => {
    const { service, findMany } = setup();

    await service.findAll('hk-1', { ...query, search: 'vergebung' });

    expect(findMany.mock.calls[0][0].where.OR[0].title).toEqual({
      contains: 'vergebung',
      mode: 'insensitive',
    });
  });

  it('narrows to a date range', async () => {
    const { service, findMany } = setup();

    await service.findAll('hk-1', {
      ...query,
      scope: 'all',
      from: utc('2026-01-01'),
      to: utc('2026-06-30'),
    });

    expect(findMany.mock.calls[0][0].where.date).toEqual({
      gte: utc('2026-01-01'),
      lte: utc('2026-06-30'),
    });
  });

  it('lets the scope keep its upper bound', async () => {
    const { service, findMany } = setup();

    await service.findAll('hk-1', { ...query, to: utc('2027-12-31') });

    // Otherwise "past, bis Ende nächsten Jahres" would start listing evenings
    // that have not happened.
    expect(findMany.mock.calls[0][0].where.date.lt).toEqual(TODAY);
  });

  it('takes the later of scope start and from', async () => {
    const { service, findMany } = setup();

    await service.findAll('hk-1', {
      ...query,
      scope: 'upcoming',
      from: utc('2026-01-01'),
    });

    // A `from` in the past must not drag an upcoming list backwards.
    expect(findMany.mock.calls[0][0].where.date.gte).toEqual(TODAY);
  });

  it('leaves the date filter off entirely when nothing bounds it', async () => {
    const { service, findMany } = setup();

    await service.findAll('hk-1', { ...query, scope: 'all' });

    expect(findMany.mock.calls[0][0].where.date).toBeUndefined();
  });
});
