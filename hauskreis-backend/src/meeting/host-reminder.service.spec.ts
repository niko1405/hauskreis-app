import { HostReminderService } from './host-reminder.service';
import { MeetingReminderService } from '../notification/meeting-reminder.service';
// Type-only imports keep Jest from loading the real PrismaClient and web-push.
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationService } from '../notification/notification.service';
import type { NotificationPreferenceService } from '../notification/notification-preference.service';
import { NotificationType } from '../../generated/prisma/enums';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

type MeetingRow = {
  id: string;
  date: Date;
  hostPersonId: string | null;
  location: { name: string } | null;
};

/**
 * Runs against the real `MeetingReminderService`, only the database and the
 * push side are stubbed — the interesting part is which of the two collaborate
 * correctly, and a mocked runner would assert nothing.
 */
function setup(meetings: MeetingRow[] = []) {
  const findMany = jest.fn().mockResolvedValue(
    meetings.map((meeting) => ({
      ...meeting,
      topicId: null,
      topic: null,
      songLeaders: [],
    })),
  );
  const notify = jest
    .fn()
    .mockResolvedValue({ delivered: 1, pruned: 0, failed: 0, skipped: 0 });
  const resolveMany = jest.fn((personIds: string[]) =>
    Promise.resolve(
      new Map(personIds.map((personId) => [personId, { leadDays: 3 }])),
    ),
  );

  const service = new HostReminderService(
    new MeetingReminderService(
      { meeting: { findMany } } as unknown as PrismaService,
      { notify } as unknown as NotificationService,
      { resolveMany } as unknown as NotificationPreferenceService,
    ),
  );

  return { service, findMany, notify };
}

const meeting = (overrides: Partial<MeetingRow> = {}): MeetingRow => ({
  id: 'meeting-1',
  date: utc('2026-07-28'),
  hostPersonId: 'anna',
  location: { name: 'Bei Anna' },
  ...overrides,
});

describe('HostReminderService.sendDueReminders', () => {
  it('reminds the host within the lead-time window', async () => {
    const { service, notify } = setup([meeting()]);

    const result = await service.sendDueReminders({ now: utc('2026-07-25') });

    expect(result).toEqual({ notified: 1, skipped: 0 });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: 'anna',
        type: NotificationType.HOST_REMINDER,
        relatedMeetingId: 'meeting-1',
      }),
    );
  });

  it('stays quiet for a meeting nobody hosts', async () => {
    // Valid state, not a gap: the Schlosspark needs no host.
    const { service, notify } = setup([meeting({ hostPersonId: null })]);

    await service.sendDueReminders({ now: utc('2026-07-25') });

    expect(notify).not.toHaveBeenCalled();
  });

  it('names the location when there is one', async () => {
    const { service, notify } = setup([meeting()]);

    await service.sendDueReminders({ now: utc('2026-07-25') });

    expect(notify.mock.calls[0][0].payload.body).toBe(
      'Am Dienstag, 28. Juli ist der Hauskreis bei dir (Bei Anna).',
    );
  });

  it('still works for a meeting without a location', async () => {
    const { service, notify } = setup([meeting({ location: null })]);

    await service.sendDueReminders({ now: utc('2026-07-25') });

    expect(notify.mock.calls[0][0].payload.body).toBe(
      'Am Dienstag, 28. Juli ist der Hauskreis bei dir.',
    );
  });
});
