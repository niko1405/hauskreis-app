/**
 * „Wir fangen jetzt um 19:30 an."
 *
 * Die eine Änderung an einem Abend, die man erfahren muss, ohne die App zu
 * öffnen — und zwar nur beim **nächsten**: eine verschobene Uhrzeit in fünf
 * Wochen liest man, wenn man ohnehin hinschaut.
 */
import { MeetingNotificationService } from './meeting-notification.service';
// Type-only imports keep Jest from loading the real PrismaClient and web-push.
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationService } from '../notification/notification.service';
import type { RoleSuggestionService } from '../role-suggestion/role-suggestion.service';
import { MeetingStatus, NotificationType } from '../../generated/prisma/enums';
import { withClock } from './group-clock.testing';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const today = utc('2026-07-29');
const upcoming = utc('2026-08-04');

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(today);
});

afterEach(() => {
  jest.useRealTimers();
});

function setup(
  options: {
    meeting?: Record<string, unknown> | null;
    /** Welcher Abend als nächster ansteht. */
    nextId?: string | null;
  } = {},
) {
  const findUnique = jest.fn().mockResolvedValue(
    options.meeting === undefined
      ? {
          id: 'meeting-1',
          hauskreisId: 'hk-1',
          date: upcoming,
          title: null,
          status: MeetingStatus.PLANNED,
          startMinutes: 1170,
        }
      : options.meeting,
  );

  const findFirst = jest
    .fn()
    .mockResolvedValue(
      options.nextId === null ? null : { id: options.nextId ?? 'meeting-1' },
    );

  const personFindMany = jest
    .fn()
    .mockResolvedValue([{ id: 'anna' }, { id: 'chris' }]);

  const notify = jest
    .fn()
    .mockResolvedValue({ delivered: 1, pruned: 0, failed: 0, skipped: 0 });

  const logDeleteMany = jest.fn().mockResolvedValue({ count: 0 });

  const service = withClock(
    new MeetingNotificationService(
      {
        meeting: { findUnique, findFirst },
        person: { findMany: personFindMany },
        notificationLog: { deleteMany: logDeleteMany },
      } as unknown as PrismaService,
      { notify } as unknown as NotificationService,
      {} as unknown as RoleSuggestionService,
    ),
  );

  return { service, notify, personFindMany, logDeleteMany };
}

describe('announceTimeChange', () => {
  it('sagt der Gruppe die alte und die neue Zeit', async () => {
    const { service, notify } = setup();

    const sent = await service.announceTimeChange('meeting-1', 1080, 'niko');

    expect(sent).toBe(2);
    expect(notify.mock.calls[0][0]).toMatchObject({
      type: NotificationType.MEETING_TIME_CHANGED,
      relatedMeetingId: 'meeting-1',
    });
    // Beide Zeiten im Satz: „wir fangen jetzt um 19:30 an" allein lässt offen,
    // ob sich überhaupt etwas verschoben hat.
    expect(notify.mock.calls[0][0].payload.body).toBe(
      'Der Hauskreis am 4. August fängt jetzt um 19:30 an, nicht um 18:00.',
    );
  });

  it('lässt die Person aus, die es geändert hat', async () => {
    const { service, personFindMany } = setup();

    await service.announceTimeChange('meeting-1', 1080, 'niko');

    expect(personFindMany.mock.calls[0][0].where).toMatchObject({
      hauskreisId: 'hk-1',
      active: true,
      id: { not: 'niko' },
    });
  });

  it('schweigt für einen Abend, der nicht der nächste ist', async () => {
    const { service, notify } = setup({ nextId: 'meeting-0' });

    await expect(
      service.announceTimeChange('meeting-1', 1080, 'niko'),
    ).resolves.toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('schweigt für einen abgesagten Abend', async () => {
    const { service, notify } = setup({
      meeting: {
        id: 'meeting-1',
        hauskreisId: 'hk-1',
        date: upcoming,
        title: null,
        status: MeetingStatus.CANCELLED,
        startMinutes: 1170,
      },
    });

    await expect(
      service.announceTimeChange('meeting-1', 1080, 'niko'),
    ).resolves.toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it('räumt den Merkposten weg, damit die zweite Verschiebung ankommt', async () => {
    const { service, logDeleteMany } = setup();

    await service.announceTimeChange('meeting-1', 1080, 'niko');

    expect(logDeleteMany.mock.calls[0][0].where).toEqual({
      type: NotificationType.MEETING_TIME_CHANGED,
      relatedMeetingId: 'meeting-1',
    });
  });

  it('nennt einen besonderen Termin bei seinem Titel', async () => {
    const { service, notify } = setup({
      meeting: {
        id: 'meeting-1',
        hauskreisId: 'hk-1',
        date: upcoming,
        title: 'Geburtstag von Mira',
        status: MeetingStatus.PLANNED,
        startMinutes: 1200,
      },
    });

    await service.announceTimeChange('meeting-1', 1080, 'niko');

    expect(notify.mock.calls[0][0].payload.body).toBe(
      'Geburtstag von Mira am 4. August fängt jetzt um 20:00 an, nicht um 18:00.',
    );
  });
});
