import {
  HOST_REMINDER_DAYS_AHEAD,
  HostReminderService,
} from './host-reminder.service';
// Type-only imports keep Jest from loading the real PrismaClient and web-push.
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../../generated/prisma/enums';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

type MeetingRow = {
  id: string;
  date: Date;
  hostPersonId: string;
  location: { name: string } | null;
};

function setup(meetings: MeetingRow[] = []) {
  const findMany = jest.fn().mockResolvedValue(meetings);
  const notify = jest
    .fn()
    .mockResolvedValue({ delivered: 1, pruned: 0, failed: 0, skipped: 0 });

  const service = new HostReminderService(
    { meeting: { findMany } } as unknown as PrismaService,
    { notify } as unknown as NotificationService,
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
  it('reminds hosts within the lead-time window', async () => {
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

  it('spans today through the lead time, so a missed day is caught up', async () => {
    const { service, findMany } = setup();

    await service.sendDueReminders({ now: utc('2026-07-25') });

    const { gte, lte } = findMany.mock.calls[0][0].where.date;
    expect(gte).toEqual(utc('2026-07-25'));
    expect(
      Math.round((lte.getTime() - gte.getTime()) / (24 * 60 * 60 * 1000)),
    ).toBe(HOST_REMINDER_DAYS_AHEAD);
  });

  it('leaves deduplication to the notification log', async () => {
    const { service, notify } = setup([meeting()]);
    notify.mockResolvedValue({
      delivered: 0,
      pruned: 0,
      failed: 0,
      skipped: 1,
    });

    const result = await service.sendDueReminders({ now: utc('2026-07-25') });

    expect(result).toEqual({ notified: 0, skipped: 1 });
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

  it('scopes to one group when asked', async () => {
    const { service, findMany } = setup();

    await service.sendDueReminders({
      now: utc('2026-07-25'),
      hauskreisId: 'hk-1',
    });
    expect(findMany.mock.calls[0][0].where.hauskreisId).toBe('hk-1');

    await service.sendDueReminders({ now: utc('2026-07-25') });
    expect(findMany.mock.calls[1][0].where.hauskreisId).toBeUndefined();
  });
});
