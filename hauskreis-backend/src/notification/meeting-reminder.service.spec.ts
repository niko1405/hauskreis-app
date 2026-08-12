import {
  MeetingReminderService,
  type ReminderMeeting,
} from './meeting-reminder.service';
// Type-only imports keep Jest from loading the real PrismaClient and web-push.
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationService } from './notification.service';
import type { NotificationPreferenceService } from './notification-preference.service';
import { NotificationType } from '../../generated/prisma/enums';
import { notificationDefinition } from './notification-catalog';
import { withClock } from '../meeting/group-clock.testing';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function setup(
  meetings: Partial<ReminderMeeting>[] = [],
  leadDaysByPerson: Record<string, number> = {},
) {
  const findMany = jest.fn().mockResolvedValue(
    meetings.map((meeting) => ({
      id: 'meeting-1',
      date: utc('2026-07-28'),
      hostPersonId: null,
      topicId: null,
      location: null,
      topic: null,
      songLeaders: [],
      ...meeting,
    })),
  );

  const notify = jest
    .fn()
    .mockResolvedValue({ delivered: 1, pruned: 0, failed: 0, skipped: 0 });

  const resolveMany = jest.fn((personIds: string[], type: NotificationType) => {
    const { schedule } = notificationDefinition(type);
    const fallback =
      schedule.kind === 'LEAD_TIME' ? schedule.defaultLeadDays : null;

    return Promise.resolve(
      new Map(
        personIds.map((personId) => [
          personId,
          { leadDays: leadDaysByPerson[personId] ?? fallback },
        ]),
      ),
    );
  });

  const service = withClock(
    new MeetingReminderService(
      { meeting: { findMany } } as unknown as PrismaService,
      { notify } as unknown as NotificationService,
      { resolveMany } as unknown as NotificationPreferenceService,
    ),
  );

  return { service, findMany, notify };
}

/** Stand-in for the callers; the host reminder in its simplest form. */
const hostRecipients = (meeting: ReminderMeeting) =>
  meeting.hostPersonId
    ? [
        {
          personId: meeting.hostPersonId,
          payload: { title: 'Host', body: 'Du hostest' },
        },
      ]
    : [];

const songRecipients = (meeting: ReminderMeeting) =>
  meeting.songLeaders.map((leader) => ({
    personId: leader.personId,
    payload: { title: 'Musik', body: 'Du machst die Musik' },
  }));

describe('MeetingReminderService.run', () => {
  it('scans as far as the most patient setting allows', async () => {
    const { service, findMany } = setup();

    await service.run(NotificationType.HOST_REMINDER, hostRecipients, {
      now: utc('2026-07-25'),
    });

    // Not the default lead time: somebody may have set theirs to the maximum,
    // and a window built on the default would never see their meeting.
    //
    // Je einen Tag zu weit in beide Richtungen: der Lauf deckt alle Gruppen ab,
    // und in einer anderen Zeitzone ist schon morgen oder noch gestern. Welcher
    // Abend wirklich fällig ist, entscheidet danach der Tag seiner Gruppe.
    const { gte, lte } = findMany.mock.calls[0][0].where.date;
    expect(gte).toEqual(utc('2026-07-24'));
    expect(
      Math.round((lte.getTime() - gte.getTime()) / (24 * 60 * 60 * 1000)),
    ).toBe(16);
  });

  it('holds a reminder back until the person asked for it', async () => {
    // Anna wants one day's notice; the meeting is three days out.
    const { service, notify } = setup([{ hostPersonId: 'anna' }], { anna: 1 });

    const result = await service.run(
      NotificationType.HOST_REMINDER,
      hostRecipients,
      { now: utc('2026-07-25') },
    );

    expect(result).toEqual({ notified: 0, skipped: 0 });
    expect(notify).not.toHaveBeenCalled();
  });

  it('sends once that person reaches their own lead time', async () => {
    const { service, notify } = setup([{ hostPersonId: 'anna' }], { anna: 1 });

    await service.run(NotificationType.HOST_REMINDER, hostRecipients, {
      now: utc('2026-07-27'),
    });

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: 'anna',
        type: NotificationType.HOST_REMINDER,
        relatedMeetingId: 'meeting-1',
      }),
    );
  });

  it('reminds two people about the same evening on different days', async () => {
    const { service, notify } = setup(
      [{ songLeaders: [{ personId: 'chris' }, { personId: 'niko' }] }],
      { chris: 7, niko: 1 },
    );

    await service.run(NotificationType.SONG_REMINDER, songRecipients, {
      now: utc('2026-07-24'),
    });

    expect(notify.mock.calls.map((call) => call[0].personId)).toEqual([
      'chris',
    ]);
  });

  it('leaves deduplication to the notification log', async () => {
    const { service, notify } = setup([{ hostPersonId: 'anna' }]);
    notify.mockResolvedValue({
      delivered: 0,
      pruned: 0,
      failed: 0,
      skipped: 1,
    });

    const result = await service.run(
      NotificationType.HOST_REMINDER,
      hostRecipients,
      { now: utc('2026-07-25') },
    );

    expect(result).toEqual({ notified: 0, skipped: 1 });
  });

  it('scopes to one group when asked', async () => {
    const { service, findMany } = setup();

    await service.run(NotificationType.HOST_REMINDER, hostRecipients, {
      now: utc('2026-07-25'),
      hauskreisId: 'hk-1',
    });
    expect(findMany.mock.calls[0][0].where.hauskreisId).toBe('hk-1');

    await service.run(NotificationType.HOST_REMINDER, hostRecipients, {
      now: utc('2026-07-25'),
    });
    expect(findMany.mock.calls[1][0].where.hauskreisId).toBeUndefined();
  });

  it('refuses a type that is not sent ahead of a meeting', async () => {
    const { service } = setup();

    // Guards the catalog against a caller wiring an event-driven type into a
    // lead-time job, where every send would be days early or never.
    await expect(
      service.run(NotificationType.PRAYER_BUDDY_ASSIGNED, hostRecipients),
    ).rejects.toThrow(/not a lead-time reminder/);
  });
});
