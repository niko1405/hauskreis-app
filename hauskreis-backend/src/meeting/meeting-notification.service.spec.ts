import { MeetingNotificationService } from './meeting-notification.service';
// Type-only imports keep Jest from loading the real PrismaClient and web-push.
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationService } from '../notification/notification.service';
import type { RoleSuggestionService } from '../role-suggestion/role-suggestion.service';
import { MeetingStatus, NotificationType } from '../../generated/prisma/enums';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const today = utc('2026-07-29');
const upcoming = utc('2026-08-04');
const past = utc('2026-07-21');

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(today);
});

afterEach(() => {
  jest.useRealTimers();
});

function setup(
  options: {
    meeting?: Record<string, unknown> | null;
    people?: string[];
    unlocked?: Array<{
      home: { id: string; name: string };
      residents: Array<{ id: string; name: string }>;
    }>;
  } = {},
) {
  const meetingFindUnique = jest.fn().mockResolvedValue(
    options.meeting === undefined
      ? {
          id: 'meeting-1',
          hauskreisId: 'hk-1',
          date: upcoming,
          title: null,
          status: MeetingStatus.PLANNED,
          hostPersonId: 'anna',
          locationId: 'loc-anna',
        }
      : options.meeting,
  );

  const personFindMany = jest
    .fn()
    .mockResolvedValue(
      (options.people ?? ['anna', 'chris']).map((id) => ({ id })),
    );
  const personFindUnique = jest.fn().mockResolvedValue({ name: 'Antonia' });

  const notify = jest
    .fn()
    .mockResolvedValue({ delivered: 1, pruned: 0, failed: 0, skipped: 0 });

  const findHomesUnlockedByAbsences = jest
    .fn()
    .mockResolvedValue(options.unlocked ?? []);

  // Beide Richtungen der Absage laufen über dieselbe Art; der Merkposten wird
  // deshalb vor jedem Wechsel weggeräumt, sonst verschluckt `hasBeenSent` die
  // zweite Nachricht als Dublette der ersten.
  const logDeleteMany = jest.fn().mockResolvedValue({ count: 0 });

  const service = new MeetingNotificationService(
    {
      meeting: { findUnique: meetingFindUnique },
      person: { findMany: personFindMany, findUnique: personFindUnique },
      notificationLog: { deleteMany: logDeleteMany },
    } as unknown as PrismaService,
    { notify } as unknown as NotificationService,
    { findHomesUnlockedByAbsences } as unknown as RoleSuggestionService,
  );

  return { service, notify, findHomesUnlockedByAbsences, logDeleteMany };
}

describe('announceCancellation', () => {
  it('tells the whole group', async () => {
    const { service, notify } = setup();

    await expect(service.announceCancellation('meeting-1')).resolves.toBe(2);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: 'anna',
        type: NotificationType.MEETING_CANCELLED,
        relatedMeetingId: 'meeting-1',
      }),
    );
    expect(notify.mock.calls[0][0].payload.body).toBe(
      'Der Hauskreis am Dienstag, 4. August fällt aus.',
    );
  });

  it('uses the title of a custom meeting', async () => {
    const { service, notify } = setup({
      meeting: {
        id: 'meeting-1',
        hauskreisId: 'hk-1',
        date: upcoming,
        title: 'Geburtstag von Reini',
      },
    });

    await service.announceCancellation('meeting-1');

    expect(notify.mock.calls[0][0].payload.body).toBe(
      'Geburtstag von Reini am Dienstag, 4. August fällt aus.',
    );
  });

  it('says nothing about an evening that is already over', async () => {
    // Cancelling a past meeting is bookkeeping, not news.
    const { service, notify } = setup({
      meeting: {
        id: 'meeting-1',
        hauskreisId: 'hk-1',
        date: past,
        title: null,
      },
    });

    await expect(service.announceCancellation('meeting-1')).resolves.toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });
});

/** Was `announceReleasedRoles` an die anderen geschickt hat — nicht an den Host. */
const anAlle = (notify: jest.Mock) =>
  notify.mock.calls
    .map((call) => call[0])
    .find((entry) => entry.payload.title === 'Da ist etwas offen');

