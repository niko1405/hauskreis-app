import { TopicCarryOverService } from './topic-carry-over.service';
// Type-only: keeps Jest from loading the real PrismaClient.
import type { PrismaService } from '../prisma/prisma.service';
import type { TopicService } from './topic.service';
import { MeetingStatus, MeetingType } from '../../generated/prisma/enums';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const NOW = utc('2026-07-27');

function setup(options: { topicId?: string | null } = {}) {
  const findFirst = jest
    .fn()
    .mockResolvedValue({ id: 'meeting-1', topicId: null });
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const findCarryOverTopic = jest
    .fn()
    .mockResolvedValue(
      options.topicId === undefined ? 'topic-1' : options.topicId,
    );

  const service = new TopicCarryOverService(
    {
      meeting: { findFirst, updateMany },
      hauskreis: { findMany: jest.fn().mockResolvedValue([{ id: 'hk-1' }]) },
    } as unknown as PrismaService,
    { findCarryOverTopic } as unknown as TopicService,
  );

  return { service, findFirst, updateMany, findCarryOverTopic };
}

describe('TopicCarryOverService.carryOverFor', () => {
  it('puts the running topic on the next meeting that has a topic slot', async () => {
    const { service, findFirst, updateMany } = setup();

    const result = await service.carryOverFor('hk-1', NOW);

    expect(result).toEqual({ filled: 1 });

    const where = findFirst.mock.calls[0][0].where;
    // Am Baustein, nicht an der Terminart: ein besonderer Termin, für den
    // jemand „Thema" dazugebucht hat, bekommt das laufende Thema auch.
    expect(where.hasTopicSlot).toBe(true);
    expect(where.type).toBeUndefined();
    expect(where.status).toBe(MeetingStatus.PLANNED);
    expect(where.date.gte).toEqual(NOW);
    expect(findFirst.mock.calls[0][0].orderBy).toEqual({ date: 'asc' });

    expect(updateMany.mock.calls[0][0].data.topicId).toBe('topic-1');
  });

  it('stops once the next meeting already has a topic', async () => {
    const { service, findFirst, updateMany } = setup();
    findFirst.mockResolvedValue({ id: 'meeting-1', topicId: 'topic-1' });

    const result = await service.carryOverFor('hk-1', NOW);

    // The lookup deliberately does not filter on `topicId: null`. Skipping
    // ahead to the next topic-less evening would claim one more meeting on
    // every nightly run, and a week later the whole planning window would be
    // taken by a topic that runs two or three evenings.
    expect(findFirst.mock.calls[0][0].where.topicId).toBeUndefined();
    expect(result).toEqual({ filled: 0 });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('is idempotent — a second run the same day changes nothing', async () => {
    const { service, findFirst, updateMany } = setup();

    await service.carryOverFor('hk-1', NOW);
    // After the first run that meeting carries the topic.
    findFirst.mockResolvedValue({ id: 'meeting-1', topicId: 'topic-1' });
    const second = await service.carryOverFor('hk-1', NOW);

    expect(second).toEqual({ filled: 0 });
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no topic is running', async () => {
    const { service, findFirst, updateMany } = setup({ topicId: null });

    const result = await service.carryOverFor('hk-1', NOW);

    expect(result).toEqual({ filled: 0 });
    expect(findFirst).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('does nothing when there is no upcoming standard meeting', async () => {
    const { service, findFirst, updateMany } = setup();
    findFirst.mockResolvedValue(null);

    const result = await service.carryOverFor('hk-1', NOW);

    expect(result).toEqual({ filled: 0 });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('never overwrites a topic set by hand in the meantime', async () => {
    const { service, updateMany } = setup();
    updateMany.mockResolvedValue({ count: 0 });

    const result = await service.carryOverFor('hk-1', NOW);

    // The update is guarded on `topicId: null` too, so a concurrent manual
    // assignment simply wins and nothing is reported as filled.
    expect(updateMany.mock.calls[0][0].where.topicId).toBeNull();
    expect(result).toEqual({ filled: 0 });
  });

  it('bumps the version so an open editor notices', async () => {
    const { service, updateMany } = setup();

    await service.carryOverFor('hk-1', NOW);

    expect(updateMany.mock.calls[0][0].data.version).toEqual({ increment: 1 });
  });
});