describe('handleDecline', () => {
  it('tells the host who dropped out', async () => {
    const { service, notify } = setup();

    await service.handleDecline('meeting-1', 'antonia');

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: 'anna',
        type: NotificationType.ATTENDANCE_DECLINED,
        relatedMeetingId: 'meeting-1',
        // Without this the second drop-out would look like the first.
        relatedPersonId: 'antonia',
      }),
    );
    expect(notify.mock.calls[0][0].payload.body).toBe(
      'Antonia kann am 4. August nicht.',
    );
  });

  it('does not tell hosts they cancelled on themselves', async () => {
    const { service, notify } = setup();

    await service.handleDecline('meeting-1', 'anna');

    expect(notify).not.toHaveBeenCalled();
  });

  it('ignores a meeting that is already cancelled', async () => {
    const { service, notify } = setup({
      meeting: {
        id: 'meeting-1',
        hauskreisId: 'hk-1',
        date: upcoming,
        status: MeetingStatus.CANCELLED,
        hostPersonId: 'anna',
        locationId: null,
      },
    });

    await service.handleDecline('meeting-1', 'antonia');

    expect(notify).not.toHaveBeenCalled();
  });

  it('invites a home that only fits the reduced group', async () => {
    const { service, notify } = setup({
      meeting: {
        id: 'meeting-1',
        hauskreisId: 'hk-1',
        date: upcoming,
        status: MeetingStatus.PLANNED,
        hostPersonId: null,
        locationId: null,
      },
      unlocked: [
        {
          home: { id: 'loc-sofie', name: 'Bei Sofie' },
          residents: [{ id: 'sofie', name: 'Sofie' }],
        },
      ],
    });

    await service.handleDecline('meeting-1', 'antonia');

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: 'sofie',
        type: NotificationType.HOST_CAPACITY_UNLOCKED,
        relatedMeetingId: 'meeting-1',
      }),
    );
    expect(notify.mock.calls[0][0].payload.body).toBe(
      'Am 4. August haben genug abgesagt, dass der Hauskreis bei euch (Bei Sofie) stattfinden könnte.',
    );
  });

  it('offers nothing once the evening has a host', async () => {
    // The message fills a gap; there is no gap left to fill.
    const { service, findHomesUnlockedByAbsences } = setup();

    await service.handleDecline('meeting-1', 'antonia');

    expect(findHomesUnlockedByAbsences).not.toHaveBeenCalled();
  });

  /**
   * Der Zweig an **alle** — nicht nur an den Gastgeber. Er ist die einzige
   * Absage, die etwas zu tun übrig lässt.
   */
  describe('was frei geworden ist', () => {
    const nichts = {
      host: false,
      song: false,
      testimony: false,
      topic: false,
    };

    it('sagt es auch, wenn nur das Thema frei wurde', async () => {
      // Der Fall, der vorher stumm blieb: `describeReleased` zählte Gastgeber,
      // Musik und Testimony auf, aber nicht das Thema. Wer nur dafür zugeteilt
      // war und absagte, ließ `what` auf `null` fallen — und dieser ganze
      // Zweig schwieg.
      const { service, notify } = setup();

      await service.handleDecline('meeting-1', 'antonia', {
        ...nichts,
        topic: true,
      });

      expect(anAlle(notify)?.payload.body).toBe(
        'Antonia kann am 4. August nicht. Das Thema ist wieder frei.',
      );
    });

    it('zählt mehrere ohne Artikel auf', async () => {
      const { service, notify } = setup();

      await service.handleDecline('meeting-1', 'antonia', {
        ...nichts,
        host: true,
        topic: true,
      });

      expect(anAlle(notify)?.payload.body).toBe(
        'Antonia kann am 4. August nicht. Gastgeber-Platz und Thema sind wieder frei.',
      );
    });

    it('schweigt, wenn nichts frei wurde', async () => {
      const { service, notify } = setup();

      await service.handleDecline('meeting-1', 'antonia', nichts);

      expect(anAlle(notify)).toBeUndefined();
    });
  });
});
